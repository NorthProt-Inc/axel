# PLAN_SYNC: Plan-Code Synchronization

> Maintained by Architect Division. Updated at every milestone.
> DRIFT status unresolved for 5+ cycles → automatic escalation (CONSTITUTION Rule 11).

## Sync Status Legend

- `NOT_STARTED` — Code location does not exist yet
- `IN_SYNC` — Plan and code are aligned
- `DRIFT` — Plan and code have diverged; resolution needed
- `AMENDED` — Plan was updated to match implementation discovery

## Phase A: Foundation

### A.1 Root Scaffolding (SCAFFOLD-001~003, 006)

| Plan Section | Layer | Code Location | Status | Last Synced | Notes |
|---|---|---|---|---|---|
| 3.3 Monorepo | TL0 | `pnpm-workspace.yaml` | IN_SYNC | C32 | ADR-004. Workspace packages: `packages/*`, `apps/*`, `tools/*` (plan:202-276) |
| 3.3 Monorepo | TL0 | `package.json` (root) | IN_SYNC | C32 | ADR-004. Workspace scripts: `typecheck`, `test`, `lint`, `build` |
| 3.3/TL0 tsconfig | TL0 | `tsconfig.base.json` | IN_SYNC | C32 | ADR-001. strict:true, noUncheckedIndexedAccess, exactOptionalPropertyTypes, target ES2023, module NodeNext (plan:546-557) |
| TL0 Biome | TL0 | `biome.json` | IN_SYNC | C32 | ADR-007. Replaces ESLint+Prettier. Lint + format config (plan:541) |
| 6.3 Test Infra | TL0 | `vitest.config.ts` (root) | IN_SYNC | C32 | ADR-008. pool:"forks" for process isolation (plan:1790-1815) |
| TL0 Docker | TL0 | `docker/docker-compose.dev.yml` | IN_SYNC | C32 | ADR-002, ADR-003. PostgreSQL 17 + pgvector + Redis 7 (plan:268-271) |

### A.2 Per-Package Config (SCAFFOLD-004~005)

| Plan Section | Layer | Code Location | Status | Last Synced | Notes |
|---|---|---|---|---|---|
| 3.3 Monorepo | TL0 | `packages/core/package.json` | IN_SYNC | C32 | No external I/O deps. Exports `types/`. (plan:210-219) |
| 3.3 Monorepo | TL0 | `packages/core/tsconfig.json` | IN_SYNC | C32 | extends tsconfig.base.json |
| 3.3 Monorepo | TL0 | `packages/infra/package.json` | IN_SYNC | C32 | May import `@axel/core/types` only (CONSTITUTION §9) |
| 3.3 Monorepo | TL0 | `packages/infra/tsconfig.json` | IN_SYNC | C32 | extends tsconfig.base.json |
| 3.3 Monorepo | TL0 | `packages/channels/package.json` | IN_SYNC | C32 | May import `@axel/core/types` only (CONSTITUTION §9) |
| 3.3 Monorepo | TL0 | `packages/channels/tsconfig.json` | IN_SYNC | C32 | extends tsconfig.base.json |
| 3.3 Monorepo | TL0 | `packages/gateway/package.json` | IN_SYNC | C32 | May import `@axel/core/types` only (CONSTITUTION §9) |
| 3.3 Monorepo | TL0 | `packages/gateway/tsconfig.json` | IN_SYNC | C32 | extends tsconfig.base.json |
| 3.3 Monorepo | TL0 | `apps/axel/package.json` | IN_SYNC | C32 | May import any `@axel/*` (CONSTITUTION §9) |
| 3.3 Monorepo | TL0 | `apps/axel/tsconfig.json` | IN_SYNC | C32 | extends tsconfig.base.json |
| 6.3 Test Infra | TL0 | `packages/core/vitest.config.ts` | IN_SYNC | C32 | ADR-008. Per-package test config |
| 6.3 Test Infra | TL0 | `packages/infra/vitest.config.ts` | IN_SYNC | C32 | ADR-008. Per-package test config |
| 6.3 Test Infra | TL0 | `packages/channels/vitest.config.ts` | IN_SYNC | C32 | ADR-008. Per-package test config |
| 6.3 Test Infra | TL0 | `packages/gateway/vitest.config.ts` | IN_SYNC | C32 | ADR-008. Per-package test config |

### A.3 CI Pipeline (SCAFFOLD-007)

| Plan Section | Layer | Code Location | Status | Last Synced | Notes |
|---|---|---|---|---|---|
| 7/Phase 0 CI | TL0 | `.github/workflows/ci.yml` | IN_SYNC | C33 | RES-005, SCAFFOLD-007. Node.js 22 + pnpm 9, store cache. Pipeline: lint → typecheck → test (plan:1860, CONSTITUTION §13). |

### A.4 Plan-Spec Cross-References for DevOps

Phase A scaffolding에서 DevOps Division이 참조해야 할 plan spec 상세:

| Spec | Plan Location | Key Values |
|---|---|---|
| Workspace packages | plan:202-276 | `packages/{core,infra,channels,gateway}`, `apps/{axel,webchat}`, `tools/{migrate,seed,bench}` |
| tsconfig strict options | plan:546-557 | strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes, ES2023, NodeNext |
| Biome config | plan:541, ADR-007 | Single tool replacing ESLint+Prettier |
| vitest pool | plan:1790-1815, ADR-008 | `pool: "forks"` for process isolation |
| Docker dev services | plan:268-271, ADR-002, ADR-003 | PostgreSQL 17 + pgvector extension, Redis 7 |
| Package boundary | CONSTITUTION §9 | core: no imports; infra/channels/gateway: `@axel/core/types` only; apps: any |
| CI smoke tests | CONSTITUTION §13 | `pnpm install --frozen-lockfile && pnpm typecheck && pnpm test --run` |
| Coverage targets | CONSTITUTION §8 | core 90%, infra 80%, channels 75%, gateway 80% |

## Phase B: Core Sprint

### B.1 Core Domain Types (CORE-001)

Source: plan §3.5 (lines 347-511)

| Plan Section | Code Location | Interfaces | Status | Last Synced | Notes |
|---|---|---|---|---|---|
| §3.5 memory.ts | `packages/core/src/types/memory.ts` | `MemoryType`, `Memory`, `MemorySearchResult` | IN_SYNC | C35 | `Memory.embedding`: `Float32Array` (3072d, ADR-016). `channelMentions`: `Readonly<Record<string, number>>`. 55 tests pass. |
| §3.5 message.ts | `packages/core/src/types/message.ts` | `MessageRole`, `Message` | IN_SYNC | C35 | `emotionalContext`: string. `metadata`: `Record<string, unknown>`. |
| §3.5 session.ts | `packages/core/src/types/session.ts` | `SessionState`, `SessionSummary` | IN_SYNC | C35 | 7-state FSM verified: initializing→active→thinking→tool_executing→summarizing→ending→ended. |
| §3.5 react.ts | `packages/core/src/types/react.ts` | `ReActEvent`, `ToolCallRequest` | IN_SYNC | C35 | Discriminated union (6 variants). AsyncGenerator streaming type. |
| §3.5 tool.ts | `packages/core/src/types/tool.ts` | `ToolResult`, `ToolDefinition` | IN_SYNC | C35 | `inputSchema`: `unknown` (Zod deferred to infra per CONSTITUTION §9). `handler` not in ToolDefinition — registered separately. `ToolCategory` added. |
| §3.5 health.ts | `packages/core/src/types/health.ts` | `HealthState`, `HealthStatus`, `ComponentHealth` | IN_SYNC | C35 | 3-state: healthy/degraded/unhealthy. |
| §3.5 engine.ts | `packages/core/src/types/engine.ts` | `MemoryEngine`, `MemoryStats` | IN_SYNC | C35 | DI contract. `search()` returns `readonly MemorySearchResult[]`. |
| §3.5 common.ts | `packages/core/src/types/common.ts` | `TokenUsage` | IN_SYNC | C35 | Anthropic SDK token accounting (input, output, cache read, cache creation). |
| §3.5 errors.ts | `packages/core/src/types/errors.ts` | `AxelError`, `AxelErrorInfo` | IN_SYNC | C35 | **Added by dev-core**: error classes for ReAct event serialization. Fully tested. |
| §3.5 index.ts | `packages/core/src/types/index.ts` | (barrel export) | IN_SYNC | C35 | Re-exports all type modules incl. errors.ts. Single import: `@axel/core/types`. |

### B.2 Adaptive Decay (CORE-002)

Source: plan §3.5 Layer 3 / §3.2 (lines 1010-1085), ADR-015

| Plan Section | Code Location | Interfaces | Status | Last Synced | Notes |
|---|---|---|---|---|---|
| §3.2 DecayInput | `packages/core/src/decay/types.ts` | `DecayInput` | IN_SYNC | C35 | Zod schema `DecayInputSchema` + inferred type. 8 fields verified. `channelMentions`: `z.number().int().min(0)`. 34 tests, 100% stmt coverage. |
| §3.2 DecayConfig | `packages/core/src/decay/types.ts` | `DecayConfig` | IN_SYNC | C35 | Zod schema `DecayConfigSchema`. 10 fields + `typeMultipliers` map. `DEFAULT_DECAY_CONFIG` matches ADR-015:37-47 defaults. |
| §3.2 calculator | `packages/core/src/decay/calculator.ts` | `calculateDecayedImportance()` | IN_SYNC | C35 | Pure function, no I/O. 8-step formula verified against plan:1054-1084. EC-1 fix (recency cap at original importance). |
| §3.2 batch | `packages/core/src/decay/batch.ts` | `decayBatch()` | IN_SYNC | C35 | Batch processing for periodic decay sweep. |
| §3.2 index | `packages/core/src/decay/index.ts` | (barrel export) | IN_SYNC | C35 | **Added by dev-core**: barrel export for decay module. |

### B.3 Memory Layers (CORE-003)

Source: plan Layer 3 §3.1 (lines 933-1008), ADR-013

| Plan Section | Code Location | Interfaces | Status | Last Synced | Notes |
|---|---|---|---|---|---|
| §3.1 M0 Stream | `packages/core/src/memory/stream-buffer.ts` | `StreamBuffer`, `StreamEvent`, `StreamEventType` | IN_SYNC | C37 | ADR-013. `InMemoryStreamBuffer` stub. push/consume/trim/healthCheck. 4 event types. 241 tests (memory module total). |
| §3.1 M1 Working | `packages/core/src/memory/working-memory.ts` | `WorkingMemory`, `Turn` | IN_SYNC | C37 | ADR-013, ADR-003. `InMemoryWorkingMemory` stub. MAX_TURNS=20 (plan:960). pushTurn/getTurns/getSummary/compress/flush/clear/healthCheck. |
| §3.1 M2 Episodic | `packages/core/src/memory/episodic-memory.ts` | `EpisodicMemory`, `CreateSessionParams`, `MessageRecord` | IN_SYNC | C37 | ADR-013. `InMemoryEpisodicMemory` stub. createSession/endSession/addMessage/getRecentSessions/searchByTopic/searchByContent/healthCheck. |
| §3.1 M3 Semantic | `packages/core/src/memory/semantic-memory.ts` | `SemanticMemory`, `NewMemory`, `SemanticQuery`, `ScoredMemory`, `DecayResult`, `DecayRunConfig` | IN_SYNC | C37 | ADR-013, ADR-016. `InMemorySemanticMemory` stub. Hybrid scoring 0.7v+0.3t (plan:167). `decay(DecayRunConfig)` — simplified from plan's `DecayConfig`; full decay calc in core/decay/calculator.ts. |
| §3.1 M4 Conceptual | `packages/core/src/memory/conceptual-memory.ts` | `ConceptualMemory`, `NewEntity`, `Entity`, `NewRelation`, `Relation`, `GraphNode` | IN_SYNC | C37 | ADR-013. `InMemoryConceptualMemory` stub. BFS traversal (in-memory). addEntity/addRelation/traverse/findEntity/getRelated/incrementMentions/healthCheck. |
| §3.1 M5 Meta | `packages/core/src/memory/meta-memory.ts` | `MetaMemory`, `AccessPattern`, `HotMemory` | IN_SYNC | C37 | ADR-013. `InMemoryMetaMemory` stub. recordAccess/getHotMemories/getPrefetchCandidates/refreshView/pruneOldPatterns/healthCheck. MV refresh is no-op in stub. |
| §3.1 Types | `packages/core/src/memory/types.ts` | `MemoryLayerName` + all 22 type exports | IN_SYNC | C37 | Central type definitions. `MemoryLayerName` union: 6 literal values. All interfaces define `readonly layerName` + `healthCheck()`. |
| §3.1 Index | `packages/core/src/memory/index.ts` | (barrel export) | IN_SYNC | C37 | Re-exports 22 types + 6 InMemory* classes. Single import: `@axel/core/memory`. |

**Cross-Layer Interface Contract** — Dev-Core implemented concrete per-layer interfaces instead of generic `MemoryLayer<T>`:
- All 6 layers implement `readonly layerName: 'M0:stream' | ... | 'M5:meta'` (literal type)
- All 6 layers implement `healthCheck(): Promise<ComponentHealth>`
- Per-layer methods match plan §3.1 / ADR-013 TypeScript interfaces exactly
- No generic `store()/retrieve()` — each layer has domain-specific method names (e.g., M0: push/consume/trim, M3: store/search/decay)
- This is a reasonable design choice: concrete interfaces over generic abstract. No plan amendment needed.

### B.4 Context Assembly (CORE-004)

Source: plan §3.3 (lines 1092-1153), ADR-012

| Plan Section | Code Location | Interfaces | Status | Last Synced | Notes |
|---|---|---|---|---|---|
| §3.3 ContextBudget | `packages/core/src/context/types.ts` | `ContextBudget` (Zod), `DEFAULT_CONTEXT_BUDGET` | IN_SYNC | C41 | 8 budget slots, total 76K tokens (plan:1101-1111). Zod schema `ContextBudgetSchema` validates positive integers. DEFAULT values match plan exactly: system 8K, stream 2K, working 40K, semantic 12K, graph 4K, session 4K, meta 2K, tools 4K. 289 tests pass. |
| §3.3 AssembledContext | `packages/core/src/context/types.ts` | `AssembledContext`, `ContextSection` | IN_SYNC | C41 | `sections[]` with per-section token count + source layer annotation (plan:1114-1126). All fields `readonly`. `budgetUtilization: Readonly<Record<string, number>>`. |
| §3.3 ContextDataProvider | `packages/core/src/context/types.ts` | `ContextDataProvider`, `TokenCounter` | IN_SYNC | C41 | DI contract (ADR-006). 7 data methods match plan:1130-1138. `getMetaMemory` returns `HotMemory[]` (aligned with M5 type). **Added**: `TokenCounter` interface (count: async accurate, estimate: sync ~len/4) per ADR-018. |
| §3.3 assembler | `packages/core/src/context/assembler.ts` | `ContextAssembler`, `AssembleParams` | IN_SYNC | C41 | Constructor injection of `ContextDataProvider` + `TokenCounter`. Priority-ordered 8-stage assembly matches plan:1143-1153 exactly. Binary-search truncation (front-preserve, back-cut per plan:1153). **Added**: `AssembleParams` (userId, query, optional entityId). 7 pure formatters. 242 lines. |
| §3.3 index | `packages/core/src/context/index.ts` | (barrel export) | IN_SYNC | C41 | **Added by dev-core**: barrel export for context module. Single import: `@axel/core/context`. |

### B.5 Persona Engine (CORE-005)

Source: plan Layer 4 (lines 1155-1227), ADR-006

| Plan Section | Code Location | Interfaces | Status | Last Synced | Notes |
|---|---|---|---|---|---|
| L4 PersonaSchema | `packages/core/src/persona/schema.ts` | `PersonaSchema` (Zod), `Persona` (inferred type) | IN_SYNC | C35 | Zod schema verified: `learned_behaviors[]` with confidence, `user_preferences`, `voice_style`, `constraints`, `version`. 32 tests, 100% stmt coverage. |
| L4 PersonaEngine | `packages/core/src/persona/engine.ts` | `PersonaEngine` (interface), `buildSystemPrompt()` (pure fn) | IN_SYNC | C35 | Interface: 5 methods (load, reload, getSystemPrompt, evolve, updatePreference). `buildSystemPrompt` pure function in core; hot-reload (fs.watch) deferred to infra impl. |
| L4 ChannelAdaptations | `packages/core/src/persona/channel-adaptations.ts` | `ChannelAdaptation` | IN_SYNC | C35 | Per-channel formality/verbosity. 6 channels: discord, telegram, slack, cli, email, webchat. `CHANNEL_ADAPTATIONS` constant map. |
| L4 index | `packages/core/src/persona/index.ts` | (barrel export) | IN_SYNC | C35 | **Added by dev-core**: barrel export for persona module. |

### B.6 Orchestrator (CORE-006)

Source: plan Layer 7 (lines 1378-1483), ADR-014, ADR-020, ADR-021

| Plan Section | Code Location | Interfaces | Status | Last Synced | Notes |
|---|---|---|---|---|---|
| L7 ReActConfig | `packages/core/src/orchestrator/types.ts` | `ReActConfig` (Zod), `DEFAULT_REACT_CONFIG`, `LlmProvider`, `ToolExecutor`, `SessionStore` | IN_SYNC | C41 | Zod schema `ReActConfigSchema`. Defaults match plan:1396-1401 exactly: maxIterations=15, toolTimeoutMs=30000, totalTimeoutMs=300000, streamingEnabled=true. **Added**: `LlmChatChunk` discriminated union (text/thinking/tool_call), `LlmChatParams`, `ResolvedSession`, `ChannelContext`, `SessionStats` DI contracts. 111 lines. |
| L7 reactLoop | `packages/core/src/orchestrator/react-loop.ts` | `reactLoop()`, `ReActLoopParams` | IN_SYNC | C41 | AsyncGenerator<ReActEvent>. 4 error recovery paths match plan:1439-1444: (1) retryable ProviderError → exponential backoff 100×2^n cap 5s, (2) ToolError → append to messages for LLM recovery, (3) channel send failure deferred to infra, (4) total timeout → yield partial + "시간 초과". ADR-020 error taxonomy fully applied. 269 lines. 330 tests (orchestrator module total). |
| L7 SessionRouter | `packages/core/src/orchestrator/session-router.ts` | `SessionRouter`, `UnifiedSession` | IN_SYNC | C41 | ADR-014. resolveSession (replaces plan's switchChannel — same semantics, detects channel switch via `ResolvedSession.channelSwitched`), endSession, getChannelContext (sync helper for LLM context), updateActivity, getActiveSession, getSessionStats. Delegation pattern to `SessionStore` DI contract. 78 lines. |
| L7 index | `packages/core/src/orchestrator/index.ts` | (barrel export) | IN_SYNC | C41 | **Added by dev-core**: barrel export for orchestrator module. 10 type exports + reactLoop + SessionRouter. |

### B.7 Cross-Package Interface Summary

These interfaces in `packages/core/src/types/` are consumed by other packages (CONSTITUTION §9):

| Interface | Defined In | Consumed By | Notes |
|---|---|---|---|
| `Memory`, `MemoryType`, `MemorySearchResult` | core/types/memory.ts | infra (persistence), core (decay, context) | Canonical memory domain type |
| `Message`, `MessageRole` | core/types/message.ts | infra (persistence), channels (adapters), gateway | Canonical message type |
| `SessionState`, `SessionSummary` | core/types/session.ts | infra (persistence), core (orchestrator) | Session FSM states |
| `ReActEvent`, `ToolCallRequest` | core/types/react.ts | gateway (WS streaming), channels (response routing) | Streaming event protocol |
| `ToolResult`, `ToolDefinition` | core/types/tool.ts | infra (MCP registry), core (orchestrator) | Tool system contract |
| `HealthState`, `HealthStatus`, `ComponentHealth` | core/types/health.ts | infra (all services), gateway (health endpoint) | System health protocol |
| `MemoryEngine`, `MemoryStats` | core/types/engine.ts | infra (memory impl), core (context assembly) | DI contract for memory |
| `TokenUsage` | core/types/common.ts | infra (LLM adapter), core (context budgeting) | Token accounting |
| `AxelError`, `AxelErrorInfo` | core/types/errors.ts | all packages (error handling) | Error classes for ReAct event serialization (ADR-020) |
| `DecayInput`, `DecayConfig` | core/decay/types.ts | infra (batch scheduler) | Decay calculation inputs (Zod schema validated) |
| `ContextBudget`, `AssembledContext`, `ContextDataProvider`, `TokenCounter` | core/context/types.ts | infra (data providers impl, token counter impl) | Context assembly DI contract (ADR-012, ADR-018) |
| `Persona`, `PersonaEngine` | core/persona/*.ts | infra (file I/O impl), core (orchestrator) | Persona system contract |
| `ReActConfig`, `SessionRouter`, `UnifiedSession` | core/orchestrator/types.ts | infra (Redis session store), channels (message routing) | Orchestration contract |
| `LlmProvider`, `LlmChatParams`, `LlmChatChunk` | core/orchestrator/types.ts | infra/src/llm/ (implements), core (reactLoop consumer) | **Moved to core** (plan originally had L5 infra-internal). DI contract in core enables package boundary compliance (CONSTITUTION §9). |
| `ToolExecutor` | core/orchestrator/types.ts | infra (tool runtime impl) | Tool dispatch DI contract for reactLoop |
| `SessionStore`, `ResolvedSession`, `ChannelContext`, `SessionStats` | core/orchestrator/types.ts | infra (Redis/PG session impl) | ADR-014. Session persistence DI contracts. |

## Phase C: Infra Sprint

### C.1 L2 Persistence (INFRA-001)

Source: plan §3.1 L2 / ADR-002 / ADR-013 / migration-strategy.md

| Plan Section | Code Location | Interfaces | Status | Last Synced | Notes |
|---|---|---|---|---|---|
| L2 PG Pool | `packages/infra/src/db/pg-pool.ts` | `PgPool`, `PgPoolConfig` | IN_SYNC | C46 | ADR-002. Connection pool wrapper with healthCheck(). 107 lines. |
| L2 Episodic | `packages/infra/src/db/pg-episodic-memory.ts` | `PgEpisodicMemory` | IN_SYNC | C46 | Implements EpisodicMemory (core). createSession/endSession/addMessage/getRecentSessions/searchByTopic/searchByContent. 166 lines. 62 tests total (db module). **Note**: searchByTopic uses ILIKE (AUD-053 MEDIUM — trigram index concern). addMessage non-atomic INSERT+UPDATE (AUD-063 LOW). |
| L2 Semantic | `packages/infra/src/db/pg-semantic-memory.ts` | `PgSemanticMemory` | IN_SYNC | C46 | Implements SemanticMemory (core). store/search/decay + HNSW pgvector index (3072d). Hybrid scoring 0.7v+0.3t. 234 lines. **Note**: decay() only does threshold DELETE, not ADR-015 8-step formula (AUD-057 MEDIUM — orchestration layer needed). |
| L2 Conceptual | `packages/infra/src/db/pg-conceptual-memory.ts` | `PgConceptualMemory` | IN_SYNC | C46 | Implements ConceptualMemory (core). Entity/relation CRUD + BFS traversal via recursive CTE. 167 lines. |
| L2 Meta | `packages/infra/src/db/pg-meta-memory.ts` | `PgMetaMemory` | IN_SYNC | C46 | Implements MetaMemory (core). Access pattern tracking + hot memories materialized view. 105 lines. |
| L2 Session | `packages/infra/src/db/pg-session-store.ts` | `PgSessionStore` | IN_SYNC | C46 | Implements SessionStore (core/orchestrator). resolve/update/end/getStats. 214 lines. **Note**: sessions table includes user_id added by dev-infra (plan-amendment PLAN-AMEND-001 pending arch). |
| L2 Index | `packages/infra/src/db/index.ts` | (barrel export) | IN_SYNC | C46 | Re-exports all PG adapters. |

### C.2 L2 Cache (INFRA-002)

Source: plan §3.1 L2 / ADR-003

| Plan Section | Code Location | Interfaces | Status | Last Synced | Notes |
|---|---|---|---|---|---|
| L2 Redis Working | `packages/infra/src/cache/redis-working-memory.ts` | `RedisWorkingMemory` | IN_SYNC | C46 | ADR-003. PG-first write, Redis cache-aside read, PG fallback on Redis failure. TTL 3600s. MAX_TURNS=20. 240 lines. **Note**: 8 bare catch blocks (QA-016 HIGH), getSummary no PG fallback (AUD-059 MEDIUM), compress empty catch (AUD-062 LOW). |
| L2 Redis Stream | `packages/infra/src/cache/redis-stream-buffer.ts` | `RedisStreamBuffer` | IN_SYNC | C46 | Redis Streams (XADD/XRANGE/XTRIM) for M0 real-time events. 98 lines. |
| L2 Cache Index | `packages/infra/src/cache/index.ts` | (barrel export) | IN_SYNC | C46 | Re-exports cache adapters. |

### C.3 L5 LLM Adapters (INFRA-003)

Source: plan L5 / ADR-020 / ADR-021

| Plan Section | Code Location | Interfaces | Status | Last Synced | Notes |
|---|---|---|---|---|---|
| L5 Anthropic | `packages/infra/src/llm/anthropic-provider.ts` | `AnthropicLlmProvider` | IN_SYNC | C46 | Messages API streaming, tool calling, thinking chunks. ProviderError with retryable classification. 202 lines. **Note**: silent JSON.parse failure on tool args (AUD-056 MEDIUM). |
| L5 Google | `packages/infra/src/llm/google-provider.ts` | `GoogleLlmProvider` | IN_SYNC | C46 | generateContentStream, function calling, retryable 429/503. 159 lines. **Note**: global mutable toolCallCounter (AUD-048 HIGH). |
| L5 LLM Index | `packages/infra/src/llm/index.ts` | (barrel export) | IN_SYNC | C46 | Re-exports LLM providers. |

### C.4 L5 Embedding (INFRA-004)

Source: plan L5 / ADR-016

| Plan Section | Code Location | Interfaces | Status | Last Synced | Notes |
|---|---|---|---|---|---|
| L5 Embedding | `packages/infra/src/embedding/index.ts` | `GeminiEmbeddingService` | IN_SYNC | C46 | gemini-embedding-001, 3072d, batchEmbedContents (max 100). Task types: RETRIEVAL_DOCUMENT/RETRIEVAL_QUERY. Retry 3x exponential backoff. Circuit breaker. 182 lines. 16 tests, 99.18% stmt. |

### C.5 L6 MCP Registry (INFRA-005)

Source: plan L6 / ADR-010

| Plan Section | Code Location | Interfaces | Status | Last Synced | Notes |
|---|---|---|---|---|---|
| L6 Tool Registry | `packages/infra/src/mcp/tool-registry.ts` | `defineTool`, `ToolRegistry`, `McpToolExecutor`, `validatePath` | IN_SYNC | C46 | defineTool() (Zod→JSON Schema), ToolRegistry (register/get/listAll/listByCategory), McpToolExecutor (ToolExecutor impl — Zod validation, timeout, command allowlist per ADR-010), validatePath (directory traversal prevention). 256 lines. 16 tests, 92.12% stmt. **Note**: validatePath no symlink resolution (AUD-054/QA-016 MEDIUM — security), __handler/__schema leaked (AUD-061 LOW), zodToJsonSchema simplified (QA-016 LOW). |
| L6 MCP Index | `packages/infra/src/mcp/index.ts` | (barrel export) | IN_SYNC | C46 | Re-exports MCP registry. |

### C.6 Common Utilities (COMMON-CB)

Source: ADR-021

| Plan Section | Code Location | Interfaces | Status | Last Synced | Notes |
|---|---|---|---|---|---|
| ADR-021 CB | `packages/infra/src/common/circuit-breaker.ts` | `CircuitBreaker`, `CircuitOpenError`, `CircuitBreakerConfig` | IN_SYNC | C46 | State machine: closed→open→half_open. Configurable failureThreshold/cooldownMs/halfOpenMaxProbes. 93 lines. 11 tests, 100% stmt. **Note**: halfOpenMaxProbes declared but not enforced (AUD-064 LOW). |

### C.7 Cross-Package Interface Summary (Infra → Core)

| Core Interface | Infra Implementation | Notes |
|---|---|---|
| `EpisodicMemory` (core/memory) | `PgEpisodicMemory` (infra/db) | Full impl |
| `SemanticMemory` (core/memory) | `PgSemanticMemory` (infra/db) | Full impl (decay simplified) |
| `ConceptualMemory` (core/memory) | `PgConceptualMemory` (infra/db) | Full impl |
| `MetaMemory` (core/memory) | `PgMetaMemory` (infra/db) | Full impl |
| `WorkingMemory` (core/memory) | `RedisWorkingMemory` (infra/cache) | PG-first + Redis cache |
| `StreamBuffer` (core/memory) | `RedisStreamBuffer` (infra/cache) | Redis Streams |
| `SessionStore` (core/orchestrator) | `PgSessionStore` (infra/db) | Full impl |
| `LlmProvider` (core/orchestrator) | `AnthropicLlmProvider`, `GoogleLlmProvider` (infra/llm) | Streaming + tool calling |
| `ToolExecutor` (core/orchestrator) | `McpToolExecutor` (infra/mcp) | Zod validation + allowlist |

### C.8 Known Issues from QA-016 + AUDIT-003

| ID | Severity | Location | Issue | Phase D Blocker? |
|---|---|---|---|---|
| AUD-046/047 | HIGH | all infra src | §9 text says `core/src/types/` only — actual imports from `core/memory`, `core/orchestrator` | No (text vs intent gap — §9 amendment needed) |
| AUD-048 | HIGH | google-provider.ts | Global mutable `toolCallCounter` | No (test-only concern) |
| AUD-049 | HIGH | redis-working-memory.ts | ADR-003 circuit breaker spec: ad-hoc boolean vs CircuitBreaker class | No (functional, design debt) |
| AUD-050 | HIGH | pg-session-store.ts | sessions user_id/channel_history plan-code schema gap | No (PLAN-AMEND-001 pending) |
| AUD-051 | HIGH | redis-working-memory.ts | userId as session_id (FK violation risk) | No (functional, naming concern) |
| QA-016-H2 | HIGH | redis-working-memory.ts | 8 bare catch blocks (silent error swallowing) | No (functional, ADR-003 violation) |
| QA-016-H1 | HIGH | mcp/tool-registry | zod dep resolve failure (16 tests cant run) | Yes (§10 violation) |

## Phase D: Edge Sprint

### D.1 Channel Types (EDGE-001)

Source: plan L8 (lines 1485-1562), ADR-009

| Plan Section | Code Location | Interfaces | Status | Last Synced | Notes |
|---|---|---|---|---|---|
| L8 AxelChannel | `packages/core/src/types/channel.ts` | `AxelChannel`, `ChannelCapabilities`, `InboundMessage`, `OutboundMessage`, `InboundHandler`, `MediaAttachment`, `PresenceStatus` | IN_SYNC | C51 | 7 exports. Lifecycle (start/stop/healthCheck), reconnection (ERR-042), optional streaming/presence/reactions. 24 tests. |
| L8 Channel Index | `packages/core/src/types/index.ts` | (barrel re-export) | IN_SYNC | C51 | Channel types added to existing barrel. |

### D.2 CLI Channel (EDGE-002)

Source: plan L8, ADR-009

| Plan Section | Code Location | Interfaces | Status | Last Synced | Notes |
|---|---|---|---|---|---|
| L8 CLI | `packages/channels/src/cli/cli-channel.ts` | `CliChannel` | IN_SYNC | C51 | AxelChannel impl. readline, fixed userId 'cli-user', streaming output, DI-friendly constructor. 133 lines. 21 tests, 95.95% stmt. |

### D.3 Discord Channel (EDGE-003)

Source: plan L8, ADR-009

| Plan Section | Code Location | Interfaces | Status | Last Synced | Notes |
|---|---|---|---|---|---|
| L8 Discord | `packages/channels/src/discord/discord-channel.ts` | `DiscordChannel` | IN_SYNC | C51 | AxelChannel impl. discord.js Client, bot/empty message filtering, 2000 char splitting, streaming via message.edit() (1s throttle), reconnection tracking, degraded health. 29 tests, 92.33% stmt. |

### D.4 Telegram Channel (EDGE-004)

| Plan Section | Code Location | Interfaces | Status | Last Synced | Notes |
|---|---|---|---|---|---|
| L8 Telegram | `packages/channels/src/telegram/telegram-channel.ts` | `TelegramChannel` | IN_SYNC | C55 | ADR-009. grammy Bot API, polling mode. 4096 char splitting, typing indicator via sendChatAction, streaming via editMessageText (1.5s throttle). DI-friendly constructor (createBot/onError). 23 tests, 97.66% stmt. CTO override (SYNC-006 2 cycles). |
| L8 Telegram Index | `packages/channels/src/telegram/index.ts` | (barrel export) | IN_SYNC | C55 | Re-exports TelegramChannel. |

### D.5 Gateway (EDGE-005 + FIX-GATEWAY-001)

| Plan Section | Code Location | Interfaces | Status | Last Synced | Notes |
|---|---|---|---|---|---|
| L9 Gateway Server | `packages/gateway/src/server.ts` | `createGatewayServer` | IN_SYNC | C55 | Node.js http + ws. Routes: GET /health, GET /health/detailed, POST /api/v1/chat, POST /api/v1/chat/stream (SSE), WS /ws. Security: timing-safe Bearer auth (HTTP), first-message auth (WS per ADR-019), CORS, error redaction (ADR-011), rate limiting (sliding window per-IP), 32KB body size limit. 391 lines. 32 tests (22 server + 10 WS), 87.01% stmt. FIX-GATEWAY-001 resolved AUD-065/066/067. |
| L9 Gateway Index | `packages/gateway/src/index.ts` | (barrel export) | IN_SYNC | C55 | Re-exports gateway server. |
| L9 Partial Routes | — | — | NOT_STARTED | C55 | 8/12 plan routes not yet implemented: /api/v1/memory/search, /api/v1/memory/stats, /api/v1/session/end, /api/v1/tools, /api/v1/tools/execute, /webhooks/telegram, /webhooks/discord. Stub acceptable for Phase D (AUD-072 MEDIUM). Phase E integration scope. |

### D.6 Bootstrap (BOOTSTRAP-001)

| Plan Section | Code Location | Interfaces | Status | Last Synced | Notes |
|---|---|---|---|---|---|
| Bootstrap Config | `apps/axel/src/config.ts` | `AxelConfigSchema` (Zod), `AxelConfig` | IN_SYNC | C55 | Zod schema with env mapping. All config fields validated. 230 lines. 13 tests. CTO override (SYNC-006 2 cycles). |
| Bootstrap Container | `apps/axel/src/container.ts` | `createContainer` | IN_SYNC | C55 | ~20 injectable services: PgPool, Redis, 6 memory layers, 2 LLM providers, embedding, session router, context assembler, tool registry, persona engine. ADR-006 constructor injection. 276 lines. 7 tests. |
| Bootstrap Lifecycle | `apps/axel/src/lifecycle.ts` | `aggregateHealth`, `startupHealthCheck`, `gracefulShutdown` | IN_SYNC | C55 | 4-phase shutdown per ADR-021 (stop accepting → drain pending → close connections → final flush). 137 lines. 13 tests. |
| Bootstrap Main | `apps/axel/src/main.ts` | `bootstrap` | IN_SYNC | C55 | Entry point. SIGTERM/SIGINT handlers. 60 lines. 0% coverage (entry point, not unit-testable). |

### D.7 Plan Amendment (PLAN-AMEND-001)

| Plan Section | Code Location | Status | Last Synced | Notes |
|---|---|---|---|---|
| ADR-002:23 | `docs/adr/002-postgresql-single-db.md` | AMENDED | C51 | PG 16→17. AUD-058 resolved. CTO override (arch 3 cycles stalled). |
| migration-strategy:9,70,502 | `docs/plan/migration-strategy.md` | AMENDED | C51 | PG 16→17. CI image pg16→pg17. |
| migration-strategy:103-117 | `docs/plan/migration-strategy.md` | AMENDED | C51 | sessions table: user_id TEXT NOT NULL + channel_history JSONB added. idx_sessions_user added. Aligns with PgSessionStore implementation (AUD-050). |

## Drift Log

| Cycle | Section | Direction | Resolution | Resolved By |
|-------|---------|-----------|------------|-------------|
| 20 | ADR-013:144,171-174 | plan→plan | IVFFlat→HNSW aligned with plan body, ADR-002, migration-strategy | FIX-PRE-IMPL |
| 20 | migration-strategy:372,377-393 | plan→plan | IVFFlat text/SQL→HNSW, note rewritten for HNSW characteristics | FIX-PRE-IMPL |
| 20 | plan:843-853 | plan→plan | hot_memories MV SQL: INNER JOIN→LEFT JOIN, aligned with migration-strategy:285-302 | FIX-PRE-IMPL |
| 32 | Phase A scaffold files | NOT_STARTED→IN_SYNC | 20/21 scaffold files verified present on div/arch worktree. SCAFFOLD-001~006+FIX complete. | SYNC-001 |
| 35 | A.3 CI Pipeline | NOT_STARTED→IN_SYNC | ci.yml verified: Node.js 22, pnpm 9, lint→typecheck→test pipeline. SCAFFOLD-007 done C33. | SYNC-002 |
| 35 | B.1 Core Domain Types | NOT_STARTED→IN_SYNC | 10 src + 10 test files. 55 tests pass. All plan §3.5 interfaces implemented. errors.ts added (reasonable extension). CORE-001 done C33. | SYNC-002 |
| 35 | B.2 Adaptive Decay | NOT_STARTED→IN_SYNC | 4 src + 3 test files. 34 tests, 100% stmt coverage. ADR-015 8-step formula verified. CORE-002 done C34. | SYNC-002 |
| 35 | B.5 Persona Engine | NOT_STARTED→IN_SYNC | 4 src + 3 test files. 32 tests, 100% stmt coverage. PersonaEngine interface + buildSystemPrompt pure fn. CORE-005 done C34. | SYNC-002 |
| 37 | B.3 Memory Layers M0-M5 | NOT_STARTED→IN_SYNC | 8 src + 7 test files. 241 tests, 100% stmt, 95% branch. All 6 layer interfaces match plan §3.1/ADR-013. 22 types + 6 InMemory* stubs. No drift. CORE-003 done C36. | SYNC-003 |
| 40 | QA-011 3 MEDIUM remnants | verified resolved | ADR-013:144,171-174 HNSW confirmed. migration-strategy:372,377-393 HNSW confirmed. plan:843-857 LEFT JOIN confirmed. All 3 issues resolved by FIX-PRE-IMPL (C20). QA-011 flagged them but checked pre-FIX-PRE-IMPL state. No remaining drift. | arch (C40 verification) |
| 41 | B.4 Context Assembly | NOT_STARTED→IN_SYNC | 3 src + 2 test files. 289 tests, 100% coverage. ContextBudget 8 slots 76K, 8-stage assembly order, binary-search truncation all match plan §3.3. TokenCounter added per ADR-018. CORE-004 done C37/merged C40. | SYNC-003 |
| 41 | B.6 Orchestrator | NOT_STARTED→IN_SYNC | 4 src + 3 test files. 330 tests, 99.69% stmt. ReActConfig defaults match plan:1396-1401. 4 error recovery paths per ADR-020. SessionRouter delegation per ADR-014. LlmProvider moved to core (plan had infra-internal). CORE-006 done C38/merged C40. | SYNC-003 |
| 41 | B.7 Interface Summary | updated | LlmProvider, ToolExecutor, SessionStore, ChannelContext, SessionStats added to cross-package summary. LlmProvider moved from "infra-internal" to core DI contract. | SYNC-003 |
| 46 | C.1 L2 Persistence | NOT_STARTED→IN_SYNC | INFRA-001 (6 adapters, 62 tests, 95.5% stmt). PgPool, PgEpisodicMemory, PgSemanticMemory, PgConceptualMemory, PgMetaMemory, PgSessionStore. ADR-002/013/021. CTO override (SYNC-004 3 cycles stalled). | coord (CTO override) |
| 46 | C.2 L2 Cache | NOT_STARTED→IN_SYNC | INFRA-002 (25 tests, 91.44% stmt). RedisWorkingMemory (PG-first + cache-aside), RedisStreamBuffer (Redis Streams). ADR-003. | coord (CTO override) |
| 46 | C.3 L5 LLM Adapters | NOT_STARTED→IN_SYNC | INFRA-003 (15 tests, 95.89% stmt). AnthropicLlmProvider, GoogleLlmProvider. ADR-020/021. | coord (CTO override) |
| 46 | C.4 L5 Embedding | NOT_STARTED→IN_SYNC | INFRA-004 (16 tests, 99.18% stmt). GeminiEmbeddingService 3072d. ADR-016. | coord (CTO override) |
| 46 | C.5 L6 MCP Registry | NOT_STARTED→IN_SYNC | INFRA-005 (16 tests, 92.12% stmt). defineTool + ToolRegistry + McpToolExecutor + validatePath. ADR-010. | coord (CTO override) |
| 46 | C.6 Common CB | NOT_STARTED→IN_SYNC | COMMON-CB (11 tests, 100% stmt). CircuitBreaker state machine per ADR-021. | coord (CTO override) |
| 46 | C.7 Interface Summary | created | 9 core→infra interface implementations mapped. All core memory/orchestrator DI contracts have concrete infra implementations. | coord (CTO override) |
| 46 | C.8 Known Issues | created | 7 HIGH + 8 MEDIUM + 5 LOW from QA-016 + AUDIT-003. 1 Phase D blocker (zod dep resolve). | coord (CTO override) |
| 51 | D.1 Channel Types | NOT_STARTED→IN_SYNC | EDGE-001 (7 channel interfaces, 24 tests). AxelChannel + 6 supporting types. | coord (CTO override, SYNC-005) |
| 51 | D.2 CLI Channel | NOT_STARTED→IN_SYNC | EDGE-002 (CliChannel, 21 tests, 95.95% stmt). readline AxelChannel impl. | coord (CTO override, SYNC-005) |
| 51 | D.3 Discord Channel | NOT_STARTED→IN_SYNC | EDGE-003 (DiscordChannel, 29 tests, 92.33% stmt). discord.js AxelChannel impl. | coord (CTO override, SYNC-005) |
| 51 | D.7 ADR-002 PG 16→17 | plan→plan | AMENDED. ADR-002:23, migration-strategy:9/70/502 updated. AUD-058 resolved. | coord (CTO override, PLAN-AMEND-001) |
| 51 | D.7 sessions user_id | code→plan | AMENDED. migration-strategy sessions table: user_id + channel_history added. AUD-050 resolved. | coord (CTO override, PLAN-AMEND-001) |
| 55 | D.4 Telegram Channel | NOT_STARTED→IN_SYNC | EDGE-004 (TelegramChannel, 23 tests, 97.66% stmt). grammy Bot API, polling, 4096 char splitting. | coord (CTO override, SYNC-006) |
| 55 | D.5 Gateway | NOT_STARTED→IN_SYNC | EDGE-005 + FIX-GATEWAY-001. 32 tests, 87.01% stmt. WS first-message auth (ADR-019), rate limiting, 32KB body limit. 4/12 routes implemented (8 deferred to Phase E). | coord (CTO override, SYNC-006) |
| 55 | D.6 Bootstrap | NOT_STARTED→IN_SYNC | BOOTSTRAP-001. config (Zod), container (~20 services), lifecycle (4-phase shutdown), main. 33 tests, 86.95% stmt. | coord (CTO override, SYNC-006) |
