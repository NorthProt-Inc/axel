# ADR-003: Redis for Working Memory and Ephemeral State

> Status: ACCEPTED
> Date: 2026-02-07 (updated 2026-02-08: ERR-038 error handling, WP-4)
> Author: Architecture Division

## Context

Axel의 MISSION Principle #2는 "PostgreSQL + pgvector 단일 DB"를 명시한다. 그러나 일부 데이터 패턴은 PostgreSQL의 특성과 맞지 않는다:

1. **Working Memory**: 현재 대화 턴 (최근 20개) — 초당 수십 회 read/write, 1시간 후 만료
2. **Cross-Channel Session Router**: pub/sub 이벤트 전파 — 실시간 채널 간 알림
3. **Rate Limiting**: token bucket 카운터 — 60초 TTL
4. **Intent Classification Cache**: 동일 패턴 분류 결과 — 5분 TTL
5. **Speculative Prefetch**: 선제 로딩된 기억 — 30초 TTL

이들은 모두 **빈번한 read/write + 짧은 TTL + 영구 보존 불필요**한 데이터이다.

### PostgreSQL 단일 DB 원칙과의 관계 (ERR-010 해소)

Redis는 PostgreSQL을 대체하는 것이 아니라, **ephemeral cache layer**로 기능한다:
- 모든 Redis 데이터는 PostgreSQL에 shadow write됨 (또는 ephemeral-only로 명시)
- Redis 장애 시 PostgreSQL fallback으로 서비스 지속 가능 (latency 증가 허용)
- Redis는 "있으면 빠르고, 없어도 동작하는" 캐시

**핵심 원칙**: Redis에 저장된 모든 비즈니스 데이터는 PostgreSQL에도 존재하거나, 유실 시 재생성 가능해야 한다. Redis가 유일한 source of truth인 데이터는 존재하지 않는다.

## Decision

**Redis 7 (또는 Valkey)를 ephemeral cache + pub/sub로 사용한다.**

### Redis 데이터 구조

```
# Working Memory (현재 활성 대화)
HASH   axel:working:{userId}         # 현재 세션 메타데이터
LIST   axel:working:{userId}:turns   # 최근 N턴 (JSON)
EXPIRE 3600                          # 1시간 비활동 시 만료

# Cross-Channel Session Router
HASH   axel:session:{userId}         # 활성 세션 ID, 채널, 마지막 활동
PUBSUB axel:channel:{channelId}      # 채널별 이벤트 스트림

# Rate Limiting
STRING axel:rate:{userId}:{minute}   # Token bucket 카운터
EXPIRE 60

# Intent Classification Cache
STRING axel:intent:{hash}            # 동일 패턴의 분류 결과
EXPIRE 300                           # 5분 TTL

# Speculative Prefetch
HASH   axel:prefetch:{userId}        # 선제 로딩된 기억 맥락
EXPIRE 30                            # 30초 TTL
```

### Shadow Write 규칙

| Redis Key | PostgreSQL Shadow | Write Timing | Fallback on Redis Failure |
|-----------|-------------------|--------------|--------------------------|
| `axel:working:*:turns` | `messages` table | 매 턴 비동기 INSERT | PG direct read (최근 20턴 ORDER BY) |
| `axel:session:*` | `sessions` table | 세션 시작/종료 시 | PG direct read |
| `axel:rate:*` | 없음 (ephemeral only) | — | in-memory Map (프로세스 수명) |
| `axel:intent:*` | 없음 (cache only) | — | cache miss → 매번 분류 실행 |
| `axel:prefetch:*` | 없음 (cache only) | — | prefetch 비활성화 (on-demand only) |

### Redis Client Configuration

```typescript
// packages/infra/src/cache/redis-config.ts

const RedisConfigSchema = z.object({
  url: z.string().url(),
  maxRetriesPerRequest: z.number().int().default(3),
  retryDelayMs: z.number().int().default(100),         // 초기 재시도 대기
  retryBackoffMultiplier: z.number().default(2),       // 지수 백오프
  connectTimeoutMs: z.number().int().default(5_000),   // 연결 타임아웃
  commandTimeoutMs: z.number().int().default(1_000),   // 명령 타임아웃
  lazyConnect: z.boolean().default(true),              // 첫 명령 시 연결
});

// Circuit breaker config (ADR-021 참조)
const RedisCircuitBreakerConfig = {
  failureThreshold: 5,                                 // 5회 실패 시 open
  cooldownMs: 30_000,                                  // 30초 후 half-open
  halfOpenMaxProbes: 1,
};
```

### Redis 장애 시 Degradation Path

Redis 장애는 Circuit Breaker (ADR-021)로 감지하며, `TransientError` (ADR-020)로 분류된다.

**상태 전이:**
```
CLOSED (정상) → 5회 연속 실패 → OPEN (degraded mode)
OPEN → 30초 경과 → HALF_OPEN (1회 probe)
HALF_OPEN → 성공 → CLOSED (정상 복귀)
HALF_OPEN → 실패 → OPEN (30초 재대기)
```

**Degradation 단계:**

| 단계 | 트리거 | 동작 | 사용자 영향 |
|------|--------|------|------------|
| 1. 개별 명령 실패 | 단일 Redis 명령 타임아웃/에러 | 명령별 재시도 (최대 3회, 지수 백오프). 재시도 실패 시 PG fallback. | 없음 (latency 미미 증가) |
| 2. Circuit breaker OPEN | 5회 연속 실패 | 모든 Redis 호출 즉시 skip → PG fallback. 로그에 `redis.degraded` 경고 기록. 텔레메트리 이벤트 발행. | 응답 latency ~150ms 증가 |
| 3. Pub/sub 불가 | Redis 연결 끊김 | 채널 간 이벤트 전파 비활성화. Polling fallback (1초 간격 PG 세션 테이블 조회). | 크로스채널 알림 지연 (≤1초) |
| 4. 복구 | Circuit breaker HALF_OPEN 성공 | Redis 정상 전환. 로그에 `redis.recovered` 기록. Working memory 캐시는 warm-up 필요 (miss 시 PG에서 로드). | 복구 직후 수 건의 cache miss |

### Redis Critical Function Error Handling (ERR-038 해소)

ERR-038에서 지적된 5개 critical function 각각에 대한 에러 처리:

#### 1. Working Memory Read/Write

```typescript
// packages/infra/src/cache/redis-working-memory.ts

class RedisWorkingMemory implements WorkingMemory {
  constructor(
    private readonly redis: RedisClient,
    private readonly pg: PgPool,
    private readonly circuitBreaker: CircuitBreaker,
  ) {}

  async pushTurn(userId: string, turn: Turn): Promise<void> {
    // 1) PG에 먼저 기록 (source of truth, 비동기 X — 반드시 성공)
    await this.pg.query(
      "INSERT INTO messages (session_id, role, content, channel_id, token_count) VALUES ($1, $2, $3, $4, $5)",
      [turn.sessionId, turn.role, turn.content, turn.channelId, turn.tokenCount],
    );

    // 2) Redis 캐시 갱신 (실패해도 PG에 이미 기록됨)
    if (this.circuitBreaker.state !== "open") {
      try {
        await this.redis.rpush(`axel:working:${userId}:turns`, JSON.stringify(turn));
        await this.redis.ltrim(`axel:working:${userId}:turns`, -20, -1);
        await this.redis.expire(`axel:working:${userId}:turns`, 3600);
      } catch (err) {
        this.circuitBreaker.recordFailure();
        // Redis 실패는 경고 로그만 — PG에 이미 기록됨
        logger.warn("redis.working.pushTurn.failed", { userId, error: err });
      }
    }
  }

  async getTurns(userId: string, limit: number): Promise<readonly Turn[]> {
    // Redis 우선 시도
    if (this.circuitBreaker.state !== "open") {
      try {
        const cached = await this.redis.lrange(`axel:working:${userId}:turns`, -limit, -1);
        if (cached.length > 0) {
          this.circuitBreaker.recordSuccess();
          return cached.map((s) => JSON.parse(s) as Turn);
        }
      } catch (err) {
        this.circuitBreaker.recordFailure();
        logger.warn("redis.working.getTurns.failed", { userId, error: err });
      }
    }

    // PG fallback
    const rows = await this.pg.query(
      "SELECT * FROM messages WHERE session_id = (SELECT session_id FROM sessions WHERE user_id = $1 AND status = 'active' LIMIT 1) ORDER BY created_at DESC LIMIT $2",
      [userId, limit],
    );
    return rows.map(rowToTurn).reverse();
  }
}
```

**패턴**: PG-first write, Redis cache-aside read. Redis 실패 시 PG fallback으로 기능 보장.

#### 2. Session Router Pub/Sub

```typescript
// packages/infra/src/cache/redis-session-router.ts

class RedisSessionRouter implements SessionRouter {
  private pollingInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly redis: RedisClient,
    private readonly subscriber: RedisClient, // 별도 연결 (pub/sub 전용)
    private readonly pg: PgPool,
    private readonly circuitBreaker: CircuitBreaker,
  ) {}

  async publish(channelId: string, event: SessionEvent): Promise<void> {
    // PG에 이벤트 로그 기록 (audit + fallback)
    await this.pg.query(
      "INSERT INTO session_events (channel_id, event_type, payload) VALUES ($1, $2, $3)",
      [channelId, event.type, JSON.stringify(event)],
    );

    if (this.circuitBreaker.state !== "open") {
      try {
        await this.redis.publish(`axel:channel:${channelId}`, JSON.stringify(event));
      } catch (err) {
        this.circuitBreaker.recordFailure();
        logger.warn("redis.pubsub.publish.failed", { channelId, error: err });
        // PG에 이미 기록됨 — polling fallback이 감지
      }
    }
  }

  async subscribe(channelId: string, handler: (event: SessionEvent) => void): Promise<void> {
    if (this.circuitBreaker.state !== "open") {
      try {
        await this.subscriber.subscribe(`axel:channel:${channelId}`, (msg) => {
          handler(JSON.parse(msg) as SessionEvent);
        });
        return;
      } catch (err) {
        this.circuitBreaker.recordFailure();
        logger.warn("redis.pubsub.subscribe.failed", { channelId, error: err });
      }
    }

    // Polling fallback: PG session_events 테이블 1초 간격 조회
    this.startPollingFallback(channelId, handler);
  }

  private startPollingFallback(channelId: string, handler: (event: SessionEvent) => void): void {
    let lastEventId = 0;
    this.pollingInterval = setInterval(async () => {
      const rows = await this.pg.query(
        "SELECT * FROM session_events WHERE channel_id = $1 AND id > $2 ORDER BY id",
        [channelId, lastEventId],
      );
      for (const row of rows) {
        lastEventId = row.id;
        handler(row.payload as SessionEvent);
      }
    }, 1_000);
  }
}
```

**패턴**: PG event log + Redis pub/sub. Redis 실패 시 PG polling fallback (1초 지연 허용).

#### 3. Rate Limiting

```typescript
// packages/infra/src/cache/redis-rate-limiter.ts

class RedisRateLimiter implements RateLimiter {
  private readonly fallbackMap = new Map<string, { count: number; expiresAt: number }>();

  constructor(
    private readonly redis: RedisClient,
    private readonly circuitBreaker: CircuitBreaker,
  ) {}

  async checkLimit(userId: string, maxPerMinute: number): Promise<RateLimitResult> {
    const minuteKey = `axel:rate:${userId}:${Math.floor(Date.now() / 60_000)}`;

    if (this.circuitBreaker.state !== "open") {
      try {
        const count = await this.redis.incr(minuteKey);
        if (count === 1) await this.redis.expire(minuteKey, 60);
        this.circuitBreaker.recordSuccess();
        return { allowed: count <= maxPerMinute, remaining: Math.max(0, maxPerMinute - count) };
      } catch (err) {
        this.circuitBreaker.recordFailure();
        logger.warn("redis.rateLimit.failed", { userId, error: err });
      }
    }

    // In-memory fallback (프로세스 수명, 리셋 허용)
    return this.inMemoryCheck(userId, maxPerMinute);
  }

  private inMemoryCheck(userId: string, maxPerMinute: number): RateLimitResult {
    const now = Date.now();
    const key = `${userId}:${Math.floor(now / 60_000)}`;
    const entry = this.fallbackMap.get(key);

    if (!entry || entry.expiresAt < now) {
      this.fallbackMap.set(key, { count: 1, expiresAt: now + 60_000 });
      return { allowed: true, remaining: maxPerMinute - 1 };
    }

    entry.count++;
    return { allowed: entry.count <= maxPerMinute, remaining: Math.max(0, maxPerMinute - entry.count) };
  }
}
```

**패턴**: Redis INCR + in-memory Map fallback. Rate limit 유실 시 허용 방향으로 fail-open (보안 critical한 rate limit은 Gateway 레벨에서 별도 enforced — ADR-019 참조).

#### 4. Intent Classification Cache

```typescript
// packages/infra/src/cache/redis-intent-cache.ts

class RedisIntentCache implements IntentCache {
  constructor(
    private readonly redis: RedisClient,
    private readonly circuitBreaker: CircuitBreaker,
  ) {}

  async get(hash: string): Promise<IntentClassification | null> {
    if (this.circuitBreaker.state !== "open") {
      try {
        const cached = await this.redis.get(`axel:intent:${hash}`);
        if (cached) {
          this.circuitBreaker.recordSuccess();
          return JSON.parse(cached) as IntentClassification;
        }
      } catch (err) {
        this.circuitBreaker.recordFailure();
        logger.warn("redis.intentCache.get.failed", { hash, error: err });
      }
    }
    // cache miss → 호출자가 LLM 분류 실행
    return null;
  }

  async set(hash: string, classification: IntentClassification): Promise<void> {
    if (this.circuitBreaker.state !== "open") {
      try {
        await this.redis.set(`axel:intent:${hash}`, JSON.stringify(classification), "EX", 300);
        this.circuitBreaker.recordSuccess();
      } catch (err) {
        this.circuitBreaker.recordFailure();
        logger.warn("redis.intentCache.set.failed", { hash, error: err });
        // 캐시 저장 실패 — 다음 동일 요청 시 LLM 재분류 (성능 저하, 기능 정상)
      }
    }
  }
}
```

**패턴**: 순수 cache — 실패 시 cache miss로 처리. PG shadow 없음 (재생성 가능 데이터).

#### 5. Speculative Prefetch

```typescript
// packages/infra/src/cache/redis-prefetch.ts

class RedisPrefetchCache implements PrefetchCache {
  constructor(
    private readonly redis: RedisClient,
    private readonly circuitBreaker: CircuitBreaker,
  ) {}

  async store(userId: string, memories: readonly PrefetchedMemory[]): Promise<void> {
    if (this.circuitBreaker.state !== "open") {
      try {
        await this.redis.hset(
          `axel:prefetch:${userId}`,
          ...memories.flatMap((m) => [m.memoryId, JSON.stringify(m)]),
        );
        await this.redis.expire(`axel:prefetch:${userId}`, 30);
        this.circuitBreaker.recordSuccess();
      } catch (err) {
        this.circuitBreaker.recordFailure();
        logger.warn("redis.prefetch.store.failed", { userId, error: err });
        // prefetch 실패 → Context Assembler가 on-demand 검색 (latency 증가, 기능 정상)
      }
    }
  }

  async retrieve(userId: string): Promise<readonly PrefetchedMemory[]> {
    if (this.circuitBreaker.state !== "open") {
      try {
        const all = await this.redis.hgetall(`axel:prefetch:${userId}`);
        if (Object.keys(all).length > 0) {
          this.circuitBreaker.recordSuccess();
          return Object.values(all).map((v) => JSON.parse(v) as PrefetchedMemory);
        }
      } catch (err) {
        this.circuitBreaker.recordFailure();
        logger.warn("redis.prefetch.retrieve.failed", { userId, error: err });
      }
    }
    // prefetch 없음 → on-demand semantic search
    return [];
  }
}
```

**패턴**: 순수 최적화 캐시 — 실패 시 on-demand 검색으로 대체. 30초 TTL이므로 복구 시 자연스럽게 warm-up.

### Error Handling Summary

| Critical Function | Error Type (ADR-020) | Retry Strategy | Fallback | Data Loss Risk |
|-------------------|---------------------|----------------|----------|---------------|
| Working Memory write | TransientError | 3회 지수 백오프 | PG direct write (이미 수행) | 없음 (PG-first) |
| Working Memory read | TransientError | 3회 지수 백오프 | PG direct read | 없음 |
| Session pub/sub | TransientError | 재연결 시도 | PG polling (1초) | 없음 (PG event log) |
| Rate Limiting | TransientError | 없음 (즉시 fallback) | in-memory Map | 리셋 허용 (fail-open) |
| Intent Cache | TransientError | 없음 (즉시 fallback) | cache miss → LLM 재분류 | 없음 (재생성 가능) |
| Speculative Prefetch | TransientError | 없음 (즉시 fallback) | on-demand search | 없음 (최적화 데이터) |

### Redis Client Wrapper

모든 critical function이 동일한 circuit breaker와 로깅 패턴을 사용하도록 하는 wrapper:

```typescript
// packages/infra/src/cache/resilient-redis.ts

interface ResilientRedisClient {
  // 원본 Redis 명령을 circuit breaker로 감싸는 proxy
  readonly raw: RedisClient;                     // circuit breaker 없이 직접 접근 (테스트용)
  readonly circuitBreaker: CircuitBreaker;
  readonly mode: "normal" | "degraded";          // 현재 운영 모드

  // Lifecycle
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  healthCheck(): Promise<{ connected: boolean; latencyMs: number }>;
}
```

## Alternatives Considered

| Option | Pros | Cons |
|--------|------|------|
| **Redis as ephemeral cache (선택)** | 빠른 read/write, TTL 네이티브, pub/sub, PG fallback 가능 | 추가 인프라 (Redis 프로세스) |
| PostgreSQL only | 단일 DB 원칙 완전 준수 | Working Memory latency 부적합, pub/sub 없음, TTL 수동 관리 |
| In-memory Map only | 외부 의존성 없음 | 프로세스 재시작 시 유실, pub/sub 없음, 규모 확장 불가 |
| SQLite (WAL) | 로컬 파일, 가벼움 | 동시 write 제한, pub/sub 없음 |
| Memcached | 간단한 캐시 | pub/sub 없음, 데이터 구조 제한적 |

### Error Handling Strategy Alternatives

| Option | Pros | Cons |
|--------|------|------|
| **PG-first write + Redis cache (선택)** | Redis 실패 시 데이터 유실 없음. Source of truth 명확. | Write 경로에 PG latency 추가 (~5ms). |
| Redis-first write + async PG shadow | Write latency 최소화 | Redis 장애 시 shadow write 유실 → PG와 불일치 가능 |
| Dual write (Redis + PG 동시) | 즉시 일관성 | Distributed transaction 복잡도. 하나 실패 시 rollback 필요. |

**PG-first 선택 근거**: MISSION Principle #2 "PostgreSQL 단일 DB"를 실질적으로 준수. Redis는 read 가속 캐시일 뿐, write는 항상 PG가 먼저. 이 패턴은 cache-aside와 유사하되, write 방향이 PG→Redis (write-through가 아닌 write-behind cache invalidation).

## Consequences

### Positive
- Working Memory read/write latency < 1ms (Redis 정상 시)
- Redis pub/sub로 채널 간 실시간 이벤트 전파
- TTL 기반 자동 만료 → 수동 cleanup 불필요
- Shadow write로 PostgreSQL 단일 DB 원칙 실질적 유지
- **Redis 전면 장애 시에도 서비스 중단 없음** (degraded mode, latency 증가만)
- **각 critical function이 명시적 fallback을 가짐** (ERR-038 해소)

### Negative
- Redis 프로세스 운영 부담 (Docker Compose에 포함)
- PG-first write로 인한 write path latency 증가 (~5ms)
  - Mitigation: PG write는 이미 필수 경로 (shadow write). Redis 추가 write는 fire-and-forget 패턴으로 비동기 처리 가능.
- Redis 장애 시 latency 증가 (degraded mode)
  - Mitigation: Circuit breaker가 즉시 감지 → PG fallback으로 전환. 사용자에게 투명.
- Pub/sub fallback polling의 1초 지연
  - Mitigation: 크로스채널 전환은 사용자가 직접 수행 → 1초 지연은 인지 불가.

## References

- Plan v2.0 Section 3.2: Redis 역할
- Plan v2.0 Section 4 Layer 2: Redis 구조
- ADR-002: PostgreSQL Single DB — Redis의 "순간 기억" 역할 정의
- ADR-013: 6-Layer Memory Architecture — Layer 0 (Stream Buffer), Layer 1 (Working Memory)
- ADR-020: Error Taxonomy — TransientError 분류
- ADR-021: Resilience Patterns — Circuit Breaker state machine, graceful shutdown
- ADR-019: Auth Strategy — Rate limiting security enforcement
- ERR-010: Redis usage vs PG single DB principle → **해소**: Redis는 ephemeral cache, PG가 source of truth
- ERR-038: Redis critical functions error handling → **해소**: 5개 function 각각에 retry/fallback/circuit breaker 명세
