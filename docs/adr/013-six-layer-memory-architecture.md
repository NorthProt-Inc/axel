# ADR-013: 6-Layer Memory Architecture

> Status: PROPOSED
> Date: 2026-02-07
> Author: Architecture Division

## Context

axnmihn은 4-Layer Memory Architecture (Working → Episodic → Semantic → Conceptual)로 56일간 4,000+ 기억 단위를 관리했다. Axel로 전환하면서 두 가지 새로운 요구사항이 발생했다:

1. **Cross-Channel 통합**: Discord, Telegram, CLI, WebChat 등 여러 채널에서 들어오는 실시간 이벤트를 처리하고, 채널 전환 시 맥락을 유지해야 함
2. **선제적 기억 로딩**: 사용자가 타이핑을 시작하는 시점에 관련 기억을 미리 로딩하여 응답 지연을 줄여야 함

기존 4-Layer에서는:
- 실시간 이벤트(타이핑, 채널 전환, IoT 트리거)를 처리할 레이어가 없음
- 검색 패턴 학습과 Speculative Prefetch를 위한 메타 정보 레이어가 없음

## Decision

axnmihn의 4-Layer를 **6-Layer Memory Architecture**로 확장한다:

```
Layer 0: Stream Buffer          [NEW]     — Redis Streams
Layer 1: Working Memory         [L1 진화] — Redis Hash + List
Layer 2: Episodic Memory        [L2 진화] — PostgreSQL (sessions, messages)
Layer 3: Semantic Memory        [L3 진화] — PostgreSQL pgvector
Layer 4: Conceptual Memory      [L4 진화] — PostgreSQL (entities, relations)
Layer 5: Meta Memory            [NEW]     — PostgreSQL (access_patterns) + Materialized View
```

### Layer 0: Stream Buffer (NEW)

**목적**: 실시간 이벤트 수집 및 Speculative Prefetch 트리거

| Attribute | Value |
|-----------|-------|
| Storage | Redis Streams (`XADD`/`XREAD`) |
| TTL | 현재 세션 동안만 (세션 종료 시 trim) |
| Max entries | 1,000 per stream |
| Data | 타이핑 시작, 채널 전환, IoT 이벤트, presence 변경 |

**동작 흐름:**
1. 채널 어댑터가 typing indicator 수신 → Stream Buffer에 `XADD`
2. Stream Buffer consumer가 이벤트 패턴 분석
3. 패턴에 따라 Meta Memory에서 "이 사용자가 주로 이 시간에 묻는 주제" 조회
4. 관련 기억을 Redis prefetch cache에 선제 로딩 (TTL 30초)
5. 실제 메시지 도착 시 prefetch된 기억이 즉시 사용됨

**TypeScript Interface:**
```typescript
interface StreamEvent {
  readonly eventId: string;       // Redis Stream ID (auto-generated)
  readonly type: "typing_start" | "channel_switch" | "iot_trigger" | "presence_change";
  readonly userId: string;
  readonly channelId: string;
  readonly timestamp: Date;
  readonly metadata: Readonly<Record<string, unknown>>;
}

interface StreamBuffer {
  push(event: Omit<StreamEvent, "eventId">): Promise<string>;
  consume(count: number): AsyncGenerator<StreamEvent>;
  trim(maxLen: number): Promise<number>;
}
```

### Layer 1: Working Memory (L1 진화)

**axnmihn과의 차이:**

| Aspect | axnmihn | Axel |
|--------|---------|------|
| Storage | Python `deque(maxlen=80)` + JSON file | Redis Hash + List |
| Persistence | JSON 파일 영속화 (수동) | Redis (TTL 1h) + PostgreSQL 비동기 flush |
| Cross-channel | 단일 채널만 | **통합** — 모든 채널의 턴이 하나의 working memory |
| Compression | Progressive (3단계) | Progressive (3단계, 동일) |
| Max turns | 80 | 20 (토큰 예산 40,000 기준) |

**Redis 구조:**
```
HASH   axel:working:{userId}           # session metadata
LIST   axel:working:{userId}:turns     # 최근 20턴 (JSON serialized)
STRING axel:working:{userId}:summary   # compressed older turns summary
EXPIRE 3600                            # 1시간 비활동 시 만료
```

**TypeScript Interface:**
```typescript
interface WorkingMemory {
  pushTurn(userId: string, turn: Turn): Promise<void>;
  getTurns(userId: string, limit: number): Promise<readonly Turn[]>;
  getSummary(userId: string): Promise<string | null>;
  compress(userId: string): Promise<void>;  // older turns → summary
  flush(userId: string): Promise<void>;     // Redis → PostgreSQL
  clear(userId: string): Promise<void>;
}

interface Turn {
  readonly turnId: number;
  readonly role: "user" | "assistant" | "system" | "tool";
  readonly content: string;
  readonly channelId: string;
  readonly timestamp: Date;
  readonly tokenCount: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}
```

### Layer 2: Episodic Memory (L2 진화)

**axnmihn과의 차이:**

| Aspect | axnmihn | Axel |
|--------|---------|------|
| Storage | SQLite (WAL mode) | PostgreSQL (MVCC) |
| TTL | 7일 | 30일 |
| Lifecycle | `__del__` 사용 (GC 의존) | Connection pool + explicit close |
| Topics | TEXT field | JSONB (구조화된 검색) |
| Search | LIKE query | pg_trgm trigram + JSONB GIN index |
| Channel tracking | 없음 | channel_id per session + per message |

**PostgreSQL Tables:** sessions, messages (v2.0 plan Section 4 참조)

**TypeScript Interface:**
```typescript
interface EpisodicMemory {
  createSession(params: CreateSessionParams): Promise<string>;
  endSession(sessionId: string, summary: string): Promise<void>;
  addMessage(sessionId: string, message: MessageRecord): Promise<void>;
  getRecentSessions(userId: string, limit: number): Promise<readonly SessionSummary[]>;
  searchByTopic(topic: string, limit: number): Promise<readonly SessionSummary[]>;
  searchByContent(query: string, limit: number): Promise<readonly MessageRecord[]>;
}
```

### Layer 3: Semantic Memory (L3 진화)

**axnmihn과의 차이:**

| Aspect | axnmihn | Axel |
|--------|---------|------|
| Storage | ChromaDB (별도 프로세스) | pgvector (같은 DB) |
| Embedding model | Gemini embedding-001 (768d) | **gemini-embedding-001 (3072d)** (ADR-016) |
| Index | ChromaDB default | IVFFlat (lists=100, 1K vectors 기준) |
| Search | Vector only | **Hybrid** — vector + trigram + metadata |
| Decay | Python batch (C++ SIMD) | TypeScript 순수 함수 (ADR-015) |
| Cross-channel | 없음 | channel_mentions JSONB 추적 |

**Hybrid Search 전략:**
```sql
-- Stage 1: Vector similarity (pgvector)
SELECT id, content, importance,
       1 - (embedding <=> $1) AS vector_score
FROM memories
WHERE importance > 0.03
ORDER BY embedding <=> $1
LIMIT 50;

-- Stage 2: Trigram text match (pg_trgm)
SELECT id, content,
       similarity(content, $2) AS text_score
FROM memories
WHERE content % $2
LIMIT 20;

-- Stage 3: Combine (application layer)
-- final_score = 0.7 * vector_score + 0.3 * text_score
-- Re-rank by importance * final_score
```

**IVFFlat vs HNSW 결정:**
- 현재 1,000개 기억 기준: IVFFlat이 더 적합 (빌드 빠름, 메모리 적음)
- 10,000개 이상으로 성장 시: HNSW로 전환 검토 (ADR-015 또는 별도 ADR)
- RES-001 (research division) 결과 대기 중이나, 1K 규모에서는 IVFFlat이 합리적

**TypeScript Interface:**
```typescript
interface SemanticMemory {
  store(memory: NewMemory): Promise<string>;
  search(query: SemanticQuery): Promise<readonly ScoredMemory[]>;
  decay(config: DecayConfig): Promise<DecayResult>;
  delete(uuid: string): Promise<void>;
  getByUuid(uuid: string): Promise<Memory | null>;
  updateAccess(uuid: string): Promise<void>;
}

interface SemanticQuery {
  readonly text: string;
  readonly embedding: Float32Array;
  readonly limit: number;
  readonly minImportance?: number;
  readonly memoryTypes?: readonly MemoryType[];
  readonly channelFilter?: string;
  readonly hybridSearch?: boolean;  // vector + trigram
}

interface ScoredMemory {
  readonly memory: Memory;
  readonly vectorScore: number;
  readonly textScore: number;
  readonly finalScore: number;
}
```

### Layer 4: Conceptual Memory (L4 진화)

**axnmihn과의 차이:**

| Aspect | axnmihn | Axel |
|--------|---------|------|
| Storage | JSON file (956KB, full memory load) | PostgreSQL tables |
| Traversal | BFS in Python/C++ | SQL recursive CTE |
| Scale limit | ~5,000 entities (메모리 제한) | 무제한 (DB 기반) |
| Entity extraction | LLM (Gemini Flash) | LLM (Gemini Flash, 동일) |

**Graph Traversal (SQL BFS 대체):**
```sql
-- 2-depth BFS from entity
WITH RECURSIVE traversal AS (
  SELECT target_id, relation_type, weight, 1 AS depth
  FROM relations
  WHERE source_id = $1

  UNION ALL

  SELECT r.target_id, r.relation_type, r.weight, t.depth + 1
  FROM relations r
  JOIN traversal t ON r.source_id = t.target_id
  WHERE t.depth < $2  -- max depth parameter
)
SELECT DISTINCT e.*, t.relation_type, t.weight, t.depth
FROM traversal t
JOIN entities e ON e.entity_id = t.target_id
ORDER BY t.depth, t.weight DESC;
```

**TypeScript Interface:**
```typescript
interface ConceptualMemory {
  addEntity(entity: NewEntity): Promise<string>;
  addRelation(relation: NewRelation): Promise<void>;
  traverse(entityId: string, maxDepth: number): Promise<readonly GraphNode[]>;
  findEntity(name: string): Promise<Entity | null>;
  getRelated(entityId: string, relationType?: string): Promise<readonly Entity[]>;
  incrementMentions(entityId: string): Promise<void>;
}
```

### Layer 5: Meta Memory (NEW)

**목적**: 검색 패턴 학습, Speculative Prefetch 최적화, "자주 함께 검색되는 기억" 클러스터링

| Attribute | Value |
|-----------|-------|
| Storage | PostgreSQL table + Materialized View |
| Rolling window | 7일 |
| Refresh | `REFRESH MATERIALIZED VIEW CONCURRENTLY` 매 6시간 |
| Data | query text, matched memory IDs, relevance scores, channel context |

**동작:**
1. 모든 Semantic Memory 검색이 access pattern을 기록
2. Materialized View가 "최근 7일간 자주 접근된 기억 Top 100"을 사전 계산
3. Stream Buffer의 typing 이벤트 발생 시, Meta Memory에서 해당 사용자의 최근 검색 패턴 조회
4. 관련 기억을 Redis prefetch cache에 선제 로딩

**TypeScript Interface:**
```typescript
interface MetaMemory {
  recordAccess(pattern: AccessPattern): Promise<void>;
  getHotMemories(limit: number): Promise<readonly HotMemory[]>;
  getPrefetchCandidates(userId: string, channelId: string): Promise<readonly string[]>;
  refreshView(): Promise<void>;
  pruneOldPatterns(olderThanDays: number): Promise<number>;
}

interface AccessPattern {
  readonly queryText: string;
  readonly matchedMemoryIds: readonly number[];
  readonly relevanceScores: readonly number[];
  readonly channelId: string;
}

interface HotMemory {
  readonly memoryId: number;
  readonly uuid: string;
  readonly content: string;
  readonly accessCount: number;
  readonly channelDiversity: number;  // 몇 개 채널에서 접근됐는지
}
```

### Unified Memory Bus

모든 6개 레이어를 통합하는 facade:

```typescript
interface MemoryBus {
  // Context Assembly에서 사용하는 통합 검색
  assembleContext(params: ContextParams): Promise<AssembledContext>;

  // 메시지 처리 후 적절한 레이어에 기억 저장
  ingest(message: InboundMessage, response: string): Promise<void>;

  // Periodic maintenance
  runDecay(config: DecayConfig): Promise<DecayResult>;
  runConsolidation(): Promise<ConsolidationResult>;
  refreshMetaView(): Promise<void>;
}
```

## Alternatives Considered

| Option | Pros | Cons |
|--------|------|------|
| **4-Layer 유지 (axnmihn 동일)** | 단순, 검증됨, 구현 빠름 | 실시간 이벤트 처리 불가, prefetch 불가, cross-channel 최적화 불가 |
| **5-Layer (Stream Buffer만 추가)** | 실시간 이벤트 처리 가능 | Meta Memory 없이는 prefetch가 random guess, 학습 불가 |
| **6-Layer (선택)** | 실시간 + 학습 기반 prefetch, cross-channel 최적화 | 복잡도 증가, Phase 0에서 Layer 0/5는 stub |
| **8-Layer (Procedural + Emotional 추가)** | 더 풍부한 기억 모델 | 과도한 복잡도, 실질적 이점 불분명, YAGNI |

### 6-Layer 선택 근거

1. **4-Layer는 부족**: Cross-channel session routing (ADR-014)이 실시간 이벤트 스트림을 필요로 함
2. **8-Layer는 과도**: Procedural Memory (습관 패턴)는 Learned Behaviors로 커버됨, Emotional Memory는 기존 `emotional_context` 필드로 충분
3. **점진적 구현**: Layer 0, 5는 Phase 2에서 활성화. Phase 0에서는 no-op stub으로 구현하여 인터페이스만 확정

## Consequences

### Positive

- Stream Buffer로 **500ms 이내 TTFT** 목표 달성 가능성 증가 (prefetch된 기억 사용)
- Meta Memory로 시간이 지날수록 검색 품질이 자동 개선
- 6개 레이어가 각각 단일 책임을 가져 테스트/교체 용이
- Layer 0-1은 Redis, 2-5는 PostgreSQL — 저장소 역할이 명확

### Negative

- 6개 레이어 간 데이터 흐름 복잡도 증가
- Redis + PostgreSQL 양쪽 장애 대응 필요
- Materialized View refresh가 주기적 부하 발생 (6시간마다, CONCURRENTLY로 lock-free)

### Migration Impact

- axnmihn 4-Layer 데이터는 Layer 1-4에 직접 매핑
- Layer 0 (Stream Buffer): 마이그레이션 대상 없음 (transient data)
- Layer 5 (Meta Memory): 마이그레이션 대상 없음 (학습 데이터, 운영 후 자동 축적)

## Implementation Phases

| Phase | Layers | Status |
|-------|--------|--------|
| Phase 0 | L1 (Working), L2 (Episodic), L3 (Semantic), L4 (Conceptual) | Full implementation |
| Phase 0 | L0 (Stream Buffer), L5 (Meta Memory) | Interface + no-op stub |
| Phase 2 | L0 (Stream Buffer) | Full implementation |
| Phase 2 | L5 (Meta Memory) | Full implementation |

## References

- v2.0 Plan Section 4, Layer 3 (Memory Engine)
- axnmihn `unified.py`, `current.py`, `permanent/*.py`, `graph_rag.py`
- ADR-002: PostgreSQL + pgvector
- ADR-003: Redis for working memory
- ADR-014: Cross-Channel Session Router (companion ADR)
- PLAN-001: gemini-embedding-001 결정 (embedding model)
