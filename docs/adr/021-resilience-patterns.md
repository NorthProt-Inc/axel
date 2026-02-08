# ADR-021: Resilience Patterns (Lifecycle, Shutdown, Consolidation)

> Status: PROPOSED
> Date: 2026-02-08
> Author: Architecture Division

## Context

v2.0 plan은 정적 구조(인터페이스, 스키마, 테이블)를 상세히 문서화했으나, 동적 행동(상태 전이, 에러 흐름, 종료 순서, 통합 알고리즘)이 미명세였다 (QA-007 Root Cause RC-1).

구체적으로:
- **ERR-039**: Memory consolidation (L2→L3) 알고리즘 미정의
- **ERR-040**: Graceful shutdown 순서 미정의 (SIGTERM 처리)
- **ERR-041**: Session lifecycle에 state machine 없음
- **ERR-043**: Circuit Breaker에 state machine 없음

## Decision

### 1. Session State Machine (ERR-041)

```
                    ┌─────────────┐
                    │ initializing│
                    └──────┬──────┘
                           │ session created
                           ▼
        ┌──────────────► active ◄──────────────┐
        │                  │                    │
        │     message      │ message received   │ tool done
        │     received     ▼                    │
        │              thinking ────────► tool_executing
        │                  │                    │
        │                  │ response done       │
        │                  ▼                    │
        │              active ──────────────────┘
        │                  │
        │                  │ inactivity timeout / explicit end
        │                  ▼
        │            summarizing
        │                  │
        │                  │ summary saved
        │                  ▼
        │               ending
        │                  │
        │                  │ cleanup done
        │                  ▼
        │               ended
        └───────────── (new message → new session)
```

**State Transitions:**

| From | To | Trigger | Action |
|------|-----|---------|--------|
| initializing | active | Session created | Load working memory from Redis/PG |
| active | thinking | Message received | Send to ReAct Loop |
| thinking | tool_executing | LLM requests tool | Execute tool (with timeout) |
| tool_executing | thinking | Tool result received | Add result to messages, continue ReAct |
| thinking | active | Response complete | Send response to channel |
| active | summarizing | Inactivity timeout (30min) or explicit end | Trigger session summary generation |
| summarizing | ending | Summary saved to PG | Begin cleanup |
| ending | ended | Working memory flushed, Redis keys cleaned | Session complete |
| ended | initializing | New message from same user | Create new session |

### 2. Graceful Shutdown Sequence (ERR-040)

```typescript
// apps/axel/src/lifecycle.ts

async function gracefulShutdown(container: Container): Promise<void> {
  const SHUTDOWN_TIMEOUT_MS = 30_000;
  const shutdownTimer = setTimeout(() => process.exit(1), SHUTDOWN_TIMEOUT_MS);

  // Phase 1: Stop accepting new work (immediate)
  container.gateway.stopAccepting();        // HTTP/WS: reject new connections
  for (const channel of container.channels) {
    await channel.stop();                    // Channel adapters: disconnect gracefully
  }

  // Phase 2: Drain in-flight requests (up to 15s)
  await container.gateway.drainConnections(15_000);

  // Phase 3: Flush state (up to 10s)
  for (const session of container.sessionManager.activeSessions()) {
    await session.forceEnd();               // Summarize + flush working memory → PG
  }
  await container.redis.quit();             // Redis connection close

  // Phase 4: Close connections
  await container.pgPool.end();             // PostgreSQL pool drain

  clearTimeout(shutdownTimer);
  process.exit(0);
}

// Signal handlers
process.on("SIGTERM", () => gracefulShutdown(container));
process.on("SIGINT", () => gracefulShutdown(container));
```

**Shutdown Order:**

1. **Stop new work** → gateway reject, channels disconnect
2. **Drain in-flight** → active ReAct loops complete (max 15s)
3. **Flush state** → working memory → PG, session summaries saved
4. **Close connections** → Redis, PostgreSQL pool drain
5. **Hard exit** → 30s timeout 안전장치

### 3. Memory Consolidation Algorithm (ERR-039)

L2 (Episodic) → L3 (Semantic) 통합:

```typescript
// packages/core/src/memory/consolidation.ts

interface ConsolidationConfig {
  readonly intervalHours: number;        // 6 (config.memory.consolidationIntervalHours)
  readonly batchSize: number;            // 50
  readonly minTurnsForSummary: number;   // 5
  readonly summaryModel: string;         // Gemini Flash (빠르고 저렴)
}

async function consolidateEpisodicToSemantic(
  sessions: SessionRepository,
  memories: MemoryRepository,
  embedding: EmbeddingService,
  llm: LlmProvider,
  config: ConsolidationConfig,
): Promise<ConsolidationResult> {
  // 1. 종료된 세션 중 미통합 세션 조회
  const unconsolidated = await sessions.findUnconsolidated(config.batchSize);

  let stored = 0;
  let skipped = 0;

  for (const session of unconsolidated) {
    // 2. 최소 턴 수 미달 → skip
    if (session.turnCount < config.minTurnsForSummary) {
      await sessions.markConsolidated(session.sessionId);
      skipped++;
      continue;
    }

    // 3. 세션 메시지를 LLM에게 전달하여 핵심 사실/인사이트 추출
    const extracted = await llm.chat({
      messages: [{ role: "system", content: EXTRACTION_PROMPT }, { role: "user", content: formatSession(session) }],
      model: config.summaryModel,
    });

    // 4. 추출된 각 사실/인사이트를 Memory로 변환
    const newMemories = parseExtractedMemories(extracted);

    for (const mem of newMemories) {
      // 5. 기존 유사 기억이 있는지 벡터 검색
      const similar = await memories.search(mem.content, 1);
      if (similar.length > 0 && similar[0].score > 0.92) {
        // 중복 → 기존 기억의 importance/accessCount 강화
        await memories.reinforce(similar[0].memory.uuid, {
          importanceBoost: 0.1,
          channelId: session.channelId,
        });
      } else {
        // 신규 → embedding 생성 후 저장
        const vector = await embedding.embed(mem.content);
        await memories.store({ ...mem, embedding: vector });
        stored++;
      }
    }

    // 6. 세션을 통합 완료로 표시
    await sessions.markConsolidated(session.sessionId);
  }

  return { processed: unconsolidated.length, stored, skipped, duplicatesMerged: unconsolidated.length - stored - skipped };
}

const EXTRACTION_PROMPT = `You are a memory extraction engine. From the conversation below, extract:
1. Facts the user shared (name, preferences, projects, relationships)
2. Insights or decisions made
3. Preferences expressed (likes, dislikes, communication style)

Output as JSON array: [{"content": "...", "type": "fact|preference|insight", "importance": 0.0-1.0}]
Only include information worth remembering long-term. Skip greetings and small talk.`;
```

**Consolidation Trigger:**
- Cron: 매 `consolidationIntervalHours` (6시간)
- Session end: 세션 종료 시 즉시 consolidation 큐에 추가
- Manual: API 호출로 수동 트리거 가능

### 4. Circuit Breaker State Machine (ERR-043)

```
        ┌─────────┐
        │  CLOSED  │──── failure count >= threshold ────┐
        │ (normal) │                                     │
        └────┬─────┘                                     ▼
             │                                    ┌──────────┐
             │ success                            │   OPEN    │
             │                                    │ (blocked) │
             │                                    └─────┬─────┘
             │                                          │
             │                                 cooldown elapsed
             │                                          │
             │                                          ▼
             │                                   ┌────────────┐
             └─────────────── success ───────────│ HALF_OPEN  │
                                                 │ (1 probe)  │
                              failure ───────────└────────────┘
                                │                       ▲
                                └───────────────────────┘
```

```typescript
interface CircuitBreakerState {
  readonly state: "closed" | "open" | "half_open";
  readonly failureCount: number;
  readonly lastFailure: Date | null;
  readonly openedAt: Date | null;
}

interface CircuitBreakerConfig {
  readonly failureThreshold: number;     // 5
  readonly cooldownMs: number;           // 60_000 (1 minute)
  readonly halfOpenMaxProbes: number;    // 1
}
```

## Alternatives Considered

| Option | Pros | Cons |
|--------|------|------|
| **Explicit state machines (선택)** | 명확한 상태 전이, 테스트 가능, 디버깅 용이 | 구현 코드 증가 |
| Implicit state (boolean flags) | 간단 | 불가능한 상태 조합, 디버깅 어려움 |
| xstate (state machine library) | 시각화, 직렬화, 검증 | 추가 의존성, 학습 비용 |
| Actor model (Akka-style) | 동시성 안전 | TypeScript 생태계 미성숙, 과도한 추상화 |

## Consequences

### Positive
- 모든 동적 행동이 명시적 상태 전이로 정의 → 불가능한 상태 조합 방지
- Graceful shutdown으로 데이터 유실 없음 (working memory → PG flush)
- Memory consolidation이 자동으로 단기 기억을 장기 기억으로 승격
- Circuit Breaker 상태가 명확하여 디버깅 용이

### Negative
- State machine 구현 및 테스트 비용
- Consolidation의 LLM 호출 비용 (Gemini Flash: 세션당 ~$0.001)
- 30s shutdown timeout으로 인해 매우 긴 ReAct loop은 강제 중단될 수 있음

## References

- Plan v2.0 Section 4 Layer 7: Orchestration Engine
- ADR-003: Redis Working Memory (shadow write)
- ADR-013: 6-Layer Memory Architecture
- ADR-020: Error Taxonomy
- ERR-039: Memory consolidation unspecified
- ERR-040: Graceful shutdown unspecified
- ERR-041: Session lifecycle no state machine
- ERR-043: Circuit Breaker no state machine
