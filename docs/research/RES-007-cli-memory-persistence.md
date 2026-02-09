# RES-007: CLI 세션 종료 후 기억 상실 원인 분석

> Date: 2026-02-08
> Author: Research Division
> Related: ADR-003 (Redis Working Memory), ADR-013 (6-layer Memory), ADR-014 (Session Router)

## Question

CLI 채널에서 대화한 후 프로세스를 종료하면 다음 세션에서 이전 대화를 기억하지 못하는 문제가 발생합니다. 메모리 persistence 경로에서 어느 단계가 누락되었는지 추적합니다.

## Methodology

코드베이스 전체 추적:
1. InboundHandler → SessionRouter → Memory Layers 연결 흐름 분석
2. `gracefulShutdown` Phase 3 (메모리 flush) 로직 검증
3. Working Memory (M1), Episodic Memory (M2), Semantic Memory (M3) 저장 경로 추적
4. CLI 채널 종료 이벤트 핸들링 확인
5. 다음 세션 시작 시 메모리 로드 경로 추적

## Findings

### 1. 메모리 저장 체인 (정상 동작 경로)

#### 1.1 메시지 처리 중 저장 (Runtime)

**InboundHandler** (`packages/core/src/orchestrator/inbound-handler.ts:72-110`)
```typescript
async (message: InboundMessage, send: SendCallback): Promise<void> => {
  // 1. Resolve session
  const resolved = await sessionRouter.resolveSession(userId, channelId);

  // 2-5. Context assembly + ReAct loop (LLM 응답 생성)
  const responseText = await consumeReactStream(reactLoop(...));

  // 6. Send response
  await send(userId, { content: responseText, ... });

  // 7. Update session activity
  await sessionRouter.updateActivity(resolved.session.sessionId);
}
```

**SessionRouter** (`packages/core/src/orchestrator/session-router.ts:59-62`)
```typescript
async updateActivity(sessionId: string): Promise<void> {
  await this.store.updateActivity(sessionId);  // PgSessionStore로 위임
}
```

**PgSessionStore** (`packages/infra/src/db/pg-session-store.ts:76-83`)
```typescript
async updateActivity(sessionId: string): Promise<void> {
  await this.pool.query(
    `UPDATE sessions
     SET last_activity_at = NOW(), turn_count = turn_count + 1
     WHERE session_id = $1`,
    [sessionId],
  );
}
```

**문제**: `InboundHandler`는 **메시지를 메모리에 저장하지 않습니다**. Session의 `last_activity_at`과 `turn_count`만 업데이트합니다.

#### 1.2 Working Memory 저장 (M1)

**RedisWorkingMemory** (`packages/infra/src/cache/redis-working-memory.ts:50-77`)

`pushTurn()` 호출 경로가 **현재 구현에 존재하지 않습니다**. `InboundHandler`는 Working Memory에 Turn을 저장하지 않습니다.

설계상 정상 흐름:
```typescript
async pushTurn(userId: string, turn: Turn): Promise<void> {
  // 1. PG-first write (source of truth)
  await this.pg.query('INSERT INTO messages (turn_id, session_id, ...) VALUES ...');

  // 2. Redis cache update (fire-and-forget)
  if (!this.redisState.isOpen) {
    await this.redis.rpush(`axel:working:${userId}:turns`, JSON.stringify(turn));
    await this.redis.ltrim(key, -MAX_TURNS, -1);  // MAX_TURNS=20 유지
    await this.redis.expire(key, TTL_SECONDS);     // TTL=3600s
  }
}
```

#### 1.3 Episodic Memory 저장 (M2)

**PgEpisodicMemory** (`packages/infra/src/db/pg-episodic-memory.ts:41-57`)

`addMessage()` 호출 경로가 **현재 구현에 존재하지 않습니다**.

설계상 정상 흐름:
```typescript
async addMessage(sessionId: string, message: MessageRecord): Promise<void> {
  await this.pool.query(
    `INSERT INTO messages (session_id, role, content, channel_id, timestamp, token_count)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [sessionId, message.role, message.content, ...]
  );
  await this.pool.query(
    'UPDATE sessions SET turn_count = turn_count + 1 WHERE session_id = $1',
    [sessionId]
  );
}
```

#### 1.4 Semantic Memory 저장 (M3)

**PgSemanticMemory** (`packages/infra/src/db/pg-semantic-memory.ts:27-44`)

`store()` 호출 경로가 **현재 구현에 존재하지 않습니다**.

설계상 정상 흐름:
```typescript
async store(newMemory: NewMemory): Promise<string> {
  const embeddingStr = float32ArrayToPgVector(newMemory.embedding);
  await this.pool.query(
    `INSERT INTO memories (content, memory_type, importance, embedding, ...)
     VALUES ($1, $2, $3, $4, ...)
     RETURNING uuid`,
    [newMemory.content, newMemory.memoryType, ...]
  );
}
```

### 2. Graceful Shutdown 메모리 Flush 체인

**main.ts** (`apps/axel/src/main.ts:84-86`)
```typescript
process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());  // Ctrl+C
```

**lifecycle.ts** (`apps/axel/src/lifecycle.ts:110-139`)
```typescript
export async function gracefulShutdown(container: ShutdownableContainer): Promise<void> {
  // Phase 1: Stop channels
  for (const channel of container.channels) {
    await channel.stop();  // CliChannel.stop() 호출
  }

  // Phase 3: Flush state
  await container.workingMemory.flush('*');  // ⚠️ 문제 지점

  // Phase 4: Close connections
  await container.redis.quit();
  await container.pgPool.end();
}
```

**RedisWorkingMemory.flush()** (`packages/infra/src/cache/redis-working-memory.ts:180-216`)
```typescript
async flush(userId: string): Promise<void> {
  // Redis에서 캐시된 turns 읽기
  const cached = await this.redis.lrange(turnsKey, 0, -1);

  if (cached.length > 0) {
    // Batch insert to PG (idempotent — PG-first means most are already there)
    for (const serialized of cached) {
      const turn = JSON.parse(serialized) as Turn;
      await this.pg.query(
        'INSERT INTO messages (...) VALUES (...) ON CONFLICT DO NOTHING',
        [turn.turnId, userId, turn.role, turn.content, ...]
      );
    }
  }

  // Redis 캐시 삭제
  await this.redis.del(turnsKey);
  await this.redis.del(summaryKey);
}
```

**문제 1**: `flush('*')` 호출 시 `userId='*'`로 전달되는데, 실제 유저 ID 목록을 조회하는 로직이 없습니다.

**문제 2**: `flush()` 내부 로직은 정상이지만, **Redis에 저장된 turns가 없으면** (= `pushTurn()` 호출 누락) flush 대상이 없습니다.

### 3. CLI 채널 종료 이벤트

**CliChannel** (`packages/channels/src/cli/cli-channel.ts:88-96`)
```typescript
async stop(): Promise<void> {
  this.started = false;
  this.rl?.close();  // readline interface 종료
  this.rl = null;
}
```

**문제**: CLI 채널은 `stop()` 시 아무런 메모리 저장 로직을 수행하지 않습니다. `endSession()` 호출도 없습니다.

### 4. 세션 종료 (Session End) 경로

**SessionRouter.endSession()** (`packages/core/src/orchestrator/session-router.ts:74-77`)
```typescript
async endSession(sessionId: string): Promise<SessionSummary> {
  return this.store.end(sessionId);
}
```

**PgSessionStore.end()** (`packages/infra/src/db/pg-session-store.ts:146-171`)
```typescript
async end(sessionId: string): Promise<SessionSummary> {
  const result = await this.pool.query(
    `UPDATE sessions
     SET ended_at = NOW()
     WHERE session_id = $1
     RETURNING session_id, summary, key_topics, ...`,
    [sessionId]
  );
  // SessionSummary 반환
}
```

**문제**: `endSession()` 호출 경로가 **CLI 채널에 존재하지 않습니다**. Gateway의 `POST /api/v1/session/end` 엔드포인트에만 존재합니다 (`packages/gateway/src/route-handlers.ts:85`).

### 5. 다음 세션 메모리 로드 경로

**ContextAssembler** (`packages/core/src/context/assembler.ts`)

`assemble()` 호출 시 `ContextDataProvider`를 통해 메모리 조회:

```typescript
// packages/core/src/context/types.ts:28-35
export interface ContextDataProvider {
  getWorkingMemory(userId: string, limit: number): Promise<readonly Turn[]>;
  searchSemantic(query: string, limit: number): Promise<readonly Memory[]>;
  traverseGraph(entityId: string, depth: number): Promise<readonly Entity[]>;
  getSessionArchive(userId: string, days: number): Promise<readonly SessionSummary[]>;
  getStreamBuffer(userId: string): Promise<readonly StreamEvent[]>;
  getMetaMemory(userId: string): Promise<readonly string[]>;
  getToolDefinitions(): readonly ToolDefinition[];
}
```

**container.ts** (`apps/axel/src/container.ts:150-188`)

`MemoryContextDataProvider` 구현:
```typescript
async getWorkingMemory(userId: string, limit: number) {
  return this.wm.getTurns(userId, limit);  // RedisWorkingMemory 또는 PG fallback
}

async getSessionArchive(userId: string, _days: number) {
  return this.em.getRecentSessions(userId, 10);  // PgEpisodicMemory
}
```

**정상 동작 가정**: 만약 메시지가 정상적으로 저장되었다면, `getTurns()`는 Redis cache miss 시 PG에서 조회합니다 (`packages/infra/src/cache/redis-working-memory.ts:94-114`).

## ROOT CAUSE 종합 분석

### Primary Issue: 메모리 저장 호출 누락

**InboundHandler는 메시지를 메모리에 저장하지 않습니다.**

현재 `InboundHandler` (`packages/core/src/orchestrator/inbound-handler.ts`)는:
1. ✅ Session 해결 (`SessionRouter.resolveSession`)
2. ✅ Context 조립 (`ContextAssembler.assemble`)
3. ✅ ReAct loop 실행 (LLM 응답 생성)
4. ✅ 응답 전송 (`send`)
5. ✅ 세션 활동 업데이트 (`updateActivity`)

**누락된 단계**:
- ❌ **User message를 Working Memory에 저장** (`WorkingMemory.pushTurn()`)
- ❌ **User message를 Episodic Memory에 저장** (`EpisodicMemory.addMessage()`)
- ❌ **Assistant message를 Working Memory에 저장**
- ❌ **Assistant message를 Episodic Memory에 저장**
- ❌ **중요한 대화 내용을 Semantic Memory에 저장** (`SemanticMemory.store()`)

### Secondary Issues

1. **CLI 채널 종료 시 `endSession()` 미호출**
   - `CliChannel.stop()`은 readline interface만 종료하고 세션을 종료하지 않습니다.
   - 세션이 `ended_at IS NULL` 상태로 남아 있습니다.

2. **`gracefulShutdown`의 `flush('*')` 무의미**
   - `userId='*'` 파라미터는 실제 유저 목록을 순회하지 않습니다.
   - `flush()`가 정상 동작해도, **저장된 turns가 없으면** (= `pushTurn()` 미호출) flush 대상이 없습니다.

3. **Redis cache TTL (3600s) 만료**
   - 설령 메모리가 Redis에 저장되더라도, 1시간 후 자동 삭제됩니다.
   - PG-first write가 없으면 Redis cache 삭제 후 데이터 손실 발생.

## 해결 방안 (Recommended Implementation)

### Option A: InboundHandler에 메모리 저장 로직 추가 (Recommended)

**장점**:
- 현재 아키텍처와 완전히 일치 (ADR-013 6-layer memory)
- 모든 채널에 동일하게 적용 (CLI, Discord, Telegram 모두 해결)
- 메시지 처리 실패 시 메모리 저장도 실패 → 일관성 보장

**단점**:
- InboundHandler 복잡도 증가

**구현 수정 위치** (`packages/core/src/orchestrator/inbound-handler.ts`):

```typescript
export function createInboundHandler(deps: InboundHandlerDeps) {
  const { sessionRouter, workingMemory, episodicMemory, ... } = deps;

  return async (message: InboundMessage, send: SendCallback): Promise<void> => {
    const { userId, channelId, content } = message;

    try {
      // 1. Resolve session
      const resolved = await sessionRouter.resolveSession(userId, channelId);
      const sessionId = resolved.session.sessionId;

      // 2. Store user message to memory
      const userTurn: Turn = {
        turnId: Date.now(),  // 또는 resolved.session.turnCount + 1
        role: 'user',
        content,
        channelId,
        timestamp: message.timestamp,
        tokenCount: await tokenCounter.count(content),
      };

      await Promise.all([
        workingMemory.pushTurn(userId, userTurn),
        episodicMemory.addMessage(sessionId, {
          role: 'user',
          content,
          channelId,
          timestamp: message.timestamp,
          tokenCount: userTurn.tokenCount,
        }),
      ]);

      // 3-5. Context assembly + ReAct loop
      const responseText = await consumeReactStream(reactLoop(...));

      // 6. Store assistant message to memory
      const assistantTurn: Turn = {
        turnId: Date.now() + 1,
        role: 'assistant',
        content: responseText,
        channelId,
        timestamp: new Date(),
        tokenCount: await tokenCounter.count(responseText),
      };

      await Promise.all([
        workingMemory.pushTurn(userId, assistantTurn),
        episodicMemory.addMessage(sessionId, {
          role: 'assistant',
          content: responseText,
          channelId,
          timestamp: assistantTurn.timestamp,
          tokenCount: assistantTurn.tokenCount,
        }),
      ]);

      // 7. Send response
      await send(userId, { content: responseText, format: 'markdown' });

      // 8. Update session activity
      await sessionRouter.updateActivity(sessionId);
    } catch (err: unknown) {
      // ... error handling
    }
  };
}
```

**필요한 의존성 추가**:
```typescript
export interface InboundHandlerDeps {
  readonly sessionRouter: SessionRouter;
  readonly workingMemory: WorkingMemory;        // 추가
  readonly episodicMemory: EpisodicMemory;      // 추가
  readonly semanticMemory: SemanticMemory;      // 추가 (선택)
  readonly tokenCounter: TokenCounter;          // 추가
  readonly contextAssembler: ContextAssembler;
  readonly llmProvider: LlmProvider;
  readonly toolExecutor: ToolExecutor;
  readonly personaEngine: PersonaEngine;
  readonly toolDefinitions?: readonly ToolDefinition[];
  readonly config?: ReActConfig;
  readonly onError?: (info: ErrorInfo) => void;
}
```

### Option B: CLI 채널에 종료 이벤트 핸들러 추가

**장점**:
- 채널별로 세션 종료 시점 제어 가능
- InboundHandler 변경 불필요

**단점**:
- 모든 채널에 동일한 로직 중복 필요
- 채널 종료 ≠ 세션 종료인 경우 (예: 멀티채널 사용자) 처리 복잡

**구현 수정 위치** (`packages/channels/src/cli/cli-channel.ts`):

```typescript
export class CliChannel implements AxelChannel {
  private sessionRouter?: SessionRouter;

  constructor(options?: CliChannelOptions & { sessionRouter?: SessionRouter }) {
    this.sessionRouter = options?.sessionRouter;
  }

  async stop(): Promise<void> {
    if (!this.started) return;

    // End session before closing readline
    if (this.sessionRouter) {
      const activeSession = await this.sessionRouter.getActiveSession(CLI_USER_ID);
      if (activeSession) {
        await this.sessionRouter.endSession(activeSession.sessionId);
      }
    }

    this.started = false;
    this.rl?.close();
    this.rl = null;
  }
}
```

### Option C: `gracefulShutdown` 개선 (Partial Solution)

**현재 문제**: `flush('*')`는 실제 유저 목록을 순회하지 않습니다.

**개선안**:
```typescript
// lifecycle.ts
export async function gracefulShutdown(container: ShutdownableContainer): Promise<void> {
  // Phase 1: Stop channels
  for (const channel of container.channels) {
    await channel.stop();
  }

  // Phase 3: Flush state for all active sessions
  const activeSessions = await container.sessionStore.getActiveSessions();  // 새 메서드 필요
  for (const session of activeSessions) {
    await container.workingMemory.flush(session.userId);
  }

  // Phase 4: Close connections
  await container.redis.quit();
  await container.pgPool.end();
}
```

**한계**: `pushTurn()` 호출이 없으면 flush 대상이 없으므로 근본적인 해결책은 아닙니다.

## Comparison Matrix

| Criterion | Option A (InboundHandler) | Option B (CLI 채널) | Option C (gracefulShutdown) |
|-----------|---------------------------|---------------------|----------------------------|
| **완전성** | ✅ 모든 메시지 저장 | ⚠️ 세션 종료만 처리 | ⚠️ 부분적 (flush만) |
| **재사용성** | ✅ 모든 채널 자동 적용 | ❌ 채널별 중복 구현 | ✅ 전역 적용 |
| **아키텍처 일치** | ✅ ADR-013 준수 | ⚠️ 채널 책임 과다 | ⚠️ lifecycle 책임 과다 |
| **구현 복잡도** | 중 (InboundHandler 30줄) | 하 (채널별 10줄) | 중 (SessionStore 확장) |
| **성능** | PG write 2회/turn | PG write 1회/세션 종료 | PG write N회/flush |
| **데이터 무결성** | ✅ 실패 시 롤백 가능 | ⚠️ 메시지 유실 가능 | ⚠️ Redis 캐시 누락 시 유실 |

## Recommendation

**Option A (InboundHandler 메모리 저장)** 를 우선 구현하고, **Option B (CLI endSession)** 를 보조적으로 추가하는 것을 권장합니다.

**이유**:
1. **Architecture Alignment**: ADR-013 6-layer memory의 원래 의도는 InboundHandler가 메모리 저장을 담당하는 것입니다 (plan §3.1 lines 933-1008).
2. **Universal Fix**: 모든 채널 (CLI, Discord, Telegram, WebChat)에 자동으로 적용됩니다.
3. **Data Integrity**: PG-first write 패턴 (ADR-003)에 완전히 일치하며, Redis는 read cache로만 사용됩니다.
4. **Testability**: InboundHandler 단위 테스트에서 메모리 저장 검증 가능.

**Implementation Priority**:
1. **P0**: Option A 구현 (`InboundHandlerDeps`에 `workingMemory`, `episodicMemory`, `tokenCounter` 추가)
2. **P1**: Option B 구현 (CLI 채널 종료 시 `endSession()` 호출)
3. **P2**: Option C 개선 (`SessionStore.getActiveSessions()` 메서드 추가, `flush()` 개선)

## Impact on Current Code

### 변경 필요 파일

1. `packages/core/src/orchestrator/inbound-handler.ts` (메모리 저장 로직 추가)
2. `packages/core/src/orchestrator/types.ts` (`InboundHandlerDeps` 확장)
3. `apps/axel/src/bootstrap-channels.ts` (DI 연결 수정)
4. `packages/channels/src/cli/cli-channel.ts` (`stop()` 메서드 수정)
5. `apps/axel/src/lifecycle.ts` (`gracefulShutdown` 개선)

### 테스트 추가 필요

1. `packages/core/tests/orchestrator/inbound-handler.test.ts` (메모리 저장 검증)
2. `packages/channels/tests/cli/cli-channel.test.ts` (세션 종료 검증)
3. Integration test: `packages/infra/tests/integration/end-to-end-memory.test.ts` (전체 체인 검증)

## Sources

- ADR-003 Redis Working Memory: `/docs/adr/003-redis-working-memory.md`
- ADR-013 Six-Layer Memory Architecture: `/docs/adr/013-six-layer-memory-architecture.md`
- ADR-014 Cross-Channel Session Router: `/docs/adr/014-cross-channel-session-router.md`
- Plan §3.1 Memory System (lines 933-1008): `/docs/plan/axel-project-plan.md`
- InboundHandler implementation: `/packages/core/src/orchestrator/inbound-handler.ts`
- RedisWorkingMemory implementation: `/packages/infra/src/cache/redis-working-memory.ts`
- PgEpisodicMemory implementation: `/packages/infra/src/db/pg-episodic-memory.ts`
- Graceful Shutdown: `/apps/axel/src/lifecycle.ts`
- CLI Channel: `/packages/channels/src/cli/cli-channel.ts`
