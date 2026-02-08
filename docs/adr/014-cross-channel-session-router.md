# ADR-014: Cross-Channel Session Router

> Status: PROPOSED
> Date: 2026-02-07
> Author: Architecture Division

## Context

axnmihn은 단일 채널(Telegram DM)에서만 작동했다. Axel은 Discord, Telegram, CLI, WebChat 등 복수 채널에서 동시에 사용되며, **채널 간 대화 맥락이 끊기지 않아야 한다**.

핵심 시나리오:
1. Mark가 Discord에서 코드 리뷰를 논의 → 30분 후 Telegram에서 "아까 그거 어떻게 됐어?"
2. CLI에서 디버깅 세션 진행 중 → WebChat에서 같은 이슈의 로그를 공유
3. Discord에서 시작한 연구 요청 → Axel이 결과를 Telegram으로 전송 (사용자가 현재 활성 채널 기준)

axnmihn에는 이 개념 자체가 없었다:
- 세션은 Telegram session ID에 1:1 바인딩
- 다른 채널에서 같은 대화를 이어갈 방법이 없음
- Working Memory가 채널별로 분리됨

## Decision

**Unified Session** 모델을 도입한다. 하나의 사용자(userId)는 시간 기준으로 **하나의 활성 세션**을 가지며, 여러 채널이 이 세션에 연결된다.

### Core Concept: Unified Session

```
User: Mark
Active Session: session_abc123
  ├── Channel History: [discord, telegram, cli]
  ├── Working Memory: 20 turns (channel-mixed)
  │   ├── Turn 1: [discord] "이 PR 좀 봐줘"
  │   ├── Turn 2: [discord] "코드 리뷰 결과..."
  │   ├── Turn 3: [telegram] "아까 그거 어떻게 됐어?"
  │   └── Turn 4: [telegram] "리뷰 결과 요약하면..."
  └── Active Channel: telegram (가장 최근 메시지 채널)
```

### Session Lifecycle

```
[Message arrives from channel X]
        │
        ▼
┌─ Session Router ────────────────────────┐
│                                          │
│  1. Redis에서 userId의 활성 세션 조회     │
│     axel:session:{userId}                │
│                                          │
│  2. 활성 세션 존재?                       │
│     ├─ YES → 마지막 활동이 30분 이내?     │
│     │   ├─ YES → 기존 세션에 연결         │
│     │   └─ NO  → 기존 세션 종료 + 새 세션 │
│     └─ NO  → 새 세션 생성                 │
│                                          │
│  3. activeChannelId 업데이트              │
│     (현재 메시지의 채널로)                 │
│                                          │
│  4. Working Memory에서 이전 턴 로드       │
│     (채널 무관, 시간순)                    │
│                                          │
└──────────────────────────────────────────┘
        │
        ▼
[Context Assembly → ReAct Loop → Response]
        │
        ▼
[Response를 현재 활성 채널로 전송]
```

### Session Timeout Rules

| Condition | Action |
|-----------|--------|
| 마지막 활동 < 30분 | 같은 세션 유지, 채널 전환 가능 |
| 마지막 활동 30분 ~ 2시간 | 새 세션 생성, 이전 세션 요약 자동 생성 |
| 마지막 활동 > 2시간 | 새 세션 생성, 이전 세션 → Episodic Memory |
| 명시적 종료 ("세션 끝", "/end") | 즉시 세션 종료 + 요약 |

**30분 근거:**
- axnmihn 데이터 분석: Mark의 평균 대화 간격 ~15분, 새 주제 시작 시 ~45분 간격
- 30분은 "같은 맥락" vs "새 대화"의 자연스러운 분기점

### Redis State

```
# 사용자별 활성 세션 (단일)
HASH axel:session:{userId}
  sessionId:       "session_abc123"
  activeChannelId: "telegram"
  channelHistory:  '["discord","telegram"]'
  startedAt:       "2026-02-07T14:00:00Z"
  lastActivityAt:  "2026-02-07T14:30:00Z"
EXPIRE 7200  # 2시간 후 자동 만료 (최대 세션 수명)

# Working Memory는 ADR-013 Layer 1 참조
LIST axel:working:{userId}:turns
```

### Channel Awareness in Responses

Session Router는 응답 생성 시 **채널 컨텍스트를 LLM에 전달**한다:

```typescript
// Context Assembly에 주입되는 채널 메타데이터
interface ChannelContext {
  readonly currentChannel: string;       // "telegram"
  readonly previousChannel: string | null; // "discord"
  readonly channelSwitched: boolean;     // true (직전 턴과 다른 채널)
  readonly sessionChannels: readonly string[]; // ["discord", "telegram"]
}
```

이를 통해 LLM은:
- "아까 Discord에서 얘기한 PR인데..." 같은 맥락 참조를 이해
- 채널 전환 시 자연스러운 맥락 연결 ("Discord에서 논의한 건에 대해...")
- 채널별 톤 적응 (PersonaEngine의 CHANNEL_ADAPTATIONS 참조)

### Proactive Channel Selection

Axel이 자율적으로 메시지를 보내야 할 때 (연구 완료 알림 등), **활성 채널 기준으로 전송**:

```typescript
interface ProactiveMessageTarget {
  resolveTarget(userId: string): Promise<{
    channelId: string;
    reason: "active_channel" | "last_active" | "preferred";
  }>;
}
```

우선순위:
1. **Active Channel**: 현재 세션이 활성이면 해당 채널
2. **Last Active**: 세션이 만료되었으면 마지막 사용 채널
3. **Preferred**: 사용자 설정 (persona preferences)

### TypeScript Interfaces

```typescript
interface SessionRouter {
  // 메시지 도착 시 세션 해결
  resolveSession(userId: string, channelId: string): Promise<ResolvedSession>;

  // 세션 명시적 종료
  endSession(sessionId: string): Promise<SessionSummary>;

  // 활성 세션 조회 (proactive messaging용)
  getActiveSession(userId: string): Promise<UnifiedSession | null>;

  // 세션 통계
  getSessionStats(sessionId: string): Promise<SessionStats>;
}

interface ResolvedSession {
  readonly session: UnifiedSession;
  readonly isNew: boolean;              // 새로 생성된 세션인지
  readonly channelSwitched: boolean;    // 채널이 전환되었는지
  readonly previousSession: SessionSummary | null; // 직전 세션 요약 (새 세션일 때)
}

interface UnifiedSession {
  readonly sessionId: string;
  readonly userId: string;
  readonly activeChannelId: string;
  readonly channelHistory: readonly string[];
  readonly startedAt: Date;
  readonly lastActivityAt: Date;
  readonly turnCount: number;
}

interface SessionSummary {
  readonly sessionId: string;
  readonly summary: string;            // LLM 생성 요약
  readonly keyTopics: readonly string[];
  readonly emotionalTone: string;
  readonly channels: readonly string[];
  readonly turnCount: number;
  readonly duration: number;           // seconds
}

interface SessionStats {
  readonly totalTurns: number;
  readonly channelBreakdown: Readonly<Record<string, number>>; // {"discord": 5, "telegram": 3}
  readonly avgResponseTime: number;    // ms
  readonly toolsUsed: readonly string[];
}
```

### Error Cases

```typescript
type SessionError =
  | { type: "REDIS_UNAVAILABLE"; fallback: "create_ephemeral_session" }
  | { type: "SESSION_CORRUPTED"; action: "force_new_session" }
  | { type: "CONCURRENT_MODIFICATION"; action: "retry_with_lock" }
  | { type: "CHANNEL_NOT_REGISTERED"; channelId: string };
```

**Redis 장애 시 fallback:**
- Ephemeral session을 메모리에 생성 (Redis 없이 동작)
- PostgreSQL에만 직접 기록
- Redis 복구 후 자동 동기화

**동시 접근:**
- 같은 userId가 2개 채널에서 동시에 메시지를 보내는 경우
- Redis WATCH + MULTI/EXEC로 optimistic locking
- 충돌 시 먼저 도착한 메시지 우선, 나중 메시지는 같은 세션에 순차 처리

## Alternatives Considered

| Option | Pros | Cons |
|--------|------|------|
| **채널별 독립 세션** (axnmihn 방식) | 단순, 채널 간 간섭 없음 | 맥락 단절, "아까 그거" 불가, Axel의 핵심 가치 상실 |
| **채널별 세션 + 수동 연결** | 사용자가 명시적으로 세션 연결 | UX 번거로움, 자연스러운 대화 흐름 방해 |
| **Unified Session (선택)** | 자연스러운 채널 전환, 맥락 보존 | 동시 접근 처리 복잡, Redis 의존성 |
| **Server-Side Session (DB only)** | Redis 불필요, 단순 아키텍처 | Latency 증가 (매 요청마다 DB 조회), pub/sub 불가 |

### Unified Session 선택 근거

1. **사용자 경험**: "아까 Discord에서 한 얘기" → Telegram에서 즉시 이어감. 이것이 Axel의 핵심 차별점
2. **Single-user 단순화**: Mark 1명이므로 "같은 userId = 같은 세션"이 자연스러움
3. **Redis 활용**: ADR-003에서 이미 Redis를 Working Memory에 사용. Session state도 같은 Redis에 저장하면 추가 인프라 비용 없음
4. **Proactive messaging**: Axel이 자율적으로 메시지를 보낼 때 "어느 채널로?" 결정 가능

## Consequences

### Positive

- v2.0 plan 성공 기준 "Discord에서 시작한 대화를 Telegram에서 이어감" 달성
- Working Memory가 채널 무관하게 통합되어, 맥락 품질 향상
- Proactive messaging의 채널 선택이 자연스러움
- Session 통계로 채널별 사용 패턴 분석 가능

### Negative

- Redis 장애 시 세션 라우팅 degraded (fallback 존재하지만 일부 기능 제한)
- 동시 다채널 메시지 처리 시 순서 보장 필요 (Redis lock overhead)
- 30분 타임아웃이 모든 상황에 적합하지 않을 수 있음 (추후 adaptive timeout 검토)

### Dependencies

- ADR-003: Redis 인프라
- ADR-013: 6-Layer Memory (Working Memory = Layer 1)
- Channel Adapters (Layer 8): 각 채널이 userId를 일관되게 제공해야 함

### userId Mapping

Multi-channel에서 "같은 사용자"를 식별하기 위한 매핑:

```typescript
// Phase 0: 단순 매핑 (single-user)
const USER_CHANNEL_MAP: Readonly<Record<string, string>> = {
  "discord:123456789": "mark",
  "telegram:987654321": "mark",
  "cli:local": "mark",
  "webchat:session_xyz": "mark",
};

// Phase 4: Multi-user 확장 시 DB 기반 매핑으로 전환
```

Phase 0에서는 config에 하드코딩 (single-user), Phase 4에서 DB 테이블로 전환.

## References

- v2.0 Plan Section 4, Layer 7 (Orchestration Engine)
- v2.0 Plan Section 9 성공 기준: "Discord에서 시작한 대화를 Telegram에서 이어감"
- ADR-003: Redis for working memory + pub/sub
- ADR-009: Channel adapter interface
- ADR-013: 6-Layer Memory Architecture (companion ADR)
