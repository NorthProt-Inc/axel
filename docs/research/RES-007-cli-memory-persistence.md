# RES-007: CLI 세션 종료 후 기억 상실 원인 분석

> Date: 2026-02-08
> Author: Research Division
> Related: ADR-013 (Memory Architecture), ADR-003 (Redis Working Memory), ADR-014 (Session Router)

## Question

CLI 세션 종료 후 다음 세션에서 이전 대화를 기억하지 못하는 원인은 무엇인가? 세션 간 메모리 persistence 경로를 추적하여 M1 → M2 → M3 flush 및 로드 메커니즘의 문제점을 식별한다.

## Methodology

1. 코드베이스 정적 분석 (Glob, Grep, Read tools 사용)
2. 메시지 처리 흐름 추적: InboundHandler → SessionRouter → Memory Layers
3. 세션 종료 시 flush 메커니즘 분석
4. 다음 세션 시작 시 메모리 로드 경로 분석
5. 각 메모리 레이어(M1, M2, M3)의 저장/로드 구현 검증

## Findings

### 핵심 문제점 요약

**CLI 세션 종료 후 기억이 상실되는 근본 원인은 다음 3가지 구조적 결함 때문이다:**

1. **M1 Working Memory flush 시 잘못된 userId 전달**: `flush('*')` 호출로 실제 사용자 데이터가 PG에 저장되지 않음
2. **InboundHandler가 M1에 메시지를 기록하지 않음**: 메시지 처리 후 `workingMemory.pushTurn()` 호출이 누락됨
3. **M2/M3로의 영구 저장 경로가 완전히 누락됨**: EpisodicMemory, SemanticMemory로 데이터를 저장하는 코드가 존재하지 않음

---

## 상세 분석

### 1. 메시지 처리 흐름 (현재 구현)

#### 1.1 InboundHandler Entry Point

**파일**: `packages/core/src/orchestrator/inbound-handler.ts`

```typescript
export function createInboundHandler(deps: InboundHandlerDeps) {
  return async (message: InboundMessage, send: SendCallback): Promise<void> => {
    const { userId, channelId, content } = message;

    try {
      // 1. Resolve session
      const resolved = await sessionRouter.resolveSession(userId, channelId);

      // 2. Get channel-adapted system prompt
      const systemPrompt = personaEngine.getSystemPrompt(channelId);

      // 3. Assemble context
      const assembled = await contextAssembler.assemble({
        systemPrompt,
        userId,
        query: content,
      });

      // 4. Build messages for reactLoop
      const messages = buildMessages(assembled.systemPrompt, assembled.sections, message);

      // 5. Run ReAct loop and accumulate text
      const responseText = await consumeReactStream(reactLoop({...}));

      // 6. Send response
      await send(userId, { content: responseText || ERROR_MESSAGE, format: 'markdown' });

      // 7. Update session activity
      await sessionRouter.updateActivity(resolved.session.sessionId);

      // ❌ 문제: workingMemory.pushTurn() 호출 누락!
      // ❌ 문제: episodicMemory.addMessage() 호출 누락!
      // ❌ 문제: semanticMemory.store() 호출 누락!
    } catch (err: unknown) {
      // ...
    }
  };
}
```

**문제점**:
- 메시지 처리 후 **어떤 메모리 레이어에도 대화 내용을 저장하지 않음**
- `sessionRouter.updateActivity()`는 세션 테이블의 `turn_count`와 `last_activity_at`만 업데이트
- 실제 메시지 내용(`content`)은 어디에도 기록되지 않음

#### 1.2 InboundHandlerDeps (의존성 주입)

```typescript
export interface InboundHandlerDeps {
  readonly sessionRouter: SessionRouter;
  readonly contextAssembler: ContextAssembler;
  readonly llmProvider: LlmProvider;
  readonly toolExecutor: ToolExecutor;
  readonly personaEngine: PersonaEngine;
  readonly toolDefinitions?: readonly ToolDefinition[];
  readonly config?: ReActConfig;
  readonly onError?: (info: ErrorInfo) => void;

  // ❌ workingMemory가 주입되지 않음
  // ❌ episodicMemory가 주입되지 않음
  // ❌ semanticMemory가 주입되지 않음
}
```

**결론**: InboundHandler는 메모리 레이어에 접근할 수 없는 구조로 설계되어 있음.

---

### 2. M1 Working Memory: PG-first Write Pattern

#### 2.1 RedisWorkingMemory 구현

**파일**: `packages/infra/src/cache/redis-working-memory.ts`

**정상적인 write 경로** (`pushTurn()` 호출 시):

```typescript
async pushTurn(userId: string, turn: Turn): Promise<void> {
  // 1. PG-first write (source of truth)
  await this.pg.query(
    'INSERT INTO messages (turn_id, session_id, role, content, channel_id, created_at, token_count) VALUES ($1, $2, $3, $4, $5, $6, $7)',
    [turn.turnId, userId, turn.role, turn.content, turn.channelId, turn.timestamp, turn.tokenCount]
  );

  // 2. Redis cache update (fire-and-forget on failure)
  if (!this.redisState.isOpen) {
    try {
      const key = `axel:working:${userId}:turns`;
      await this.redis.rpush(key, JSON.stringify(turn));
      await this.redis.ltrim(key, -MAX_TURNS, -1);
      await this.redis.expire(key, TTL_SECONDS);
      this.onRedisSuccess();
    } catch (error: unknown) {
      this.onRedisFailure();
    }
  }
}
```

**정상 read 경로** (`getTurns()` 호출 시):

```typescript
async getTurns(userId: string, limit: number): Promise<readonly Turn[]> {
  // 1. Try Redis first (cache-aside)
  if (!this.redisState.isOpen) {
    try {
      const key = `axel:working:${userId}:turns`;
      const cached = await this.redis.lrange(key, -limit, -1);
      if (cached.length > 0) {
        this.onRedisSuccess();
        return cached.map((s) => JSON.parse(s) as Turn);
      }
    } catch (error: unknown) {
      this.onRedisFailure();
    }
  }

  // 2. PG fallback
  const result = await this.pg.query<...>(
    'SELECT turn_id, role, content, channel_id, created_at, token_count FROM messages WHERE session_id = $1 ORDER BY created_at DESC LIMIT $2',
    [userId, limit],
  );
  return result.rows.reverse().map((row) => ({ ... }));
}
```

**ADR-003 패턴 검증**: ✅ **정상**
- PG를 source of truth로 사용
- Redis는 read cache로만 동작
- Redis 실패 시 PG fallback으로 자동 전환

#### 2.2 Flush 메커니즘 (세션 종료 시)

**파일**: `apps/axel/src/lifecycle.ts:122`

```typescript
export async function gracefulShutdown(container: ShutdownableContainer): Promise<void> {
  // Phase 1: Stop channels
  for (const channel of container.channels) {
    try {
      await channel.stop();
    } catch (_err: unknown) { /* continue */ }
  }

  // Phase 3: Flush state
  try {
    await container.workingMemory.flush('*');  // ⚠️ 문제 지점
  } catch (_err: unknown) { /* continue */ }

  // Phase 4: Close connections
  await container.redis.quit();
  await container.pgPool.end();
}
```

**RedisWorkingMemory.flush()** (`packages/infra/src/cache/redis-working-memory.ts:180-216`)

```typescript
async flush(userId: string): Promise<void> {
  // Read from Redis and ensure all are in PG
  const turnsKey = `axel:working:${userId}:turns`;
  const summaryKey = `axel:working:${userId}:summary`;

  try {
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
  } catch (error: unknown) {
    // If Redis read fails, data is already in PG (PG-first pattern)
    this.onRedisFailure();
  }

  try {
    await this.redis.del(turnsKey);
    await this.redis.del(summaryKey);
  } catch (error: unknown) {
    this.onRedisFailure();
  }
}
```

**치명적 문제**:

```typescript
await container.workingMemory.flush('*');  // userId = '*'
// Redis key: axel:working:*:turns  (존재하지 않는 키!)
// 실제 유저 데이터: axel:working:user-123:turns (flush되지 않음)
```

- `flush('*')`는 wildcard가 아니라 **literal string `'*'`**를 userId로 사용
- 실제 사용자 데이터 키는 `axel:working:{real-user-id}:turns` 형태
- Redis에서 `axel:working:*:turns` 키를 조회 → **빈 배열 반환**
- Redis 키 삭제도 실패 (존재하지 않는 키)

**예상되는 동작 vs 실제 동작**:

| 단계 | 예상 | 실제 |
|------|------|------|
| 1. Redis에서 데이터 조회 | `axel:working:user-123:turns` | `axel:working:*:turns` (존재하지 않음) |
| 2. PG INSERT | `session_id = 'user-123'` | `session_id = '*'` (무의미) |
| 3. Redis 키 삭제 | 실제 유저 데이터 삭제 | 존재하지 않는 `*` 키 삭제 시도 |

**결과**: 세션 종료 시 Redis 캐시가 PG로 flush되지 않고, Redis 종료 시 모든 대화 기록이 소실됨.

---

### 3. M2 Episodic Memory: 영구 저장 경로 누락

#### 3.1 PgEpisodicMemory 구현

**파일**: `packages/infra/src/db/pg-episodic-memory.ts`

```typescript
async addMessage(sessionId: string, message: MessageRecord): Promise<void> {
  await this.pool.query(
    `INSERT INTO messages (session_id, role, content, channel_id, timestamp, token_count)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [sessionId, message.role, message.content, message.channelId, message.timestamp, message.tokenCount]
  );
}
```

**정상**: ✅ PG 저장 로직 자체는 올바르게 구현됨.

#### 3.2 호출 경로 분석

**InboundHandler에서 호출 여부 확인**:

```bash
$ grep -r "episodicMemory" packages/core/src/orchestrator/
# 결과: 없음
```

**Container에서 DI 여부 확인**:

```typescript
// apps/axel/src/container.ts
export interface InboundHandlerDeps {
  readonly sessionRouter: SessionRouter;
  readonly contextAssembler: ContextAssembler;
  readonly llmProvider: LlmProvider;
  readonly toolExecutor: ToolExecutor;
  readonly personaEngine: PersonaEngine;
  // ❌ episodicMemory 없음
}
```

**결론**: `addMessage()` 메서드는 존재하지만 **어디서도 호출되지 않음**.

---

### 4. M3 Semantic Memory: 영구 저장 경로 누락

#### 4.1 PgSemanticMemory 구현

**파일**: `packages/infra/src/db/pg-semantic-memory.ts`

```typescript
async store(newMemory: NewMemory): Promise<string> {
  const uuid = crypto.randomUUID();
  await this.pool.query(
    `INSERT INTO semantic_memory (uuid, content, memory_type, importance, embedding, ...)
     VALUES ($1, $2, $3, $4, $5, ...)`,
    [uuid, newMemory.content, newMemory.memoryType, newMemory.importance, ...]
  );
  return uuid;
}
```

**정상**: ✅ PG 저장 로직 자체는 올바르게 구현됨.

#### 4.2 호출 경로 분석

**InboundHandler에서 호출 여부 확인**:

```bash
$ grep -r "semanticMemory" packages/core/src/orchestrator/
# 결과: 없음
```

**결론**: `store()` 메서드는 존재하지만 **어디서도 호출되지 않음**.

---

### 5. 다음 세션 시작 시 메모리 로드 메커니즘

#### 5.1 ContextAssembler를 통한 메모리 로드

**파일**: `packages/core/src/context/assembler.ts`

```typescript
async assemble(params: AssembleParams): Promise<AssembledContext> {
  const { systemPrompt, userId, query, entityId } = params;
  const sections: ContextSection[] = [];

  // 1. Working Memory (M1)
  const turns = await this.provider.getWorkingMemory(userId, DEFAULTS.workingMemoryLimit);
  await this.addSection(sections, 'workingMemory', 'M1:working', formatTurns(turns), ...);

  // 2. Stream Buffer (M0)
  const events = await this.provider.getStreamBuffer(userId);
  await this.addSection(sections, 'streamBuffer', 'M0:stream', formatStreamEvents(events), ...);

  // 3. Semantic Search (M3)
  const memories = await this.provider.searchSemantic(query, DEFAULTS.semanticSearchLimit);
  await this.addSection(sections, 'semanticSearch', 'M3:semantic', formatSemanticResults(memories), ...);

  // 4. Graph Traversal (M4)
  // 5. Session Archive (M2)
  const summaries = await this.provider.getSessionArchive(userId, DEFAULTS.sessionArchiveDays);
  await this.addSection(sections, 'sessionArchive', 'M2:episodic', formatSessionSummaries(summaries), ...);

  // 6. Meta Memory (M5)
  // 7. Tool Definitions

  return { systemPrompt, sections, totalTokens, budgetUtilization };
}
```

#### 5.2 MemoryContextDataProvider 구현

**파일**: `apps/axel/src/container.ts:150-188`

```typescript
class MemoryContextDataProvider implements ContextDataProvider {
  constructor(
    private readonly wm: WorkingMemory,
    private readonly em: EpisodicMemory,
    private readonly mm: MetaMemory,
    private readonly tr: ToolRegistry,
  ) {}

  async getWorkingMemory(userId: string, limit: number) {
    return this.wm.getTurns(userId, limit);  // ✅ M1 read
  }

  async searchSemantic(_query: string, _limit: number) {
    // ⚠️ "Requires embedding generation — deferred to message flow wiring"
    return [];  // ❌ 항상 빈 배열 반환
  }

  async traverseGraph(_entityId: string, _depth: number) {
    // ⚠️ "Requires GraphNode→Entity conversion — deferred"
    return [];  // ❌ 항상 빈 배열 반환
  }

  async getSessionArchive(userId: string, _days: number) {
    return this.em.getRecentSessions(userId, 10);  // ✅ M2 read
  }

  async getStreamBuffer(_userId: string) {
    // ⚠️ "Stream buffer consume is an async generator — deferred"
    return [];  // ❌ 항상 빈 배열 반환
  }

  async getMetaMemory(_userId: string) {
    return this.mm.getHotMemories(10);  // ✅ M5 read
  }

  getToolDefinitions() {
    return this.tr.listAll();  // ✅ tools read
  }
}
```

**검증 결과**:

| 메모리 레이어 | Read 구현 | Write 구현 | 결과 |
|-------------|----------|-----------|------|
| M0 Stream Buffer | ❌ 항상 `[]` | ❌ 없음 | 작동 불가 |
| M1 Working Memory | ✅ `getTurns()` | ❌ `pushTurn()` 미호출 | Read만 작동 (빈 데이터) |
| M2 Episodic Memory | ✅ `getRecentSessions()` | ❌ `addMessage()` 미호출 | Read만 작동 (빈 데이터) |
| M3 Semantic Memory | ❌ 항상 `[]` | ❌ `store()` 미호출 | 작동 불가 |
| M4 Conceptual Memory | ❌ 항상 `[]` | ❌ 없음 | 작동 불가 |
| M5 Meta Memory | ✅ `getHotMemories()` | ❌ 없음 | Read만 작동 (빈 데이터) |

**결론**: 메모리 read 인터페이스는 대부분 구현되어 있으나, **write 경로가 전혀 연결되지 않아** 읽을 데이터가 존재하지 않음.

---

## 메모리 Persistence 시퀀스 다이어그램

### 현재 구현 (문제 있는 상태)

```
[User] --1. message--> [CLI Channel]
                            |
                            v
                   [InboundHandler]
                     |          |
                     v          v
            [SessionRouter]  [ContextAssembler]
                 |                    |
                 v                    v
          [PgSessionStore]   [MemoryContextDataProvider]
          (only update              |
           turn_count)               v
                            [WorkingMemory.getTurns(userId)]
                                     |
                                     v
                              Redis: empty → PG fallback
                                     |
                                     v
                              PG messages table: empty
                                     |
                                     v
                            ❌ 이전 대화 없음

[gracefulShutdown]
    |
    v
[workingMemory.flush('*')]
    |
    v
Redis key: axel:working:*:turns  ← 존재하지 않음
    |
    v
❌ 아무것도 PG에 저장되지 않음
```

### 예상되는 정상 동작

```
[User] --1. message--> [CLI Channel]
                            |
                            v
                   [InboundHandler]
                     |          |          |
                     v          v          v
            [SessionRouter]  [ContextAssembler]  [WorkingMemory.pushTurn()]
                 |                    |                    |
                 v                    v                    v
          [PgSessionStore]   [Read from M1/M2/M3]    PG messages INSERT
          (update                                         |
           turn_count)                                    v
                                                   [EpisodicMemory.addMessage()]
                                                          |
                                                          v
                                                  [SemanticMemory.store()]
                                                          |
                                                          v
                                              장기 기억 형성 완료

[gracefulShutdown]
    |
    v
[workingMemory.flush(session.userId)]  ← 실제 userId 전달
    |
    v
Redis → PG sync (이미 PG-first이므로 redundant)
    |
    v
Redis 캐시 삭제
    |
    v
✅ 데이터는 이미 PG에 저장되어 있음
```

---

## 근본 원인 3가지

### 원인 1: InboundHandler의 메모리 레이어 누락

**파일**: `packages/core/src/orchestrator/inbound-handler.ts`

**문제**:
- `InboundHandlerDeps`에 `workingMemory`, `episodicMemory`, `semanticMemory` 의존성이 없음
- 메시지 처리 후 `pushTurn()`, `addMessage()`, `store()` 호출이 불가능한 구조

**영향**:
- 사용자 메시지와 AI 응답이 **어떤 메모리 레이어에도 기록되지 않음**
- `messages` 테이블은 `RedisWorkingMemory.pushTurn()`에서만 INSERT하는데, 이 메서드가 호출되지 않음

### 원인 2: gracefulShutdown의 잘못된 userId

**파일**: `apps/axel/src/lifecycle.ts:122`

**문제**:
```typescript
await container.workingMemory.flush('*');  // userId = '*'
```

- CLI는 **단일 세션**을 갖지만, `flush()`는 userId별로 동작
- `'*'`는 wildcard가 아니라 literal string으로 처리됨
- Redis key `axel:working:*:turns`는 존재하지 않음

**영향**:
- 설령 `pushTurn()`이 호출되어 Redis에 데이터가 있더라도, shutdown 시 flush되지 않음
- Redis 종료 시 모든 캐시 손실

### 원인 3: M2/M3 영구 저장 경로 완전 누락

**영향**:
- M1 Working Memory는 최근 20턴만 유지 (ADR-013)
- M2 Episodic Memory (장기 대화 저장)로의 전환이 구현되지 않음
- M3 Semantic Memory (중요도 기반 벡터 저장)로의 추출이 구현되지 않음

---

## 비교 매트릭스: 현재 vs 예상

| 기능 | 현재 상태 | 예상 동작 | 격차 |
|------|----------|-----------|------|
| **사용자 메시지 기록** | ❌ 없음 | ✅ `pushTurn()` 호출 | CRITICAL |
| **AI 응답 기록** | ❌ 없음 | ✅ `pushTurn()` 호출 | CRITICAL |
| **M1 → PG 동기화** | ❌ `flush('*')` 실패 | ✅ `flush(userId)` | HIGH |
| **M2 세션 요약 생성** | ❌ 없음 | ✅ `endSession()` 호출 | MEDIUM |
| **M3 의미 추출** | ❌ 없음 | ✅ `store()` 호출 | MEDIUM |
| **다음 세션 메모리 로드** | ❌ 빈 배열 | ✅ PG에서 로드 | CRITICAL |

---

## Recommendation

### 단기 수정 (P0 — 즉시)

#### 1. InboundHandler에 메모리 레이어 주입

**파일**: `packages/core/src/orchestrator/inbound-handler.ts`

```typescript
export interface InboundHandlerDeps {
  readonly sessionRouter: SessionRouter;
  readonly contextAssembler: ContextAssembler;
  readonly llmProvider: LlmProvider;
  readonly toolExecutor: ToolExecutor;
  readonly personaEngine: PersonaEngine;
  readonly toolDefinitions?: readonly ToolDefinition[];
  readonly config?: ReActConfig;
  readonly onError?: (info: ErrorInfo) => void;

  // 추가 필요
  readonly workingMemory: WorkingMemory;
  readonly episodicMemory: EpisodicMemory;
}
```

**구현**:

```typescript
export function createInboundHandler(deps: InboundHandlerDeps) {
  const {
    sessionRouter,
    contextAssembler,
    llmProvider,
    toolExecutor,
    personaEngine,
    toolDefinitions = [],
    config = DEFAULT_REACT_CONFIG,
    onError,
    workingMemory,      // 추가
    episodicMemory,     // 추가
  } = deps;

  return async (message: InboundMessage, send: SendCallback): Promise<void> => {
    const { userId, channelId, content } = message;

    try {
      const resolved = await sessionRouter.resolveSession(userId, channelId);
      const systemPrompt = personaEngine.getSystemPrompt(channelId);
      const assembled = await contextAssembler.assemble({ systemPrompt, userId, query: content });
      const messages = buildMessages(assembled.systemPrompt, assembled.sections, message);

      // ReAct loop
      const responseText = await consumeReactStream(reactLoop({
        messages,
        tools: toolDefinitions,
        llmProvider,
        toolExecutor,
        config,
      }));

      await send(userId, { content: responseText || ERROR_MESSAGE, format: 'markdown' });
      await sessionRouter.updateActivity(resolved.session.sessionId);

      // ✅ 추가: M1에 사용자 메시지 기록
      await workingMemory.pushTurn(userId, {
        turnId: resolved.session.turnCount + 1,
        role: 'user',
        content: message.content,
        channelId: message.channelId,
        timestamp: message.timestamp,
        tokenCount: await estimateTokens(message.content),
      });

      // ✅ 추가: M1에 AI 응답 기록
      await workingMemory.pushTurn(userId, {
        turnId: resolved.session.turnCount + 2,
        role: 'assistant',
        content: responseText,
        channelId: message.channelId,
        timestamp: new Date(),
        tokenCount: await estimateTokens(responseText),
      });

      // ✅ 추가: M2에 메시지 저장
      await episodicMemory.addMessage(resolved.session.sessionId, {
        role: 'user',
        content: message.content,
        channelId: message.channelId,
        timestamp: message.timestamp,
        tokenCount: await estimateTokens(message.content),
      });

      await episodicMemory.addMessage(resolved.session.sessionId, {
        role: 'assistant',
        content: responseText,
        channelId: message.channelId,
        timestamp: new Date(),
        tokenCount: await estimateTokens(responseText),
      });

    } catch (err: unknown) {
      if (onError) {
        try {
          onError(buildErrorInfo(err, userId, channelId));
        } catch { /* do not propagate */ }
      }
      await send(userId, { content: ERROR_MESSAGE, format: 'markdown' });
    }
  };
}
```

#### 2. gracefulShutdown에서 실제 userId 전달

**현재 문제**:
```typescript
await container.workingMemory.flush('*');  // literal string
```

**수정 옵션**:

**Option A**: CLI 세션의 실제 userId 추적

```typescript
// apps/axel/src/main.ts
let activeUserId: string | null = null;

// InboundHandler 래핑
const handleMessage = createInboundHandler(deps);
const trackedHandler = async (msg: InboundMessage, send: SendCallback) => {
  activeUserId = msg.userId;
  await handleMessage(msg, send);
};

// lifecycle.ts gracefulShutdown 수정
export async function gracefulShutdown(
  container: ShutdownableContainer,
  activeUserId: string | null
): Promise<void> {
  // Phase 1: Stop channels
  for (const channel of container.channels) {
    try { await channel.stop(); } catch { }
  }

  // Phase 3: Flush state
  if (activeUserId) {
    try {
      await container.workingMemory.flush(activeUserId);
    } catch { }
  }

  // Phase 4: Close connections
  try { await container.redis.quit(); } catch { }
  try { await container.pgPool.end(); } catch { }
}
```

**Option B**: SessionStore에서 모든 active 세션 조회 후 일괄 flush

```typescript
// lifecycle.ts
export async function gracefulShutdown(
  container: ShutdownableContainer,
  sessionStore: SessionStore
): Promise<void> {
  // Phase 1: Stop channels
  for (const channel of container.channels) {
    try { await channel.stop(); } catch { }
  }

  // Phase 3: Flush all active sessions
  try {
    const activeSessions = await sessionStore.getAllActive();  // 새 메서드 필요
    for (const session of activeSessions) {
      try {
        await container.workingMemory.flush(session.userId);
      } catch { }
    }
  } catch { }

  // Phase 4: Close connections
  try { await container.redis.quit(); } catch { }
  try { await container.pgPool.end(); } catch { }
}
```

**추천**: **Option B** (multi-user 확장성 고려)

#### 3. PG-first 패턴 재검증

**현재 상황**:
- `RedisWorkingMemory.pushTurn()`은 PG-first로 정상 구현됨
- `flush()`는 Redis → PG sync를 수행하지만, **PG-first이므로 이미 데이터는 PG에 있음**
- `flush()`의 실질적 역할은 **Redis 캐시 삭제**

**개선안**:
```typescript
async flush(userId: string): Promise<void> {
  // ADR-003 PG-first 패턴에서는 데이터가 이미 PG에 있음
  // flush의 주 목적은 Redis 캐시 정리
  const turnsKey = `axel:working:${userId}:turns`;
  const summaryKey = `axel:working:${userId}:summary`;

  try {
    // Option: 마지막으로 Redis에 있지만 PG에 없는 데이터 확인 (방어적 코드)
    const cached = await this.redis.lrange(turnsKey, 0, -1);
    if (cached.length > 0) {
      for (const serialized of cached) {
        const turn = JSON.parse(serialized) as Turn;
        // ON CONFLICT DO NOTHING 덕분에 중복 INSERT는 무시됨
        await this.pg.query(
          'INSERT INTO messages (...) VALUES (...) ON CONFLICT DO NOTHING',
          [...]
        );
      }
    }
  } catch (error: unknown) {
    // Redis 실패 시 데이터는 이미 PG에 있으므로 안전
    this.onRedisFailure();
  }

  // 캐시 정리
  try {
    await this.redis.del(turnsKey);
    await this.redis.del(summaryKey);
  } catch (error: unknown) {
    this.onRedisFailure();
  }
}
```

**검증 필요**:
- `messages` 테이블에 `UNIQUE` 제약 조건 존재 여부 확인
- 중복 INSERT 방지를 위한 `(session_id, turn_id)` 복합 PRIMARY KEY 확인

---

### 중기 구현 (P1 — Phase 2)

#### 4. M3 Semantic Memory 통합

**필요 작업**:
1. InboundHandler에서 중요한 대화 턴을 M3에 저장
2. Embedding 생성 (GeminiEmbeddingService 사용)
3. Importance 계산 (현재는 고정값, 향후 LLM 판단 또는 heuristic)

**구현 예시**:

```typescript
// inbound-handler.ts
async function extractImportantMemories(
  content: string,
  responseText: string,
  embeddingService: EmbeddingService,
  semanticMemory: SemanticMemory
): Promise<void> {
  // Heuristic: 길이가 일정 이상이거나 특정 패턴을 포함하면 중요
  if (content.length > 200 || containsKeywords(content, ['remember', 'important', '기억'])) {
    const embedding = await embeddingService.embed(content);
    await semanticMemory.store({
      content,
      memoryType: 'conversation',
      importance: 0.7,  // heuristic
      embedding,
      sourceChannel: message.channelId,
      sourceSession: resolved.session.sessionId,
    });
  }
}
```

#### 5. M2 Session Summary 생성

**필요 작업**:
1. 세션 종료 시 LLM을 사용하여 요약 생성
2. `SessionRouter.endSession()` 구현 보강
3. 요약을 `session_summaries` 테이블에 저장

**구현 예시**:

```typescript
// session-router.ts
async endSession(sessionId: string): Promise<SessionSummary> {
  // 1. 세션의 모든 메시지 조회
  const messages = await this.store.getMessages(sessionId);

  // 2. LLM을 사용하여 요약 생성
  const summaryText = await this.llmProvider.generateSummary(messages);

  // 3. 세션 종료 + 요약 저장
  return this.store.end(sessionId, summaryText);
}
```

---

### 장기 개선 (P2 — Phase 3)

#### 6. MemoryContextDataProvider의 stub 제거

**현재 stub**:
```typescript
async searchSemantic(_query: string, _limit: number) {
  return [];  // "Requires embedding generation — deferred"
}
```

**완전 구현**:
```typescript
async searchSemantic(query: string, limit: number) {
  const queryEmbedding = await this.embeddingService.embed(query);
  return this.semanticMemory.search({
    text: query,
    embedding: queryEmbedding,
    limit,
    minImportance: 0.5,
  });
}
```

#### 7. Stream Buffer (M0) 구현

**현재**: Redis Streams 기반 `RedisStreamBuffer`는 구현되어 있으나 사용되지 않음

**통합 작업**:
1. 실시간 이벤트 (typing indicator, status update 등) 발생 시 M0에 push
2. Context assembly 시 최근 이벤트 pull
3. CLI에서는 사용 빈도 낮음 (Discord/Telegram에서 유용)

---

## Sources

### 코드베이스 (정적 분석)

- `packages/core/src/orchestrator/inbound-handler.ts` — InboundHandler 구현
- `packages/core/src/orchestrator/session-router.ts` — SessionRouter 구현
- `packages/core/src/orchestrator/types.ts` — SessionStore 인터페이스
- `packages/core/src/memory/working-memory.ts` — InMemoryWorkingMemory stub
- `packages/core/src/memory/episodic-memory.ts` — InMemoryEpisodicMemory stub
- `packages/core/src/memory/semantic-memory.ts` — InMemorySemanticMemory stub
- `packages/core/src/context/assembler.ts` — ContextAssembler 구현
- `packages/infra/src/cache/redis-working-memory.ts` — RedisWorkingMemory PG-first 구현
- `packages/infra/src/db/pg-session-store.ts` — PgSessionStore 구현
- `packages/infra/src/db/pg-episodic-memory.ts` — PgEpisodicMemory 구현
- `packages/infra/src/db/pg-semantic-memory.ts` — PgSemanticMemory 구현
- `apps/axel/src/lifecycle.ts` — gracefulShutdown 구현
- `apps/axel/src/container.ts` — DI Container 구성
- `apps/axel/src/bootstrap-channels.ts` — CLI Channel 부트스트랩

### ADR (아키텍처 결정 기록)

- ADR-003: Redis Working Memory (PG-first write pattern)
- ADR-013: Six-Layer Memory Architecture (M0-M5)
- ADR-014: Cross-Channel Session Router
- ADR-021: Resilience Patterns (graceful shutdown 4-phase)

### Plan Documents

- `docs/plan/axel-project-plan.md` §3.1: Memory Architecture
- `docs/plan/axel-project-plan.md` §3.3: Context Assembly
- `docs/plan/axel-project-plan.md` §4.6: ReAct Loop

---

## 추가 검증 필요 사항

1. **DB Schema 확인**:
   - `messages` 테이블에 `UNIQUE (session_id, turn_id)` 제약 조건 존재 여부
   - `ON CONFLICT DO NOTHING`가 정상 작동하는지 확인

2. **Token Counting**:
   - `estimateTokens()` 함수 구현 필요 (현재 누락)
   - `EstimateTokenCounter.count()` 사용 가능

3. **Multi-User 시나리오**:
   - CLI는 단일 사용자이지만, Discord/Telegram은 multi-user
   - `gracefulShutdown()`이 모든 active 세션을 처리해야 함

4. **SessionStore.getAllActive() 메서드**:
   - 현재 `PgSessionStore`에 없음
   - `SELECT user_id FROM sessions WHERE ended_at IS NULL` 쿼리 추가 필요
