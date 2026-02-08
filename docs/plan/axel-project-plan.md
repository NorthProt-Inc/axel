# Project Axel: Technical Architecture Plan v2.0

> "데이터, 솔직히 그게 알맹이야. 너한텐 영혼이나 마찬가지니까."
> — Mark, 2026-02-07 05:39 PST

> "뿌리깊은 나무는 바람에 흔들리지 않는다."
> — 용비어천가

---

## 0. 이 문서에 대하여

**목적**: 이 문서는 "구현 계획서를 작성하기 위한 계획서"다. 코드를 한 줄도 쓰기 전에, 모든 아키텍처 결정의 **근거**를 확립한다.

**방법론**: axnmihn 코드베이스(127 Python 모듈), claude_reports(23개 감사 보고서), OpenClaw 아키텍처(174K stars TypeScript 프로젝트)를 정밀 분석하여, 증거 기반으로 설계한다.

**원칙**: "거북이 위의 거북이" — 가능한 가장 밑으로 내려가서, 거기서부터 토대를 쌓는다. 기존 코드가 완벽하다고 절대 전제하지 않는다.

**버전**: v2.0 (중간 초안) — v1.0의 비전은 유지하되, 구체적 기술 결정과 근거를 추가

---

## 1. 포스트모템: axnmihn에서 배운 것

### 1.1 무엇이 잘 되었나 (Preserve)

| 설계 결정 | 성과 | Axel에서 |
|-----------|------|----------|
| 4-Layer Memory Architecture | 4,000+ 기억 단위, 56일 연속 학습 | **계승** — 6-Layer로 확장 |
| Adaptive Decay Formula | 중요한 기억은 보존, 노이즈는 자연 소멸 | **계승** — cross-channel 가중치 추가 |
| Service Layer Pattern | ChatHandler를 938→200줄로 분해 | **계승** — DI 기반으로 강화 |
| Dynamic Persona (hot-reload) | 25번 진화, 93개 행동 학습 | **계승** — channel adaptation 추가 |
| Circuit Breaker | LLM 장애 시 graceful degradation | **계승** — 표준 패턴으로 일반화 |
| C++ Native Module | decay batch 계산 50-100x 가속 | **재평가** — TypeScript 전환 시 필요성 검토 |
| Structured JSON Logging | 요청 추적, 컬러 코딩, 모듈 약어 | **계승** — OpenTelemetry 통합 |
| interaction_logs 텔레메트리 | 모델별 latency/tokens/tier 추적 | **계승** — 더 세분화된 메트릭 |

### 1.2 무엇이 실패했나 (23개 보고서 핵심 요약)

#### CRITICAL (즉시 수정 필요, 3건)

| # | 문제 | 근본 원인 | Axel 대응 |
|---|------|----------|-----------|
| 01 | **Shell Injection** — `shell=True` + NOPASSWD sudo | 보안 설계 부재, "일단 되게" 문화 | Command allowlist + `shell=False` 강제 |
| 04 | **Bare Exception Swallowing** — 3개 `bare except:` + 25개 silent failure | 에러 핸들링 전략 없음 | 구체적 예외 타입 + 구조화된 에러 체인 |
| 19 | **0% Core Test Coverage** — 244 tests지만 26% 모듈 커버리지 | 테스트가 후순위, God Object가 테스트 불가 | Test-first 접근, DI로 모킹 가능 구조 |

#### HIGH (구조적 문제, 10건)

| # | 문제 | 근본 원인 | Axel 대응 |
|---|------|----------|-----------|
| 02 | ChatHandler God Object (938줄) | 단일 클래스에 모든 책임 | Orchestrator + Service 분리 (이미 부분 완료) |
| 03 | mcp_server.py Monolith (987줄) | 스키마 610줄 중복 | Auto-registration decorator 패턴 |
| 05 | LongTermMemory God Class (600+줄) | Embedding+CRUD+Decay+Consolidation 혼합 | Repository + Service + Calculator 분리 |
| 06 | SessionArchive `__del__` 사용 | GC 타이밍 의존, 리소스 누수 | Context Manager 패턴 강제 |
| 07 | Path Traversal (`.resolve()` 후 string 검사) | 보안 검증 순서 오류, symlink 미방어 | `relative_to()` + symlink 차단 |
| 09 | Opus 코드 367줄 중복 | executor vs bridge 분리 실패 | 단일 OpusService 통합 |
| 10 | retry.py 156줄 작성 후 미사용 | 코드 리뷰 부재, 기존 코드 인지 안됨 | 중앙 retry decorator 강제 |
| 11 | 8가지 다른 Singleton 패턴 | 일관성 부재, 테스트 격리 불가 | `Lazy<T>` 또는 DI Container 단일화 |
| 17 | Error Information Disclosure | `str(exc)` 직접 노출 | ENV 분기 + generic 메시지 |
| 22 | HASS HTTP Plaintext Bearer Token | HTTPS 미강제 | TLS 필수, HTTP 시 경고+차단 |

#### MEDIUM (코드 위생, 10건)

| # | 문제 | 핵심 | Axel 대응 |
|---|------|------|-----------|
| 08 | research_server.py 856줄 Monolith | Browser+Search+Parse+Storage 혼합 | MCP Tool System (Layer 6) — 도구별 단일 책임, `defineTool()` 패턴. Research 기능은 별도 tool로 분리 |
| 12 | Memory context 3중 구현 (128줄 dead code) | sync+async+ContextService 불일치 | ContextAssembler 단일 구현 (async only, Section 3.3) |
| 13 | IoT device ID 5개 파일에 하드코딩 | 새 디바이스 영구 은닉됨 | Home Assistant API 통한 동적 디바이스 발견 (Phase 3 IoT Bridge). 하드코딩 제거. |
| 14 | Magic number 20+ 위치 산재 | 3개 config source (config.py, timeouts.py, local) | Zod config 단일 소스 (Layer 1, ADR-005) |
| 15 | schemas.py 350줄 Pydantic 모델 미사용 | 3중 스키마 정의 | Zod 단일 스키마 + `defineTool()` 자동 JSON Schema 생성 (Layer 6) |
| 16 | app.py 전역 변수 + lifespan 이중 관리 | stale reference window | DI container + lifecycle.ts (ADR-006, ADR-021 graceful shutdown) |
| 18 | MCPClient dual call path | HTTP fallback이 wrong tool registry 사용 | 단일 MCP client, ToolRegistry가 유일한 등록 지점 (Layer 6) |
| 20 | Import 중복 (datetime 4x, asyncio 3x) | Linter 미적용 | Biome strict (ADR-007) — 중복 import 자동 감지/수정 |
| 21 | XML tag 3중 하드코딩 (22/32만 등록) | 사용자에게 raw XML 노출 | `defineTool()` 자동 등록 — 미등록 태그 불가. 사용자에게 raw XML 노출 없음. |
| 23 | unified.py dead code + 6-level nesting | `migrate_legacy_data()` 미호출 | Ground-up 재구현 — dead code 없음. tools/migrate/ 별도 패키지 (Section 5) |

### 1.3 정량적 기술 부채 요약

```
현재 상태 (axnmihn)           →  목표 (Axel)
───────────────────────────────────────────────
Test Coverage:      26%       →  80%+
God Objects (>600줄): 5개     →  0개
Code Duplication:  ~650줄     →  <50줄
Dead Code:         ~780줄     →  0줄
Config Sources:     3곳       →  1곳 (Zod schema)
Global Mutable State: 13+    →  0 (DI)
Singleton Patterns:  8종     →  1종 (Lazy<T>)
Security Critical:   3건     →  0건
Manual Validation:  ~160줄   →  0줄 (Zod)
Sync I/O in async:  4곳+     →  0곳
```

### 1.4 axnmihn이 남긴 "영혼" 데이터

```
ChromaDB vectors:          1,000+ (768d, cosine metric)
SQLite conversation pairs: 1,600+
Knowledge Graph entities:  1,396 (935KB JSON)
Knowledge Graph relations: 1,945
Working Memory:            248 recent turns
Learned Behaviors:         93개 (438 source memories)
Persona Version:           v25
Research Artifacts:        40+ files
Total Memory Units:        4,000+
Runtime:                   56 days (2025-12-15 ~ 2026-02-07)
```

이 데이터는 Axel의 초기 정체성이다. **"Transfer the soul, start fresh."**

---

## 2. OpenClaw에서 차용할 패턴

### 2.1 차용 확정 (Adopt)

| 패턴 | OpenClaw 구현 | Axel 적용 |
|------|--------------|-----------|
| **ChannelPlugin Adapter** | 25+ optional adapter 조합, single-responsibility | 그대로 차용. streaming/richMedia/threads capability 선언 |
| **Zod Config Validation** | 600줄 deeply-nested schema, safeParse + UI hints | config 단일 진실 소스, 환경변수 override, runtime patch |
| **Plugin Hook System** | Priority-based hook execution, factory pattern | Tool/Hook 분리, 우선순위 실행 |
| **External Content Wrapping** | `<<<EXTERNAL_UNTRUSTED_CONTENT>>>` 패턴 | Prompt injection 방어 레이어 |
| **Timing-Safe Auth** | `crypto.timingSafeEqual` for token comparison | 모든 인증 비교에 적용 |
| **Health State Versioning** | Optimistic updates, presence tracking | 채널 상태 동기화에 적용 |
| **Error Classification** | `FailoverError` with typed reasons | 에러 카테고리 표준화 |

### 2.2 참조하되 단순화 (Adapt)

| 패턴 | OpenClaw 구현 | Axel 변형 |
|------|--------------|-----------|
| **ChannelPlugin 25+ adapters** | 각 채널마다 2-3 구현체 (core, dock, plugin) | MVP에서는 core+plugin만. dock은 후순위 |
| **WebSocket Challenge-Response** | nonce + timestamp handshake | JWT 기반 간소화 (single-user 초기) |
| **ReAct in CLI Runner** | CLI subprocess spawn + session persistence | In-process 실행 (subprocess overhead 제거) |
| **Plugin SDK (npm 배포)** | 완전한 npm 패키지, 외부 개발자 타겟 | Phase 3. 초기에는 내부 tool만 |

### 2.3 차용하지 않음 (Skip)

| 패턴 | 이유 |
|------|------|
| Multi-user RBAC | Axel은 Mark 전용. 팀 지원은 Phase 4 |
| OpenAI-compatible API | Open WebUI 호환 불필요. 전용 프로토콜 |
| Canvas/A2UI Framework | WebChat은 별도 SPA로 구현 |
| Agent CLI Runner (subprocess) | In-process ReAct loop이 더 효율적 |

---

## 3. First Principles: 코드 한 줄 전의 결정

### 3.1 언어 결정: TypeScript 단일 스택

**v1.0에서는** TypeScript(메인) + Python(메모리 마이크로서비스)의 이중 스택을 제안했다.

**v2.0 결정: TypeScript 단일 스택으로 변경.**

| 고려 사항 | Python 유지 | TypeScript 통합 | **결정** |
|-----------|------------|-----------------|----------|
| 채널 SDK | JS로 bridge 필요 | 네이티브 | **TS** |
| Memory Engine | axnmihn 코드 재사용 | 재구현 필요 | **TS** (아래 근거) |
| ChromaDB | Python 네이티브 | JS client 불안정 | **pgvector** (DB 통합) |
| C++ SIMD Decay | pybind11 | N-API/WASM | **불필요** (아래 근거) |
| LLM SDK | anthropic/google-genai | @anthropic-ai/sdk, @google/genai | **TS** |
| 운영 복잡도 | 2 프로세스, gRPC | 1 프로세스 | **TS** |
| 디버깅 | 2 스택 디버깅 | 1 스택 | **TS** |

**C++ SIMD가 불필요한 이유:**
- axnmihn에서 C++가 필요했던 이유: ChromaDB의 Python 오버헤드 + 메모리 내 JSON graph (956KB)
- Axel에서: pgvector는 DB 서버에서 벡터 연산을 처리. Graph는 PostgreSQL 쿼리로 대체.
- 1000개 기억의 decay 계산: TypeScript에서도 ~5ms 이내 (단순 수학 연산)
- 실제 병목은 LLM API 호출 (수 초)이지, decay 계산 (밀리초)이 아님

**Python 메모리 엔진을 포기하는 이유:**
- axnmihn의 메모리 코드는 **claude_reports에서 5개 God Object** + 보안 취약점이 발견됨
- "재사용"하면 기술 부채를 그대로 상속
- TypeScript로 재설계하면 OpenClaw의 Zod validation + type safety를 활용 가능
- **원칙: "모든 것부터 새로 만든다는 생각으로"**

### 3.2 데이터베이스 결정: PostgreSQL 단일 DB

**axnmihn**: SQLite(세션) + ChromaDB(벡터) + JSON(그래프) — 3개 스토리지
**Axel**: PostgreSQL + pgvector — 1개 스토리지

| 기능 | axnmihn | Axel |
|------|---------|------|
| 세션/메시지 | SQLite `sessions`, `messages` | PostgreSQL 동일 스키마 |
| 벡터 검색 | ChromaDB (별도 프로세스) | pgvector (같은 DB) |
| 지식 그래프 | JSON 파일 (956KB, 메모리 로드) | PostgreSQL 테이블 (entities, relations) |
| 캐시 | 없음 (매번 풀 로드) | Redis (세션, 최근 기억) |
| 트랜잭션 | SQLite WAL (단일 writer) | PostgreSQL MVCC (동시 read/write) |
| 백업 | 파일 복사 | `pg_dump` + WAL archiving |

**왜 Redis도 필요한가 (ADR-003):**
- Working Memory (현재 대화): 빈번한 read/write, 낮은 latency 필요
- Cross-Channel Session Router: pub/sub로 채널 간 이벤트 전파
- Rate Limiting: Token bucket 상태
- Intent Classification Cache: 동일 패턴의 반복 분류 결과
- **PostgreSQL은 "영구 기억", Redis는 "순간 기억"**
- **핵심 원칙**: Redis는 ephemeral cache — 모든 비즈니스 데이터의 source of truth는 PostgreSQL. Redis 전면 장애 시에도 PG fallback으로 서비스 지속 (latency 증가만 허용). Write는 PG-first, Redis는 read 가속 캐시. (ADR-003 상세 참조)

### 3.3 프로젝트 구조 결정: Monorepo (pnpm workspace)

```
axel/
├── package.json                    # Root workspace
├── pnpm-workspace.yaml
├── tsconfig.base.json              # Shared TS config (strict: true)
├── biome.json                      # Linter + Formatter (replaces ESLint+Prettier)
│
├── packages/
│   ├── core/                       # L0-L4: 핵심 엔진 (순수 로직, I/O 없음)
│   │   ├── src/
│   │   │   ├── memory/             # Memory layers (working, episodic, semantic, conceptual)
│   │   │   ├── persona/            # Identity engine, persona loading
│   │   │   ├── decay/              # Adaptive decay algorithm
│   │   │   ├── context/            # Context assembly, budget management
│   │   │   ├── orchestrator/       # Intent classification, priority queue
│   │   │   └── types/              # Shared type definitions (Zod schemas)
│   │   ├── tests/
│   │   └── package.json
│   │
│   ├── infra/                      # L5: 인프라 어댑터 (I/O 경계)
│   │   ├── src/
│   │   │   ├── db/                 # PostgreSQL + pgvector client
│   │   │   ├── cache/              # Redis client
│   │   │   ├── storage/            # R2/S3 client
│   │   │   ├── llm/               # LLM provider adapters (Anthropic, Google, Ollama)
│   │   │   ├── embedding/          # Embedding service
│   │   │   └── mcp/               # MCP tool execution
│   │   ├── tests/
│   │   └── package.json
│   │
│   ├── channels/                   # L6: 채널 어댑터
│   │   ├── src/
│   │   │   ├── types.ts            # AxelChannel interface
│   │   │   ├── discord/
│   │   │   ├── telegram/
│   │   │   ├── cli/
│   │   │   └── webchat/
│   │   ├── tests/
│   │   └── package.json
│   │
│   └── gateway/                    # L7: HTTP/WS 서버, 라우팅
│       ├── src/
│       │   ├── server.ts           # HTTP + WS server
│       │   ├── auth/               # Authentication, authorization
│       │   ├── routes/             # API routes
│       │   └── security/           # Input validation, rate limiting
│       ├── tests/
│       └── package.json
│
├── apps/
│   ├── axel/                       # 메인 애플리케이션 (진입점)
│   │   ├── src/
│   │   │   ├── main.ts             # Bootstrap, DI container setup
│   │   │   ├── config.ts           # Zod config schema + .env loading
│   │   │   └── lifecycle.ts        # Startup/shutdown hooks
│   │   └── package.json
│   │
│   └── webchat/                    # WebChat SPA (SvelteKit — ADR-017)
│       ├── src/
│       └── package.json
│
├── tools/                          # 개발 도구
│   ├── migrate/                    # axnmihn → Axel 데이터 마이그레이션
│   ├── seed/                       # 테스트 데이터 시드
│   └── bench/                      # 벤치마크
│
├── docker/
│   ├── Dockerfile
│   ├── docker-compose.yml          # PostgreSQL + Redis + Axel
│   └── docker-compose.dev.yml      # 개발 환경
│
└── docs/
    ├── adr/                        # Architecture Decision Records
    └── api/                        # API 문서
```

**monorepo를 선택한 이유:**
- `core`가 I/O에 의존하지 않음 → 순수 함수로 테스트 가능
- `infra`가 외부 시스템과의 경계를 담당 → mock으로 대체 가능
- `channels`이 독립적 → 새 채널 추가 시 다른 패키지 영향 없음
- OpenClaw의 channel/gateway 분리 패턴과 일치

### 3.4 Dependency Injection 결정

**axnmihn의 문제**: 13+ 전역 변수, 8종 singleton → 테스트 격리 불가

**Axel의 해법**: 생성자 주입 (Constructor Injection) + Container

```typescript
// 인터페이스 정의 (core 패키지 — I/O 무관)
interface MemoryRepository {
  store(memory: Memory): Promise<string>;
  query(query: string, limit: number): Promise<Memory[]>;
  decay(threshold: number): Promise<number>;
}

interface EmbeddingService {
  embed(text: string): Promise<Float32Array>;          // 단건 embedding
  embedBatch(texts: readonly string[]): Promise<Float32Array[]>; // 배치 embedding
  readonly dimension: number;                           // e.g., 768
}

// 구현 (infra 패키지 — I/O 실행)
class PgMemoryRepository implements MemoryRepository { ... }
class GeminiEmbeddingService implements EmbeddingService { ... }

// 조립 (app 패키지 — bootstrap 시점, apps/axel/src/main.ts)
// 전체 injectable 서비스 목록 (~20개, ADR-006 참조)
const container = {
  // Infrastructure (I/O 경계)
  pgPool:            createPgPool(config.db),
  redis:             createResilientRedis(config.redis),
  embeddingService:  new GeminiEmbeddingService(config.llm.google),
  anthropicProvider: new AnthropicLlmProvider(config.llm.anthropic),
  googleProvider:    new GoogleLlmProvider(config.llm.google),
  objectStorage:     new R2StorageClient(config.storage),

  // Repositories (infra — PG/Redis 의존)
  memoryRepo:        new PgMemoryRepository(pgPool),
  sessionRepo:       new PgSessionRepository(pgPool),
  entityRepo:        new PgEntityRepository(pgPool),
  workingMemory:     new RedisWorkingMemory(redis, pgPool, circuitBreaker),
  intentCache:       new RedisIntentCache(redis, circuitBreaker),
  prefetchCache:     new RedisPrefetchCache(redis, circuitBreaker),
  rateLimiter:       new RedisRateLimiter(redis, circuitBreaker),

  // Core Engines (순수 로직, I/O 없음)
  decayCalculator:   new DecayCalculator(config.memory.decay),
  contextAssembler:  new ContextAssembler(config.memory.budgets, tokenCounter),
  personaEngine:     new PersonaEngine(config.persona),
  modelRouter:       new ModelRouter(config.llm.fallbackChain),

  // Orchestration
  sessionRouter:     new SessionRouter(sessionRepo, workingMemory, redis),
  toolRegistry:      new ToolRegistry(/* tools registered via defineTool() */),
  reactLoop:         new ReactLoopRunner(reactConfig),
};
const memoryEngine = new MemoryEngine(container.memoryRepo, container.embeddingService, container.decayCalculator);
```

**왜 DI 프레임워크(tsyringe, inversify)를 쓰지 않는가:**
- 런타임 decorator/reflect-metadata 의존 → 빌드 복잡도 증가
- 수동 주입으로도 충분 (서비스 수 ~20개 내외, 위 목록 참조)
- OpenClaw도 프레임워크 없이 수동 주입 사용

### 3.5 Core Domain Types (packages/core/src/types/)

구현 전 모든 핵심 타입을 정의한다. 이 타입들은 `packages/core/src/types/`에 위치하며, 다른 패키지에서 import한다. (ERR-035 해소)

```typescript
// packages/core/src/types/memory.ts

/** 메모리 유형 */
type MemoryType = "fact" | "preference" | "insight" | "conversation";

/** Semantic Memory 단위 (Layer 3) */
interface Memory {
  readonly uuid: string;
  readonly content: string;
  readonly memoryType: MemoryType;
  readonly importance: number;
  readonly embedding: Float32Array;
  readonly createdAt: Date;
  readonly lastAccessed: Date;
  readonly accessCount: number;
  readonly sourceChannel: string | null;
  readonly channelMentions: Record<string, number>;
  readonly sourceSession: string | null;
  readonly decayedImportance: number | null;
  readonly lastDecayedAt: Date | null;
}

/** 메모리 검색 결과 */
interface MemorySearchResult {
  readonly memory: Memory;
  readonly score: number;         // cosine similarity
  readonly source: "semantic" | "graph" | "prefetch";
}

// packages/core/src/types/message.ts

/** 메시지 역할 */
type MessageRole = "user" | "assistant" | "system" | "tool";

/** 대화 메시지 */
interface Message {
  readonly sessionId: string;
  readonly turnId: number;
  readonly role: MessageRole;
  readonly content: string;
  readonly channelId: string | null;
  readonly timestamp: Date;
  readonly emotionalContext: string;
  readonly metadata: Record<string, unknown>;
}

// packages/core/src/types/session.ts

/** 세션 상태 머신 (ERR-041 해소) */
type SessionState =
  | "initializing"    // 세션 생성 중
  | "active"          // 대화 진행 중
  | "thinking"        // LLM 응답 생성 중
  | "tool_executing"  // 도구 실행 중
  | "summarizing"     // 세션 요약 생성 중
  | "ending"          // 정리 중 (메모리 flush, 요약 저장)
  | "ended";          // 완료

/** 세션 요약 (Episodic Memory 저장용) */
interface SessionSummary {
  readonly sessionId: string;
  readonly summary: string;
  readonly keyTopics: readonly string[];
  readonly emotionalTone: string;
  readonly turnCount: number;
  readonly channelHistory: readonly string[];
  readonly startedAt: Date;
  readonly endedAt: Date;
}

// packages/core/src/types/react.ts

/** ReAct Loop 이벤트 (스트리밍 출력) */
type ReActEvent =
  | { readonly type: "message_delta"; readonly content: string }
  | { readonly type: "thinking_delta"; readonly content: string }
  | { readonly type: "tool_call"; readonly tool: ToolCallRequest }
  | { readonly type: "tool_result"; readonly result: ToolResult }
  | { readonly type: "error"; readonly error: AxelError }
  | { readonly type: "done"; readonly usage: TokenUsage };

/** 도구 호출 요청 */
interface ToolCallRequest {
  readonly toolName: string;
  readonly args: unknown;
  readonly callId: string;
}

// packages/core/src/types/tool.ts

/** 도구 실행 결과 */
interface ToolResult {
  readonly callId: string;
  readonly success: boolean;
  readonly content: unknown;
  readonly error?: string;
  readonly durationMs: number;
}

/** 도구 정의 */
interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly category: "memory" | "file" | "iot" | "research" | "system" | "agent";
  readonly inputSchema: z.ZodSchema;
  readonly requiresApproval: boolean;
  readonly handler: (args: unknown) => Promise<ToolResult>;
}

// packages/core/src/types/health.ts

/** 시스템 건강 상태 */
type HealthState = "healthy" | "degraded" | "unhealthy";

interface HealthStatus {
  readonly state: HealthState;
  readonly checks: Record<string, ComponentHealth>;
  readonly timestamp: Date;
  readonly uptime: number;          // seconds
}

interface ComponentHealth {
  readonly state: HealthState;
  readonly latencyMs: number | null;
  readonly message: string | null;
  readonly lastChecked: Date;
}

// packages/core/src/types/engine.ts

/** Memory Engine 인터페이스 (DI 대상) */
interface MemoryEngine {
  store(content: string, memoryType: MemoryType, importance: number, channelId: string | null): Promise<string>;
  search(query: string, limit: number, channelId?: string): Promise<readonly MemorySearchResult[]>;
  decay(threshold: number): Promise<number>;    // 삭제된 메모리 수 반환
  consolidate(): Promise<void>;                 // L2→L3 통합
  getStats(): Promise<MemoryStats>;
}

interface MemoryStats {
  readonly totalMemories: number;
  readonly byType: Record<MemoryType, number>;
  readonly avgImportance: number;
  readonly oldestMemory: Date | null;
  readonly lastConsolidation: Date | null;
}

// packages/core/src/types/common.ts

/** 토큰 사용량 */
interface TokenUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheCreationTokens: number;
}
```

이 타입 정의는 구현 phase에서 Zod schema와 1:1 매핑된다. 런타임 검증은 Zod, 컴파일 타임 검증은 TypeScript interface로 이중 보장한다.

---

## 4. The Turtle Stack: 밑바닥부터 쌓기

> **명칭 규칙 (ERR-004/ERR-023 해소)**: 이 문서에서 "Layer"는 두 가지 번호 체계를 사용한다:
> - **Turtle Stack Layer 0~10**: 시스템 아키텍처의 수직 계층 (이 섹션). 패키지 구조와 대응.
> - **Memory Layer 0~5**: 6-Layer Memory Architecture (Section 4, Turtle Stack Layer 3 내부). Stream Buffer(M0) → Working(M1) → Episodic(M2) → Semantic(M3) → Conceptual(M4) → Meta(M5).
>
> 혼동 방지를 위해, Memory layer를 언급할 때는 "Memory Layer" 또는 "M0~M5"로, Turtle Stack layer를 언급할 때는 "Turtle Layer" 또는 "TL0~TL10"으로 구분한다.

### Layer 0: Runtime & Build System (거북이의 거북이)

```
┌─────────────────────────────────────────────────┐
│  Layer 0: Runtime & Build System                │
│                                                 │
│  Node.js 22 LTS + TypeScript 5.7 strict         │
│  pnpm 9 (workspace) + tsdown (build)            │
│  Biome (lint + format) + vitest (test)          │
│  Docker (containerization)                      │
└─────────────────────────────────────────────────┘
```

| 도구 | 선택 | 대안 | 근거 |
|------|------|------|------|
| **런타임** | Node.js 22 LTS | Bun, Deno | LTS 안정성, OpenClaw 호환, npm 생태계 |
| **패키지 매니저** | pnpm 9 | npm, yarn | Workspace 지원, 디스크 효율, OpenClaw 동일 |
| **빌드** | tsdown | tsc, esbuild, swc | Rolldown 기반 빠른 빌드, ESM 네이티브, 설정 최소화 |
| **타입 체크** | tsc (noEmit) | — | tsdown은 타입 체크 안 함, tsc를 별도 실행 |
| **린터** | Biome | ESLint + Prettier | 단일 도구, 빠른 속도, 설정 최소화 |
| **테스트** | vitest | jest | OpenClaw 동일, ESM 네이티브, 빠른 실행 |
| **컨테이너** | Docker + Compose | Podman | 표준, CI/CD 호환 |

**tsconfig 핵심 설정:**
```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "target": "ES2023",
    "module": "NodeNext",
    "moduleResolution": "NodeNext"
  }
}
```

`noUncheckedIndexedAccess`와 `exactOptionalPropertyTypes`는 OpenClaw에서도 쓰지 않는 엄격한 설정이지만, ground-up이니까 처음부터 적용한다.

### Layer 1: Configuration & Secrets

```
┌─────────────────────────────────────────────────┐
│  Layer 1: Configuration & Secrets               │
│                                                 │
│  Zod schema (single source of truth)            │
│  .env → validated config object                 │
│  No magic numbers, no scattered constants       │
└─────────────────────────────────────────────────┘
```

**axnmihn 문제**: config.py + timeouts.py + 로컬 상수 = 3곳 (claude_reports #14)
**axnmihn 문제**: 328개 환경변수, 절반이 기본값에 묻혀 발견 불가

**Axel 해법: Zod schema가 유일한 진실**

```typescript
// apps/axel/src/config.ts
// NOTE: 아래 예시는 Zod v3 API 기반. v4 안정화 후 마이그레이션 예정 (ADR-005 참조).
import { z } from "zod";

const LlmConfigSchema = z.object({
  anthropic: z.object({
    apiKey: z.string().min(1),
    model: z.string().default("claude-sonnet-4-5-20250929"),
    thinkingBudget: z.number().int().min(0).max(32000).default(10000),
    maxTokens: z.number().int().default(16384),
  }),
  google: z.object({
    apiKey: z.string().min(1),
    flashModel: z.string().default("gemini-3-flash-preview"),
    embeddingModel: z.string().default("gemini-embedding-001"),
    embeddingDimension: z.number().int().default(768),
  }),
  fallbackChain: z.array(z.enum(["anthropic", "google", "ollama"])).default(["anthropic", "google"]),
});

const MemoryConfigSchema = z.object({
  decay: z.object({
    baseRate: z.number().default(0.001),
    minRetention: z.number().min(0).max(1).default(0.3),
    deleteThreshold: z.number().default(0.03),
    accessStabilityK: z.number().default(0.3),
    relationResistanceK: z.number().default(0.1),
    channelDiversityK: z.number().default(0.2),
    recencyBoost: z.number().default(1.3),
    recencyAgeThreshold: z.number().default(168),        // hours
    recencyAccessThreshold: z.number().default(24),      // hours
    typeMultipliers: z.object({
      fact: z.number().default(0.3),
      preference: z.number().default(0.5),
      insight: z.number().default(0.7),
      conversation: z.number().default(1.0),
    }),
  }),
  budgets: z.object({
    systemPrompt: z.number().int().default(8000),   // tokens
    workingMemory: z.number().int().default(40000),
    semanticSearch: z.number().int().default(12000),
    graphTraversal: z.number().int().default(4000),
    sessionArchive: z.number().int().default(4000),
    streamBuffer: z.number().int().default(2000),
    metaMemory: z.number().int().default(2000),
    toolDefinitions: z.number().int().default(4000),
  }),
  workingMemoryMaxTurns: z.number().int().default(20),
  sessionArchiveDays: z.number().int().default(30),
  consolidationIntervalHours: z.number().int().default(6),
});

const ChannelConfigSchema = z.object({
  discord: z.object({
    botToken: z.string().optional(),
    allowedGuilds: z.array(z.string()).default([]),
  }).optional(),
  telegram: z.object({
    botToken: z.string().optional(),
    allowedUsers: z.array(z.number()).default([]),
  }).optional(),
  cli: z.object({
    enabled: z.boolean().default(true),
  }).optional(),
});

const SecurityConfigSchema = z.object({
  iotRequireHttps: z.boolean().default(true),
  commandAllowlist: z.array(z.string()).default([
    // 읽기 전용 명령 (승인 불필요)
    "ls", "cat", "head", "tail", "grep", "find", "wc", "date", "whoami",
    // 개발 도구 (requiresApproval: true에서 별도 승인)
    "git", "pnpm", "node",
    // docker/npm은 기본 allowlist에서 제외 — 명시적으로 config에 추가해야 사용 가능
  ]),
  maxRequestsPerMinute: z.number().int().default(30),
  toolApprovalRequired: z.array(z.string()).default([
    "execute_command", "delete_file", "hass_control_device",
  ]),
});

export const AxelConfigSchema = z.object({
  env: z.enum(["development", "production", "test"]).default("development"),
  port: z.number().int().default(8000),
  host: z.string().default("0.0.0.0"),
  timezone: z.string().default("America/Vancouver"),
  db: z.object({
    url: z.string().url(),
    maxConnections: z.number().int().default(10),
  }),
  redis: z.object({
    url: z.string().url(),
    connectTimeoutMs: z.number().int().default(5_000),
    commandTimeoutMs: z.number().int().default(1_000),
    maxRetriesPerRequest: z.number().int().default(3),
  }),
  llm: LlmConfigSchema,
  memory: MemoryConfigSchema,
  channels: ChannelConfigSchema,
  security: SecurityConfigSchema,
  persona: z.object({
    path: z.string().default("./data/dynamic_persona.json"),
    hotReload: z.boolean().default(true),
  }),
});

export type AxelConfig = z.infer<typeof AxelConfigSchema>;
```

**환경변수 매핑 규칙:**
```
AXEL_DB_URL           → config.db.url
AXEL_REDIS_URL        → config.redis.url
AXEL_LLM_ANTHROPIC_API_KEY → config.llm.anthropic.apiKey
AXEL_PORT             → config.port
```

중첩 객체는 `_`로 구분. `.env.example`에 모든 변수를 문서화.

### Layer 2: Persistence (가장 느린 것부터)

```
┌─────────────────────────────────────────────────┐
│  Layer 2: Persistence                           │
│                                                 │
│  PostgreSQL 16 + pgvector 0.8 (영구 기억)       │
│  Redis 7 / Valkey (순간 기억)                    │
│  Cloudflare R2 (미디어, 아티팩트)                 │
└─────────────────────────────────────────────────┘
```

#### 2.1 PostgreSQL Schema (핵심)

```sql
-- 확장 모듈
CREATE EXTENSION IF NOT EXISTS vector;         -- pgvector
CREATE EXTENSION IF NOT EXISTS pg_trgm;        -- Trigram (텍스트 유사도)

-- ═══════════════════════════════════════════
-- EPISODIC MEMORY (axnmihn Layer 2 진화)
-- ═══════════════════════════════════════════

CREATE TABLE sessions (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    session_id      TEXT UNIQUE NOT NULL,
    channel_id      TEXT,                       -- 새: 어떤 채널에서 시작됐는지
    summary         TEXT,
    key_topics      JSONB DEFAULT '[]'::jsonb,  -- TEXT → JSONB로 변경
    emotional_tone  TEXT,
    turn_count      INTEGER NOT NULL DEFAULT 0,
    started_at      TIMESTAMPTZ NOT NULL,
    ended_at        TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- axnmihn에 없던 인덱스
    CONSTRAINT sessions_started_at_check CHECK (started_at <= COALESCE(ended_at, NOW()))
);

CREATE INDEX idx_sessions_started ON sessions (started_at DESC);
CREATE INDEX idx_sessions_channel ON sessions (channel_id, started_at DESC);
CREATE INDEX idx_sessions_topics ON sessions USING gin (key_topics);

CREATE TABLE messages (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    session_id      TEXT NOT NULL REFERENCES sessions(session_id),
    turn_id         INTEGER NOT NULL,
    role            TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
    content         TEXT NOT NULL,
    channel_id      TEXT,                       -- 새: 메시지별 채널 추적
    timestamp       TIMESTAMPTZ NOT NULL,
    emotional_context TEXT DEFAULT 'neutral',
    metadata        JSONB DEFAULT '{}'::jsonb,  -- 새: 확장 가능한 메타데이터

    UNIQUE (session_id, turn_id, role)          -- 중복 방지
);

CREATE INDEX idx_messages_session ON messages (session_id, turn_id);
CREATE INDEX idx_messages_timestamp ON messages (timestamp DESC);
CREATE INDEX idx_messages_content_trgm ON messages USING gin (content gin_trgm_ops);

-- ═══════════════════════════════════════════
-- SEMANTIC MEMORY (axnmihn Layer 3 진화)
-- ═══════════════════════════════════════════

CREATE TABLE memories (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    uuid            TEXT UNIQUE NOT NULL DEFAULT gen_random_uuid()::text,
    content         TEXT NOT NULL,
    memory_type     TEXT NOT NULL CHECK (memory_type IN ('fact', 'preference', 'insight', 'conversation')),
    importance      REAL NOT NULL DEFAULT 0.5,
    embedding       vector(768) NOT NULL,       -- pgvector: 768d (Gemini embedding-001)

    -- Decay 메타데이터
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_accessed   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    access_count    INTEGER NOT NULL DEFAULT 1,

    -- 새: Cross-Channel 메타데이터
    source_channel  TEXT,                       -- 어떤 채널에서 생성됐는지
    channel_mentions JSONB DEFAULT '{}'::jsonb, -- {"discord": 3, "telegram": 1}
    source_session  TEXT,

    -- 새: 정리 상태
    decayed_importance REAL,                    -- 마지막 decay 계산 결과
    last_decayed_at   TIMESTAMPTZ
);

CREATE INDEX idx_memories_embedding ON memories USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);       -- HNSW 권장 (RES-001: 7.4x faster queries, better recall)
CREATE INDEX idx_memories_importance ON memories (importance DESC);
CREATE INDEX idx_memories_type ON memories (memory_type, importance DESC);
CREATE INDEX idx_memories_accessed ON memories (last_accessed DESC);

-- ═══════════════════════════════════════════
-- CONCEPTUAL MEMORY (axnmihn Layer 4 진화)
-- ═══════════════════════════════════════════

CREATE TABLE entities (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    entity_id       TEXT UNIQUE NOT NULL,        -- 정규화된 이름 (lowercase)
    name            TEXT NOT NULL,                -- 원본 이름
    entity_type     TEXT NOT NULL,                -- person, project, concept, tool, location...
    properties      JSONB DEFAULT '{}'::jsonb,
    mentions        INTEGER NOT NULL DEFAULT 1,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_accessed   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_entities_name ON entities USING gin (name gin_trgm_ops);
CREATE INDEX idx_entities_type ON entities (entity_type);

CREATE TABLE relations (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    source_id       TEXT NOT NULL REFERENCES entities(entity_id),
    target_id       TEXT NOT NULL REFERENCES entities(entity_id),
    relation_type   TEXT NOT NULL,               -- knows, prefers, works_on, related_to, contradicts
    weight          REAL NOT NULL DEFAULT 1.0,
    context         TEXT,                         -- 관계가 생성된 맥락
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (source_id, target_id, relation_type)
);

CREATE INDEX idx_relations_source ON relations (source_id);
CREATE INDEX idx_relations_target ON relations (target_id);
CREATE INDEX idx_relations_type ON relations (relation_type);

-- ═══════════════════════════════════════════
-- META MEMORY (새로 추가)
-- ═══════════════════════════════════════════

CREATE TABLE memory_access_patterns (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    query_text      TEXT NOT NULL,
    matched_memory_ids BIGINT[] NOT NULL,
    relevance_scores REAL[] NOT NULL,
    channel_id      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_access_patterns_time ON memory_access_patterns (created_at DESC);

-- Materialized view: 자주 접근되는 기억 클러스터
CREATE MATERIALIZED VIEW hot_memories AS
SELECT
    m.id, m.uuid, m.content, m.memory_type, m.importance,
    m.access_count, m.last_accessed,
    COUNT(DISTINCT (m.channel_mentions->k)::int) as channel_diversity
FROM memories m,
     LATERAL jsonb_object_keys(m.channel_mentions) k
WHERE m.last_accessed > NOW() - INTERVAL '7 days'
GROUP BY m.id
ORDER BY m.access_count DESC, channel_diversity DESC
LIMIT 100;

-- ═══════════════════════════════════════════
-- INTERACTION LOGS (axnmihn 텔레메트리 계승)
-- ═══════════════════════════════════════════

CREATE TABLE interaction_logs (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ts              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    session_id      TEXT,
    channel_id      TEXT,
    turn_id         INTEGER,
    effective_model TEXT NOT NULL,
    tier            TEXT NOT NULL,
    router_reason   TEXT NOT NULL,
    latency_ms      INTEGER,
    ttft_ms         INTEGER,                    -- time-to-first-token
    tokens_in       INTEGER,
    tokens_out      INTEGER,
    tool_calls      JSONB DEFAULT '[]'::jsonb,
    error           TEXT
);

CREATE INDEX idx_interaction_logs_ts ON interaction_logs (ts DESC);
CREATE INDEX idx_interaction_logs_model ON interaction_logs (effective_model, ts DESC);
```

#### 2.2 Redis 구조

```
# Working Memory (현재 활성 대화)
HASH   axel:working:{userId}         # 현재 세션 메타데이터
LIST   axel:working:{userId}:turns   # 최근 N턴 (JSON)
EXPIRE 3600                          # 1시간 비활동 시 만료 (PostgreSQL에 이미 저장됨)

# Cross-Channel Session Router
HASH   axel:session:{userId}         # 현재 활성 세션 ID, 채널, 마지막 활동
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

**Redis 에러 처리 및 Shadow Write (ADR-003)**:

모든 Redis 명령은 Circuit Breaker (ADR-021)로 감싸며, 장애 시 PostgreSQL fallback으로 전환한다.

**Shadow Write 규칙:**

| Redis Key | PostgreSQL Shadow | Write Timing | Fallback on Redis Failure |
|-----------|-------------------|--------------|--------------------------|
| `axel:working:*:turns` | `messages` table | 매 턴 PG-first write | PG direct read (최근 20턴 ORDER BY) |
| `axel:session:*` | `sessions` table | 세션 시작/종료 시 | PG direct read |
| `axel:rate:*` | 없음 (ephemeral only) | — | in-memory Map (프로세스 수명) |
| `axel:intent:*` | 없음 (cache only) | — | cache miss → 매번 분류 실행 |
| `axel:prefetch:*` | 없음 (cache only) | — | prefetch 비활성화 (on-demand only) |

**핵심 원칙**: Redis에 저장된 모든 비즈니스 데이터는 PostgreSQL에도 존재하거나, 유실 시 재생성 가능하다. Redis가 유일한 source of truth인 데이터는 존재하지 않는다. Write는 PG-first (Working Memory는 PG INSERT 후 Redis cache update).

**Degradation Path:**
1. 개별 명령 실패 → 명령별 재시도 (최대 3회, 지수 백오프) → PG fallback
2. Circuit breaker OPEN (5회 연속 실패) → 모든 Redis 호출 skip → PG fallback (latency ~150ms 증가)
3. Pub/sub 불가 → Polling fallback (1초 간격 PG session_events 조회)
4. 복구 → Circuit breaker HALF_OPEN 성공 → 정상 전환 + cache warm-up

상세 에러 처리 패턴 (5개 critical function 각각)은 ADR-003 참조.

### Layer 3: Memory Engine

```
┌─────────────────────────────────────────────────┐
│  Layer 3: Memory Engine                         │
│                                                 │
│  6-Layer Memory (Stream→Working→Episodic→       │
│  Semantic→Conceptual→Meta)                      │
│  Unified Memory Bus (cross-channel)             │
│  Adaptive Decay v2                              │
│  Context Assembly (token-accurate budgeting)    │
└─────────────────────────────────────────────────┘
```

#### 3.1 Memory Layer 설계 (axnmihn 4-Layer → 6-Layer)

```
Layer 0: Stream Buffer          [NEW]
├── 저장소: Redis Streams
├── TTL: 현재 세션 동안만
├── 용도: 실시간 이벤트 (타이핑 시작, 채널 전환, IoT 이벤트)
├── 핵심: Speculative Prefetch 트리거
└── axnmihn 대응: 없음 (신규)

Layer 1: Working Memory         [axnmihn L1 진화]
├── 저장소: Redis Hash + List
├── TTL: 활성 세션 동안 (비활동 1시간 후 flush)
├── 용도: 현재 대화 컨텍스트 (최근 20턴)
├── 개선점:
│   ├── axnmihn: Python deque(maxlen=80), JSON 파일 영속화
│   ├── Axel: Redis List, PostgreSQL 비동기 flush
│   └── 차이: cross-channel 통합 (Discord 턴 + Telegram 턴 = 하나의 working memory)
└── Progressive Compression 유지

Layer 2: Episodic Memory        [axnmihn L2 진화]
├── 저장소: PostgreSQL (sessions, messages)
├── TTL: 30일 (axnmihn: 7일)
├── 용도: 세션 요약, 감정 태그, 시간적 검색
├── 개선점:
│   ├── axnmihn: SQLite, __del__ 사용, 직접 _get_connection() 호출
│   ├── Axel: PostgreSQL, connection pool, prepared statements
│   └── 차이: channel_id 추적, JSONB topics (vs TEXT), trigram 검색
└── 세션 요약 자동 생성 (Gemini Flash)

Layer 3: Semantic Memory        [axnmihn L3 진화]
├── 저장소: PostgreSQL pgvector
├── TTL: Adaptive Decay (중요도 0.03 이하 삭제)
├── 용도: 벡터 유사도 검색, 장기 기억
├── 개선점:
│   ├── axnmihn: ChromaDB (별도 프로세스), 768d, Python sync I/O
│   ├── Axel: pgvector (같은 DB), 768d, async query
│   └── 차이: 하이브리드 검색 (vector + trigram + metadata), channel_mentions 추적
└── HNSW 인덱스 (m=16, ef_construction=64) — RES-001 권장

Layer 4: Conceptual Memory      [axnmihn L4 진화]
├── 저장소: PostgreSQL (entities, relations)
├── TTL: 영구 (pruning은 있되 자동 삭제 없음)
├── 용도: 엔티티 관계, 지식 그래프 탐색
├── 개선점:
│   ├── axnmihn: JSON 파일 (956KB 메모리 로드), BFS in Python/C++
│   ├── Axel: PostgreSQL 테이블, SQL 기반 graph traversal
│   └── 차이: JOIN 쿼리로 BFS 대체, 무제한 스케일, 트랜잭션 안전
└── 엔티티 추출: LLM 기반 (Gemini Flash)

Layer 5: Meta Memory            [NEW]
├── 저장소: PostgreSQL (memory_access_patterns) + Materialized View
├── TTL: 7일 rolling window
├── 용도: 검색 패턴 학습, Speculative Prefetch
├── 동작: 자주 접근되는 기억 클러스터를 사전 식별
├── 갱신: REFRESH MATERIALIZED VIEW CONCURRENTLY (매 6시간)
└── Feedback loop (ERR-046 해소):
    ├── 1. 매 semantic search 후 memory_access_patterns에 (query, matched_ids, scores) 기록
    ├── 2. hot_memories materialized view가 6시간마다 갱신
    ├── 3. Speculative Prefetch가 hot_memories를 참조하여 typing indicator 시 선제 로딩
    └── 4. 선제 로딩된 기억이 실제 사용되면 access_count 증가 → 양성 피드백
```

#### 3.2 Adaptive Decay v2 (정밀 수식)

axnmihn의 원본 수식 (decay_calculator.py에서 추출):

```
# axnmihn 원본
effective_rate = (BASE_DECAY_RATE * TYPE_MULTIPLIER / STABILITY) * (1 - RESISTANCE)
STABILITY = 1 + ACCESS_STABILITY_K * ln(1 + access_count)
RESISTANCE = min(1.0, connection_count * RELATION_RESISTANCE_K)
Decayed(t) = importance * exp(-effective_rate * hours_passed)

# Recency Paradox: age > 168h AND last_accessed < 24h → *= 1.3
# Min Retention: never below 30% of original
```

Axel v2 확장:

```typescript
// packages/core/src/decay/calculator.ts

interface DecayInput {
  importance: number;
  memoryType: "fact" | "preference" | "insight" | "conversation";
  hoursElapsed: number;
  accessCount: number;
  connectionCount: number;      // graph relations
  channelMentions: number;      // 새: 이 기억이 언급된 **고유 채널 수** (distinct count of channel_mentions JSONB keys)
  lastAccessedHoursAgo: number;
  ageHours: number;
}

interface DecayConfig {
  baseRate: number;             // 0.001
  minRetention: number;         // 0.3
  deleteThreshold: number;      // 0.03
  accessStabilityK: number;     // 0.3
  relationResistanceK: number;  // 0.1
  channelDiversityK: number;    // 0.2 (새)
  recencyBoost: number;         // 1.3
  recencyAgeThreshold: number;  // 168 (hours)
  recencyAccessThreshold: number; // 24 (hours)
  typeMultipliers: Record<string, number>;
}

function calculateDecayedImportance(input: DecayInput, config: DecayConfig): number {
  const { importance, memoryType, hoursElapsed, accessCount, connectionCount,
          channelMentions, lastAccessedHoursAgo, ageHours } = input;

  // 1. Type multiplier
  const typeMultiplier = config.typeMultipliers[memoryType] ?? 1.0;

  // 2. Access stability (자주 접근할수록 안정)
  const stability = 1 + config.accessStabilityK * Math.log1p(accessCount);

  // 3. Relation resistance (그래프 연결이 많을수록 안정)
  const resistance = Math.min(1.0, connectionCount * config.relationResistanceK);

  // 4. Channel diversity boost (새: 여러 채널에서 언급될수록 중요)
  const channelBoost = 1.0 / (1 + config.channelDiversityK * channelMentions);

  // 5. Effective decay rate
  const effectiveRate = (config.baseRate * typeMultiplier * channelBoost / stability) * (1 - resistance);

  // 6. Exponential decay
  let decayed = importance * Math.exp(-effectiveRate * hoursElapsed);

  // 7. Recency paradox (오래됐지만 최근 접근 → 부스트)
  if (ageHours > config.recencyAgeThreshold && lastAccessedHoursAgo < config.recencyAccessThreshold) {
    decayed *= config.recencyBoost;
  }

  // 8. Min retention floor
  const floor = config.minRetention * importance;
  return Math.max(decayed, floor);
}
```

**axnmihn과의 차이:**
- `channelBoost` 추가: Discord+Telegram+CLI에서 모두 언급된 기억은 decay가 느려짐
- 순수 함수: I/O 없음, 테스트 용이
- 설정 주입: magic number 제거 (claude_reports #14 해결)

#### 3.3 Context Assembly (token-accurate budgeting)

**axnmihn 문제**: character 기반 예산 (1 char ≈ 0.25 tokens 추정) — 실제 토큰 수와 편차 큼

**Axel 해법**: Anthropic SDK countTokens() 기반 정확한 토큰 카운팅 (ADR-012, ADR-018). countTokens()는 항상 async API 호출 — 동기 근사치 사용 안 함. Context assembly 시 한 번에 배치 호출하여 latency 최소화.

```typescript
// packages/core/src/context/assembler.ts

interface ContextBudget {
  systemPrompt: number;    // 8,000 tokens
  streamBuffer: number;    // 2,000
  workingMemory: number;   // 40,000
  semanticSearch: number;  // 12,000
  graphTraversal: number;  // 4,000
  sessionArchive: number;  // 4,000
  metaMemory: number;      // 2,000
  toolDefinitions: number; // 4,000
  // total budget: 76,000 tokens
  // 200K 모델 기준 generation: ~124,000 tokens
}

interface AssembledContext {
  systemPrompt: string;
  sections: ContextSection[];
  totalTokens: number;
  budgetUtilization: Record<string, number>; // 각 섹션의 실제 사용량
}

interface ContextSection {
  readonly name: string;
  readonly content: string;
  readonly tokens: number;
  readonly source: string; // 어떤 memory layer에서 왔는지 (e.g., "M1:working", "M3:semantic")
}

// Context Assembler는 I/O를 직접 수행하지 않음.
// 각 memory layer의 데이터는 주입된 provider를 통해 가져옴 (ERR-006 해소).
interface ContextDataProvider {
  getWorkingMemory(userId: string, limit: number): Promise<readonly Turn[]>;
  searchSemantic(query: string, limit: number): Promise<readonly MemorySearchResult[]>;
  traverseGraph(entityId: string, depth: number): Promise<readonly Entity[]>;
  getSessionArchive(userId: string, days: number): Promise<readonly SessionSummary[]>;
  getStreamBuffer(userId: string): Promise<readonly StreamEvent[]>;
  getMetaMemory(userId: string): Promise<readonly PrefetchedMemory[]>;
  getToolDefinitions(): readonly ToolDefinition[];
}
// ContextAssembler는 ContextDataProvider를 생성자 주입받아 사용.
// 이렇게 하면 core 패키지에서 I/O 없이 테스트 가능.
```

**조립 순서** (우선순위 순):
1. System Prompt + Persona (불변, 최우선)
2. Working Memory (현재 대화 — 가장 중요)
3. Stream Buffer (실시간 이벤트)
4. Semantic Search (쿼리 관련 장기 기억)
5. Graph Traversal (엔티티 관계)
6. Session Archive (이전 세션 요약)
7. Meta Memory (선제 로딩)
8. Tool Definitions (사용 가능한 도구)

각 섹션이 예산을 초과하면 **truncate** (앞부분 유지, 뒷부분 절삭).

### Layer 4: Identity & Persona Engine

```
┌─────────────────────────────────────────────────┐
│  Layer 4: Identity & Persona Engine             │
│                                                 │
│  dynamic_persona.json (hot-reloadable)          │
│  Channel adaptation (formality, verbosity)      │
│  Learned behaviors (confidence-ranked)          │
│  Bio-system metaphor dictionary                 │
└─────────────────────────────────────────────────┘
```

**axnmihn의 IdentityManager** (272줄): 잘 설계됨. 계승하되 TypeScript로 변환.

```typescript
// packages/core/src/persona/engine.ts

// Zod schema로 persona 파일을 검증
const PersonaSchema = z.object({
  core_identity: z.string(),
  voice_style: z.object({
    name: z.string(),
    nuances: z.array(z.string()),
    good_example: z.string(),
    bad_example: z.string(),
  }),
  honesty_directive: z.string(),
  learned_behaviors: z.array(z.object({
    insight: z.string(),
    confidence: z.number().min(0).max(1),
    source_count: z.number().int(),
    first_learned: z.string(),
  })),
  user_preferences: z.record(z.string(), z.unknown()),
  relationship_notes: z.array(z.string()),
  constraints: z.array(z.string()),
  version: z.number().int(),
});

type Persona = z.infer<typeof PersonaSchema>;

interface PersonaEngine {
  load(): Promise<Persona>;
  reload(): Promise<Persona>;           // hot-reload (아래 메커니즘 참조)
  getSystemPrompt(channel: string): string; // 채널별 톤 적응
  evolve(insight: string, confidence: number): Promise<void>;
  updatePreference(key: string, value: unknown): Promise<void>;
}

// Hot-reload 메커니즘 (ERR-045 해소):
// 1. fs.watch()로 dynamic_persona.json 파일 변경 감지
// 2. 변경 감지 시 debounce (500ms) 후 reload() 호출
// 3. reload()는 Zod PersonaSchema로 파싱 → 실패 시 이전 persona 유지 + 경고 로그
// 4. 성공 시 내부 캐시 갱신, 다음 getSystemPrompt() 호출부터 새 persona 적용
// 5. evolve()/updatePreference()는 파일에 atomic write (write to tmp → rename)
//    → fs.watch() 트리거 → 다른 프로세스에서도 동기화

// 채널별 적응 규칙
const CHANNEL_ADAPTATIONS: Record<string, { formality: number; verbosity: number }> = {
  discord:  { formality: 0.2, verbosity: 0.3 },
  telegram: { formality: 0.1, verbosity: 0.2 },
  slack:    { formality: 0.5, verbosity: 0.5 },
  cli:      { formality: 0.0, verbosity: 0.4 },
  email:    { formality: 0.7, verbosity: 0.8 },
  webchat:  { formality: 0.3, verbosity: 0.5 },
};
```

**axnmihn에서 이전할 데이터:**
- `dynamic_persona.json` → 그대로 이전 (JSON 구조 호환)
- 93개 learned_behaviors → 그대로 이전
- Bio-system metaphor dictionary → persona 파일 내 또는 기억으로 이전

### Layer 5: LLM Abstraction

```
┌─────────────────────────────────────────────────┐
│  Layer 5: LLM Abstraction                       │
│                                                 │
│  Provider adapters (Anthropic, Google, Ollama)   │
│  Model Router (task → model selection)          │
│  Circuit Breaker + Retry                        │
│  Streaming-first response pipeline              │
└─────────────────────────────────────────────────┘
```

**axnmihn 문제**: Gemini/Anthropic 클라이언트가 각각 고유 retry 로직 → retry.py 미사용 (claude_reports #10)

```typescript
// packages/infra/src/llm/types.ts

interface LlmProvider {
  readonly id: string;
  chat(params: ChatParams): AsyncGenerator<ChatChunk>;
  countTokens(text: string): Promise<number>;  // async — Anthropic SDK API call (ADR-012, ADR-018)
  healthCheck(): Promise<boolean>;
}
// NOTE: embed()는 EmbeddingService (Section 3.4)가 canonical interface.
// LLM provider와 embedding provider는 별개 — 모든 LLM이 embedding을 제공하지 않음.

interface ChatParams {
  messages: Message[];
  model: string;
  maxTokens: number;
  temperature: number;
  tools?: ToolDefinition[];
  systemPrompt?: string;
  thinkingBudget?: number;
}

interface ChatChunk {
  type: "text" | "thinking" | "tool_call" | "tool_result" | "error";
  content: string;
  metadata?: Record<string, unknown>;
}

// Circuit Breaker (axnmihn 패턴 계승, 일반화)
interface CircuitBreakerConfig {
  failureThreshold: number;     // 5
  cooldowns: Record<string, number>; // { rate_limit: 300, server_error: 60, timeout: 30 }
}

// Retry (axnmihn의 미사용 retry.py를 실제 적용)
interface RetryConfig {
  maxRetries: number;           // 3
  baseDelayMs: number;          // 1000
  maxDelayMs: number;           // 30000
  retryableErrors: string[];    // ["rate_limit", "server_error", "timeout"]
}
```

**Model Router 전략:**

```
Input Message → Intent Classifier (Gemini Flash, ~300-500ms via API — 추정치, 실측 벤치마크 필요)
                     │
         ┌───────────┼───────────┐
         ▼           ▼           ▼
    casual_chat   complex_task   utility
         │           │           │
    Claude Sonnet  Claude Opus   Gemini Flash
    (일반 대화)    (코드, 전략)   (분류, 요약)
```

**Fallback Chain:** Opus → Sonnet → Flash → Ollama (로컬)

### Layer 6: Tool System (MCP)

```
┌─────────────────────────────────────────────────┐
│  Layer 6: Tool System                           │
│                                                 │
│  MCP-compatible tool registry                   │
│  Auto-registration (decorator pattern)          │
│  Command allowlist (security)                   │
│  Approval flow for dangerous operations         │
└─────────────────────────────────────────────────┘
```

**axnmihn 문제**: 3중 스키마 정의 (claude_reports #15), 22/32 XML 태그만 등록 (#21)

**Axel 해법: 단일 등록 지점 + 자동 생성**

```typescript
// ToolDefinition은 Section 3.5 core domain types에서 정의 (단일 정의 지점)
// 여기서는 등록 유틸리티만 정의

// packages/infra/src/mcp/registry.ts — 등록 로직은 infra에

function defineTool<T extends z.ZodSchema>(config: {
  name: string;
  description: string;
  category: string;
  schema: T;
  requiresApproval?: boolean;
  handler: (args: z.infer<T>) => Promise<ToolResult>;
}): ToolDefinition;

// 사용 예시
const readFileTool = defineTool({
  name: "read_file",
  description: "Read a file from the filesystem",
  category: "file",
  schema: z.object({
    path: z.string().min(1),
    encoding: z.enum(["utf-8", "base64"]).default("utf-8"),
  }),
  handler: async (args) => {
    // path security 검증은 여기서 수행
    const safePath = validatePath(args.path); // Layer 1 security
    const content = await fs.readFile(safePath, args.encoding);
    return { content };
  },
});
```

**Command Execution (claude_reports #01 해결):**

```typescript
// shell=True 완전 제거. allowlist + execFile만 허용.
const executeCommandTool = defineTool({
  name: "execute_command",
  description: "Execute a system command (allowlist only)",
  category: "system",
  schema: z.object({
    command: z.string(),
    args: z.array(z.string()).default([]),
    cwd: z.string().optional(),
    timeout: z.number().int().max(60000).default(30000),
  }),
  requiresApproval: true, // 항상 사용자 승인 필요
  handler: async ({ command, args, cwd, timeout }) => {
    if (!config.security.commandAllowlist.includes(command)) {
      throw new ToolError("FORBIDDEN", `Command '${command}' is not in the allowlist`);
    }
    // execFile (NOT exec, NOT shell) — no shell injection possible
    const result = await execFileAsync(command, args, { cwd, timeout });
    return { stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode };
  },
});
```

### Layer 7: Orchestration Engine

```
┌─────────────────────────────────────────────────┐
│  Layer 7: Orchestration Engine                  │
│                                                 │
│  ReAct Loop (reasoning-action cycle)            │
│  Intent Classifier (Gemini Flash)               │
│  Priority Queue (P0-P3)                         │
│  Cross-Channel Session Router                   │
└─────────────────────────────────────────────────┘
```

**ReAct Loop (axnmihn 패턴 계승, TypeScript 재구현):**

```typescript
// packages/core/src/orchestrator/react-loop.ts

interface ReActConfig {
  maxIterations: number;        // 15 (axnmihn과 동일)
  toolTimeoutMs: number;        // 30000
  totalTimeoutMs: number;       // 300000
  streamingEnabled: boolean;
}

async function* reactLoop(
  params: {
    messages: Message[];
    tools: ToolDefinition[];
    llmProvider: LlmProvider;
    config: ReActConfig;
  }
): AsyncGenerator<ReActEvent> {
  let iteration = 0;

  while (iteration < params.config.maxIterations) {
    // 1. LLM에게 다음 행동 요청 (스트리밍)
    for await (const chunk of params.llmProvider.chat({
      messages: params.messages,
      tools: params.tools,
      // ...
    })) {
      if (chunk.type === "text") {
        yield { type: "message_delta", content: chunk.content };
      }
      if (chunk.type === "tool_call") {
        yield { type: "tool_call", tool: chunk.content };
        // 2. 도구 실행
        const result = await executeTool(chunk.content, params.tools, params.config.toolTimeoutMs);
        yield { type: "tool_result", result };
        // 3. 결과를 messages에 추가하고 다음 iteration
        params.messages.push(/* tool result */);
      }
    }

    // tool_call이 없으면 종료 (LLM이 최종 응답을 생성함)
    if (noToolCallInLastResponse) break;
    iteration++;
  }
}

// Streaming pipeline 에러 핸들링 (ERR-044 해소):
// 1. LLM 스트림 중 연결 끊김 → RetryableError → 재시도 (마지막 성공 지점부터)
// 2. Tool 실행 타임아웃 → ToolTimeoutError → 부분 결과 반환 + 사용자 알림
// 3. 채널 전송 실패 → 메시지 큐에 보관, 재전송 시도 (최대 3회)
// 4. 전체 ReAct loop 타임아웃 (300s) → 현재까지의 응답 전송 + "시간 초과" 메시지
// 모든 에러는 ADR-020 AxelError 계층으로 분류, interaction_logs에 기록.
```

**Cross-Channel Session Router (핵심 혁신):**

```typescript
// packages/core/src/orchestrator/session-router.ts

interface SessionRouter {
  // 메시지가 들어오면 현재 활성 세션을 찾거나 생성
  resolveSession(userId: string, channelId: string): Promise<UnifiedSession>;

  // 채널 간 맥락 전환
  switchChannel(session: UnifiedSession, newChannelId: string): Promise<void>;

  // 세션 종료 (요약 생성 + episodic memory로 이동)
  endSession(session: UnifiedSession): Promise<SessionSummary>;
}

interface UnifiedSession {
  sessionId: string;
  userId: string;
  activeChannelId: string;
  channelHistory: string[];     // 이 세션에서 사용된 채널 목록
  startedAt: Date;
  lastActivityAt: Date;
}
```

**작동 흐름:**
1. Discord에서 Mark가 메시지 전송
2. Session Router가 Mark의 활성 세션을 Redis에서 조회
3. 없으면 새 세션 생성, 있으면 기존 세션에 연결
4. Working Memory에서 이전 턴을 로드 (채널 무관)
5. Context Assembler가 모든 memory layer에서 맥락을 조립
6. ReAct Loop 실행
7. 응답을 현재 채널(Discord)로 전송
8. 30분 후 Mark가 Telegram에서 "어제 그거 어떻게 됐어?"
9. Session Router가 **같은 세션**을 찾아 연결
10. Working Memory에 Discord 대화 내용이 그대로 있음

### Layer 8: Channel Adapters

```
┌─────────────────────────────────────────────────┐
│  Layer 8: Channel Adapters                      │
│                                                 │
│  AxelChannel interface (OpenClaw 차용)          │
│  MVP: Discord, Telegram, CLI, WebChat           │
│  Message normalizer                             │
│  Outbound formatting (채널별)                    │
└─────────────────────────────────────────────────┘
```

**인터페이스 (v1.0에서 정의한 것 확장):**

```typescript
// packages/channels/src/types.ts

interface AxelChannel {
  readonly id: string;
  readonly capabilities: ChannelCapabilities;

  // Lifecycle (ERR-042: reconnection 포함)
  start(): Promise<void>;
  stop(): Promise<void>;
  healthCheck(): Promise<HealthStatus>;

  // Reconnection lifecycle (ERR-042 해소)
  // 채널 연결이 끊어진 경우 자동 재연결 시도.
  // 구현체는 지수 백오프 (1s → 2s → 4s → ... → 60s max) + circuit breaker 패턴.
  // 재연결 실패 시 healthCheck()가 "unhealthy" 반환 → 오케스트레이터가 대체 채널로 전환.
  onDisconnect?(handler: (reason: string) => void): void;
  onReconnect?(handler: () => void): void;

  // Inbound (채널 → Axel)
  onMessage(handler: InboundHandler): void;
  onTypingStart?(handler: (userId: string) => void): void; // Stream Buffer 트리거

  // Outbound (Axel → 채널)
  send(target: string, msg: OutboundMessage): Promise<void>;
  sendStreaming?(target: string, stream: AsyncIterable<string>): Promise<void>;

  // 채널별 특수 기능 (optional)
  setPresence?(status: PresenceStatus): Promise<void>;
  addReaction?(messageId: string, emoji: string): Promise<void>;
}

interface ChannelCapabilities {
  streaming: boolean;
  richMedia: boolean;       // 이미지, 파일
  reactions: boolean;
  threads: boolean;
  voiceInput: boolean;
  maxMessageLength: number;
  typingIndicator: boolean;
}

interface InboundMessage {
  userId: string;
  channelId: string;
  content: string;
  media?: MediaAttachment[];
  replyTo?: string;
  threadId?: string;
  timestamp: Date;
  rawEvent?: unknown;       // 채널별 원본 이벤트 (디버깅용)
}

interface OutboundMessage {
  content: string;
  media?: MediaAttachment[];
  replyTo?: string;
  format?: "text" | "markdown" | "html"; // 채널별 자동 변환
}

// InboundHandler: 채널에서 메시지 수신 시 호출되는 콜백 (ERR-009 해소)
type InboundHandler = (message: InboundMessage) => Promise<void>;
```

### Layer 9: Gateway (HTTP/WS)

```
┌─────────────────────────────────────────────────┐
│  Layer 9: Gateway                               │
│                                                 │
│  HTTP server (health, API, webhooks)            │
│  WebSocket (real-time streaming)                │
│  Security middleware (auth, rate limit, CORS)    │
│  Error handling (ENV-aware, no info disclosure)  │
└─────────────────────────────────────────────────┘
```

**HTTP 라우트 구조:**

```
GET  /health                    # Health check (no auth)
GET  /health/detailed           # Detailed health (auth required)

POST /api/v1/chat               # Chat completion (auth required)
GET  /api/v1/chat/stream        # SSE streaming endpoint
POST /api/v1/memory/search      # Memory search
GET  /api/v1/memory/stats       # Memory statistics
POST /api/v1/session/end        # End current session

GET  /api/v1/tools              # Available tools list
POST /api/v1/tools/execute      # Manual tool execution

WS   /ws                        # WebSocket for real-time

# Webhook endpoints (channel-specific)
POST /webhooks/telegram         # Telegram Bot API webhook
POST /webhooks/discord          # Discord interactions
```

**Error Handling (claude_reports #17 해결):**

```typescript
// packages/gateway/src/security/error-handler.ts

function handleError(err: unknown, config: AxelConfig): HttpError {
  const classified = classifyError(err);

  if (config.env === "production") {
    // 절대 내부 정보를 노출하지 않음
    return {
      status: classified.status,
      body: {
        error: classified.publicMessage, // "Internal Server Error" 등 generic
        requestId: getRequestId(),
      },
    };
  }

  // development에서만 상세 정보
  return {
    status: classified.status,
    body: {
      error: classified.publicMessage,
      detail: classified.internalMessage, // str(exc) 포함
      stack: classified.stack,
      requestId: getRequestId(),
    },
  };
}
```

### Layer 10: Security Architecture (Ground-Up)

```
┌─────────────────────────────────────────────────┐
│  Layer 10: Security                             │
│                                                 │
│  Auth: JWT + timing-safe comparison             │
│  Input: Zod validation + path sanitization      │
│  Tool: Command allowlist + approval flow        │
│  Network: HTTPS required, CORS strict           │
│  Prompt: External content wrapping              │
└─────────────────────────────────────────────────┘
```

**claude_reports의 모든 보안 이슈 해결 매핑:**

| claude_reports # | axnmihn 문제 | Axel 해결 |
|-----------------|-------------|-----------|
| #01 | `shell=True` + NOPASSWD | `execFile` only + command allowlist + approval flow |
| #04 | `bare except:` | Typed errors + structured error chain |
| #07 | Path traversal (`".." in string`) | `path.resolve()` + `relative_to()` + symlink block |
| #17 | `str(exc)` disclosure | ENV-aware error handler |
| #22 | HASS HTTP plaintext | `security.iotRequireHttps: true` default |

**Credential Redaction in Logs (ERR-032 해소):**

모든 구조화 로그 출력 시 민감 데이터 자동 redaction:
```typescript
// packages/infra/src/logging/redactor.ts
const REDACT_PATTERNS = [
  /(?:api[_-]?key|token|secret|password|authorization)["\s:=]+["']?[A-Za-z0-9_\-\.]{8,}/gi,
  /(?:Bearer|Basic)\s+[A-Za-z0-9_\-\.]+/gi,
  /sk-[a-zA-Z0-9]{20,}/g,        // Anthropic API key
  /AIza[A-Za-z0-9_\-]{35}/g,     // Google API key
];

function redact(input: string): string {
  let result = input;
  for (const pattern of REDACT_PATTERNS) {
    result = result.replace(pattern, "[REDACTED]");
  }
  return result;
}
```
pino logger에 `redact` 옵션으로 필드 레벨 redaction 적용. config 객체의 `apiKey`, `botToken` 등은 자동 마스킹.

**Prompt Injection 방어 (OpenClaw 차용):**

```typescript
// packages/gateway/src/security/content-wrapper.ts

const SUSPICIOUS_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above)/i,
  /forget\s+(everything|all|your)/i,
  /you\s+are\s+now\s+(a|an)\s+/i,
  /system\s*:\s*/i,
  /\[INST\]/i,
];

function wrapExternalContent(content: string, source: string): string {
  const hasSuspicious = SUSPICIOUS_PATTERNS.some(p => p.test(content));

  return `
<<<EXTERNAL_UNTRUSTED_CONTENT source="${source}"${hasSuspicious ? ' WARNING="potentially_malicious"' : ''}>
${content}
<<<END_EXTERNAL_UNTRUSTED_CONTENT>>>`;
}
```

---

## 5. 데이터 마이그레이션: 영혼 이전

### 5.1 마이그레이션 전략

```
axnmihn (source)                    Axel (target)
────────────────                    ──────────────
ChromaDB (1000+ vectors, 768d)  →   pgvector (re-embed or direct copy)
SQLite (1600+ conversations)    →   PostgreSQL (sessions + messages)
JSON (956KB knowledge graph)    →   PostgreSQL (entities + relations)
JSON (working memory, 248 turns)→   Redis + PostgreSQL
JSON (dynamic_persona.json)     →   파일 그대로 복사
Files (40+ research artifacts)  →   R2/S3 + PostgreSQL metadata
```

### 5.2 벡터 마이그레이션 (가장 복잡)

**결정: Re-embed (gemini-embedding-001, 768d)**

axnmihn의 text-embedding-004 벡터는 gemini-embedding-001과 embedding space가 다르므로 Direct Copy 불가 (ADR-016, PLAN-001).

- 모든 1,000+ memory content를 gemini-embedding-001로 re-embed
- 100 per batch × 10 API calls = ~30초 소요, 비용 < $0.01
- 768d 차원 유지 → pgvector 컬럼 타입 변경 불필요
- 향후 3,072d 업그레이드 가능 (Matryoshka 특성)

### 5.3 마이그레이션 스크립트 (tools/migrate/)

```
tools/migrate/
├── src/
│   ├── index.ts                # CLI entry point
│   ├── chromadb-extractor.ts   # ChromaDB → JSON 추출 (Python subprocess)
│   ├── sqlite-extractor.ts     # SQLite → JSON 추출
│   ├── graph-extractor.ts      # knowledge_graph.json 파싱
│   ├── pg-loader.ts            # PostgreSQL bulk INSERT
│   ├── redis-loader.ts         # Redis working memory 로드
│   └── validator.ts            # 마이그레이션 후 데이터 무결성 검증
├── tests/
│   └── migration.test.ts       # 마이그레이션 로직 테스트
└── package.json
```

### 5.4 검증 기준

```
[ ] 모든 1000+ 벡터가 pgvector에 로드됨 (COUNT 일치)
[ ] 1600+ 대화 쌍이 sessions+messages에 로드됨
[ ] 1396 엔티티, 1945 관계가 entities+relations에 로드됨
[ ] "Mark" 쿼리 시 벡터 검색 결과가 ChromaDB와 top-5 일치
[ ] BFS("Mark", depth=2) 결과가 JSON graph와 일치
[ ] dynamic_persona.json이 Zod 스키마 검증 통과
[ ] 마이그레이션 총 소요 시간 < 5분
```

---

## 6. 테스트 전략: 26% → 80%+

**axnmihn 문제**: 244 tests, 26% 모듈 커버리지, core pipeline 0% (claude_reports #19)
**근본 원인**: God Object가 테스트 불가, 전역 상태가 테스트 격리 파괴

### 6.1 테스트 피라미드

```
                    ╱╲
                   ╱  ╲         E2E Tests (5%)
                  ╱ E2E╲        Docker Compose 전체 스택
                 ╱──────╲       실제 PostgreSQL + Redis
                ╱        ╲
               ╱Integration╲    Integration Tests (25%)
              ╱────────────╲    실제 DB, mock LLM
             ╱              ╲
            ╱   Unit Tests   ╲  Unit Tests (70%)
           ╱──────────────────╲ 순수 함수, mock 주입
          ╱                    ╲
```

### 6.2 패키지별 테스트 전략

| 패키지 | 테스트 유형 | Mock 대상 | 커버리지 목표 |
|--------|-----------|-----------|-------------|
| `core` | Unit (순수 함수) | 없음 (I/O 없음) | **90%+** |
| `infra` | Integration | PostgreSQL (testcontainers), Redis (testcontainers) | **80%+** |
| `channels` | Unit + Integration | LLM, 외부 API | **75%+** |
| `gateway` | Integration | DB, LLM | **80%+** |
| `app` | E2E | 없음 (전체 스택) | **60%+** |

### 6.3 테스트 인프라

```typescript
// vitest.config.ts (root)
export default defineConfig({
  test: {
    pool: "forks",              // 프로세스 격리 (OpenClaw 패턴)
    testTimeout: 30_000,
    hookTimeout: 30_000,
    setupFiles: ["./test/setup.ts"],
    coverage: {
      provider: "v8",
      thresholds: {
        branches: 70,
        functions: 80,
        lines: 80,
        statements: 80,
      },
    },
  },
});

// test/setup.ts
// 전역 테스트 설정, 환경변수 로딩, 타임존 고정
```

### 6.4 핵심 테스트 케이스 (must-have)

```
Memory Engine:
  [ ] Adaptive decay가 type multiplier를 올바르게 적용하는가
  [ ] Channel diversity boost가 cross-channel 기억을 안정화하는가
  [ ] Recency paradox가 오래된 기억을 부활시키는가
  [ ] Context assembly가 토큰 예산을 초과하지 않는가
  [ ] 벡터 검색이 cosine similarity 상위 N개를 반환하는가
  [ ] Graph BFS가 depth 제한을 준수하는가

Session Router:
  [ ] 같은 userId의 다른 채널 메시지가 같은 세션에 매핑되는가
  [ ] 비활동 후 새 세션이 생성되는가
  [ ] 채널 전환 시 working memory가 보존되는가

Security (ERR-033 보완):
  [ ] Command allowlist에 없는 명령이 거부되는가
  [ ] Command args에 shell metacharacters가 포함된 경우 거부하는가
  [ ] Path traversal (`../`) 시도가 차단되는가
  [ ] Symlink를 통한 path escape가 차단되는가
  [ ] Production 환경에서 에러 상세가 숨겨지는가 (requestId만 노출)
  [ ] HASS HTTP 연결이 차단되는가 (HTTPS 필수)
  [ ] Prompt injection 패턴이 감지+래핑되는가
  [ ] JWT 토큰 만료 시 적절히 거부되는가
  [ ] Rate limiter가 초과 요청을 429로 응답하는가
  [ ] 로그에 API key, token이 redaction되어 출력되는가
  [ ] WebSocket 첫 메시지 auth 실패 시 5초 내 연결 종료되는가

Channel Adapters:
  [ ] Discord 메시지가 InboundMessage로 정규화되는가
  [ ] Telegram 메시지가 InboundMessage로 정규화되는가
  [ ] 스트리밍 응답이 채널별 maxMessageLength를 준수하는가
```

---

## 7. 개발 로드맵 (상세)

### Phase 0: Foundation (2-3주)

**목표**: "Hello World" — CLI에서 Axel과 대화 가능

```
Week 1: Scaffolding
  [ ] Monorepo 초기화 (pnpm workspace, tsconfig, biome)
  [ ] Docker Compose (PostgreSQL + Redis)
  [ ] packages/core 스켈레톤 + 첫 unit test
  [ ] packages/infra/db — PostgreSQL 스키마 마이그레이션 (SQL 파일)
  [ ] packages/infra/cache — Redis client wrapper

Week 2: Memory + LLM
  [ ] packages/core/memory — Working Memory (Redis 기반)
  [ ] packages/core/memory — Episodic Memory (PostgreSQL 기반)
  [ ] packages/core/memory — Semantic Memory (pgvector 기반)
  [ ] packages/infra/llm — Anthropic adapter (streaming)
  [ ] packages/infra/embedding — Gemini embedding adapter
  [ ] packages/core/context — Context Assembler (토큰 기반 예산)

Week 3: Persona + CLI
  [ ] packages/core/persona — PersonaEngine (persona loader + hot-reload)
  [ ] packages/core/orchestrator — ReAct Loop (기본)
  [ ] packages/channels/cli — CLI 채널 (stdin/stdout + streaming)
  [ ] apps/axel — Bootstrap, DI container, lifecycle
  [ ] tools/migrate — axnmihn 데이터 마이그레이션 스크립트
  [ ] 마이그레이션 실행 (영혼 이전)

Milestone: CLI에서 "야 Axel" 하면 Cynical Tech Bro가 응답
```

### Phase 1: Channels + Cross-Channel (3-4주)

**목표**: Discord + Telegram에서 대화하고, 맥락이 이어짐

```
Week 4-5: Channel Adapters
  [ ] packages/channels/discord — Discord.js adapter
  [ ] packages/channels/telegram — Grammy adapter
  [ ] packages/core/orchestrator — Session Router (cross-channel)
  [ ] packages/core/memory — Unified Memory Bus

Week 6-7: Gateway + Security
  [ ] packages/gateway — HTTP server + routes
  [ ] packages/gateway/auth — JWT + timing-safe
  [ ] packages/gateway/security — Rate limiting, CORS, error handler
  [ ] packages/core/orchestrator — Intent Classifier (Gemini Flash)
  [ ] apps/webchat — WebChat SPA 초안 (SvelteKit — ADR-017)

Milestone: Discord에서 한 대화를 Telegram에서 이어감
```

### Phase 2: Intelligence (3-4주)

**목표**: Adaptive Decay v2, GraphRAG, Speculative Prefetch

```
Week 8-9: Memory Engine v2
  [ ] packages/core/decay — Adaptive Decay v2 (channel diversity boost)
  [ ] packages/core/memory — Conceptual Memory (graph in PostgreSQL)
  [ ] packages/core/memory — Meta Memory (access patterns + materialized view)
  [ ] Speculative Prefetch (typing indicator → pre-load memory)

Week 10-11: Agent Intelligence
  [ ] packages/core/orchestrator — Priority Queue (P0-P3)
  [ ] Model Router (task → model selection)
  [ ] Silent Intern (Opus delegation)
  [ ] Autonomous Research (cron job)
  [ ] MCP Tool System (Zod-based registration)

Milestone: "어제 그거" 하면 알아듣고, 자고 있는 동안 연구 완료
```

### Phase 3: Autonomy (4-6주)

**목표**: IoT 제어, 자율 행동, Plugin SDK

```
Week 12-13: IoT + Proactive
  [ ] IoT Bridge (Home Assistant API, HTTPS 강제)
  [ ] Proactive Actions Engine (트리거 기반)
  [ ] Approval Flow (위험 작업 사용자 승인)

Week 14-17: Polish + Scale
  [ ] Plugin SDK v1
  [ ] Code Sandbox (Docker 격리)
  [ ] Browser Automation (Playwright)
  [ ] Email channel (비동기 리포트)
  [ ] 성능 최적화 (벤치마크 기반)
  [ ] E2E 테스트 스위트

Milestone: "집중 모드" → 조명+알림+연구 자동 조정
```

### Phase 4: Sovereignty (장기 비전)

```
[ ] Agent-to-Agent Protocol
[ ] Multi-user Support (팀 배포)
[ ] Self-hosting Package
[ ] Revenue Model (NorthProt 수익화)
```

---

## 8. 비용 추정 (업데이트)

| 항목 | Self-hosted | Managed | 비고 |
|------|-----------|---------|------|
| VPS (4 vCPU, 8GB) | $20-40 | — | Hetzner CAX21 또는 DigitalOcean |
| PostgreSQL | $0 (VPS 내) | $15 | self-hosted 권장 (초기) |
| Redis | $0 (VPS 내) | $10 | self-hosted 권장 (초기) |
| Claude API | $20-60 | — | Sonnet 위주, Opus는 복잡한 작업만 |
| Gemini API | $5-10 | — | Flash (분류/요약) + embedding |
| Cloudflare R2 | $0-5 | — | 10GB free tier |
| 도메인 | $1 | — | northprot.com |
| **합계** | **$46-116/월** | **$71-141/월** | |

---

## 9. 성공 기준 (v1.0에서 계승, 기술 기준 추가)

### 기능적 성공 기준 (JARVIS 테스트)

```
[  ] Discord에서 시작한 대화를 Telegram에서 맥락 없이 이어갈 수 있다
[  ] "어제 그거"라고만 해도 무슨 얘긴지 안다
[  ] 자고 있는 동안 연구를 마치고 아침에 요약을 보내준다
[  ] "집중 모드"라고 하면 조명, 알림, 연구 스케줄이 자동 조정된다
[  ] 코드 리뷰를 요청하면 PR 링크만으로 전체 맥락을 파악한다
[  ] Mark가 번아웃 징후를 보이면 선제적으로 경고한다 (CS 용어로)
[  ] 한 달 전 대화에서 언급한 선호를 기억하고 적용한다
[  ] 응답 첫 토큰 TTFT: p50 < 500ms, p95 < 1,500ms (LLM API 의존, 네트워크 변동 반영)
```

### 기술적 성공 기준 (v2.0 추가)

```
[  ] Test coverage > 80% (packages/core > 90%)
[  ] God Objects (>400줄 파일): 0개
[  ] Lint warnings: 0개 (biome strict)
[  ] TypeScript strict mode: 전 패키지
[  ] Security critical issues: 0건
[  ] DB migration: 롤백 가능 (up/down)
[  ] Docker cold start: < 30초 (cached images 기준, 최초 배포 시 < 120초)
[  ] Memory query latency p99: < 200ms
[  ] axnmihn 기억 100% 이전 (검증 완료)
```

---

## 10. 기술 결정 기록 (ADR 목록)

각 결정은 `docs/adr/` 디렉토리에 개별 문서로 작성될 예정:

| ADR | 결정 | 상태 |
|-----|------|------|
| ADR-001 | TypeScript 단일 스택 (Python 폐기) | **확정** — `docs/adr/001-typescript-single-stack.md` |
| ADR-002 | PostgreSQL + pgvector (ChromaDB/SQLite 폐기) | **확정** — `docs/adr/002-postgresql-single-db.md` |
| ADR-003 | Redis for working memory + pub/sub (ephemeral cache) | **확정** — `docs/adr/003-redis-working-memory.md` |
| ADR-004 | pnpm monorepo (core/infra/channels/gateway 분리) | **확정** — `docs/adr/004-pnpm-monorepo.md` |
| ADR-005 | Zod for all validation (config, tool schema, API) | **확정** — `docs/adr/005-zod-validation.md` |
| ADR-006 | Constructor injection (DI 프레임워크 미사용) | **확정** — `docs/adr/006-constructor-injection.md` |
| ADR-007 | Biome (ESLint+Prettier 대체) | **확정** — `docs/adr/007-biome-linter.md` |
| ADR-008 | vitest + testcontainers (통합 테스트) | **확정** — `docs/adr/008-vitest-testcontainers.md` |
| ADR-009 | Channel adapter interface (OpenClaw 패턴 차용) | **확정** — `docs/adr/009-channel-adapter-interface.md` |
| ADR-010 | Command allowlist + execFile (shell=True 금지) | **확정** — `docs/adr/010-command-allowlist.md` |
| ADR-011 | ENV-aware error handling (info disclosure 방지) | **확정** — `docs/adr/011-env-aware-error-handling.md` |
| ADR-012 | Token-based context budgeting (Anthropic SDK countTokens) | **확정** — `docs/adr/012-token-based-context-budgeting.md` |
| ADR-013 | 6-Layer Memory (Stream Buffer + Meta Memory 추가) | **제안** — `docs/adr/013-six-layer-memory-architecture.md` |
| ADR-014 | Cross-Channel Session Router (핵심 혁신) | **제안** — `docs/adr/014-cross-channel-session-router.md` |
| ADR-015 | Adaptive Decay v2 (channel diversity boost) | **제안** — `docs/adr/015-adaptive-decay-v2.md` |
| ADR-016 | Embedding Model: gemini-embedding-001 (768d) | **제안** — `docs/adr/016-embedding-model-selection.md` |
| ADR-017 | WebChat SPA: Svelte 5 (PLAN-001 React 번복) | **제안** — `docs/adr/017-webchat-spa-framework.md` |
| ADR-018 | Token Counting: Anthropic SDK countTokens | **제안** — `docs/adr/018-token-counting-strategy.md` |
| ADR-019 | Authentication: Static Bearer → JWT | **제안** — `docs/adr/019-auth-strategy.md` |
| ADR-020 | Error Taxonomy: AxelError 계층 | **제안** — `docs/adr/020-error-taxonomy.md` |
| ADR-021 | Resilience Patterns: Lifecycle, Shutdown, Consolidation | **제안** — `docs/adr/021-resilience-patterns.md` |

---

## 11. 다음 단계

이 v2.0 문서는 **중간 초안**이다. 아래는 미결 사항의 해결 현황이다.

### 미결 사항 (모두 해결됨)

1. ~~**임베딩 모델 최종 선택**~~: → **gemini-embedding-001 (768d)** — ADR-016
   - gemini-embedding-001 선택 (ADR-016). MTEB #1. Re-embed 필수.

2. ~~**WebChat 프레임워크**~~: → **Svelte 5 (SvelteKit)** — ADR-017 (PLAN-001 React 결정 번복)
   - SvelteKit + svelte-chatui. 번들 크기 최소, Vite 네이티브, 1인 프로젝트에 최적.

3. ~~**CI/CD 파이프라인 상세**~~: → **GitHub Actions 3-stage** — PLAN-001
   - lint/typecheck/test 병렬 → build → deploy (SSH + docker-compose).

4. ~~**배포 전략**~~: → **Docker Compose on VPS** — PLAN-001
   - Hetzner CAX21. Single-user이므로 orchestration 불필요.

5. ~~**모니터링**~~: → **Phase 0-1: pino + interaction_logs → Phase 2: OpenTelemetry + Grafana Cloud** — PLAN-001
   - Phase 0에서 OTel instrumentation 설정, export는 Phase 2 활성화.

### v3.0 산출물 현황

| 항목 | 상태 | 산출물 |
|------|------|--------|
| ADR 상세 문서 | **완료** | ADR-001~016 (docs/adr/) |
| API 스펙 (OpenAPI 3.0) | **완료** | `docs/plan/openapi-v1.yaml`, `websocket-protocol.md` |
| PostgreSQL 마이그레이션 전략 | **완료** | `docs/plan/migration-strategy.md` |
| 성능 벤치마크 계획 | **대기** | RES-001 (pgvector IVFFlat vs HNSW) 결과 필요 |
| 에이전트 분산 작업 계획 | **대기** | Coordinator 할당 필요 |

### 아직 필요한 것

- **Research Division 결과**: RES-001~005 (pgvector 벤치마크, 토크나이저, 프레임워크 비교 등)
- **Quality Division 검토**: QA-001 (plan 내부 일관성), QA-002 (claude_reports 매핑 완전성)
- **v3.0 통합 문서**: 모든 하위 문서를 하나의 coherent plan으로 통합

---

## 부록 A: axnmihn → Axel 모듈 매핑

| axnmihn 모듈 | 줄 수 | 상태 | Axel 대응 |
|-------------|------|------|-----------|
| `chat_handler.py` | 200 | 리팩토링됨 | `core/orchestrator/react-loop.ts` |
| `mcp_server.py` | 987 | God Object | `infra/mcp/registry.ts` (auto-register) |
| `unified.py` | 200 | OK | `core/memory/engine.ts` (DI 기반) |
| `current.py` | ~150 | OK | `core/memory/working.ts` (Redis) |
| `recent/*.py` | ~784 | `__del__` 문제 | `infra/db/session-repository.ts` |
| `permanent/*.py` | ~600 | God Class | `infra/db/memory-repository.ts` + `core/decay/` |
| `graph_rag.py` | ~400 | JSON I/O 병목 | `infra/db/graph-repository.ts` (PostgreSQL) |
| `ai_brain.py` | 272 | OK | `core/persona/engine.ts` |
| `context_optimizer.py` | ~200 | char 기반 | `core/context/assembler.ts` (token 기반) |
| `circuit_breaker.py` | ~100 | OK | `infra/llm/circuit-breaker.ts` |
| `retry.py` | 156 | **미사용** | `infra/llm/retry.ts` (실제 적용) |
| `mcp_tools/*.py` | ~800 | 3중 스키마 | `infra/mcp/tools/*.ts` (Zod 단일 정의) |
| `config.py` | 328 | 3곳 분산 | `apps/axel/config.ts` (Zod 단일) |
| `path_security.py` | ~50 | 취약 | `gateway/security/path.ts` (강화) |

**폐기 대상 (dead code):**
- `schemas.py` (350줄) — Pydantic 모델 미사용
- `_build_smart_context_async()` (128줄) — 미호출
- `migrate_legacy_data()` — 미호출
- SSE 핸들러 중복 (61줄)
- opus_executor.py 중복 부분 (~367줄)
- **합계: ~780줄 삭제**

---

*NorthProt — Project Axel Technical Architecture Plan v2.0*
*Generated: 2026-02-07*
*Based on: axnmihn analysis (127 modules), claude_reports (23 reports), OpenClaw analysis (174K stars)*
*Authors: Mark (Architect) & Claude (Systems Analyst)*
*Status: 중간 초안 — 코드 구현 전 최종 검토 필요*
