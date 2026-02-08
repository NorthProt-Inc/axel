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
| §3.3 ContextBudget | `packages/core/src/context/types.ts` | `ContextBudget` | NOT_STARTED | — | 8 budget slots, total 76K tokens (plan:1101-1111). 200K model → ~124K generation. |
| §3.3 AssembledContext | `packages/core/src/context/types.ts` | `AssembledContext`, `ContextSection` | NOT_STARTED | — | `sections[]` with per-section token count + source layer annotation (plan:1114-1126). |
| §3.3 ContextDataProvider | `packages/core/src/context/types.ts` | `ContextDataProvider` | NOT_STARTED | — | DI contract (ADR-006). 7 data methods: working, semantic, graph, session, stream, meta, tools (plan:1130-1138). No I/O in assembler itself. |
| §3.3 assembler | `packages/core/src/context/assembler.ts` | `ContextAssembler` | NOT_STARTED | — | Constructor injection of `ContextDataProvider`. Priority-ordered assembly (plan:1143-1153). Truncation on budget overflow. |

### B.5 Persona Engine (CORE-005)

Source: plan Layer 4 (lines 1155-1227), ADR-006

| Plan Section | Code Location | Interfaces | Status | Last Synced | Notes |
|---|---|---|---|---|---|
| L4 PersonaSchema | `packages/core/src/persona/schema.ts` | `PersonaSchema` (Zod), `Persona` (inferred type) | IN_SYNC | C35 | Zod schema verified: `learned_behaviors[]` with confidence, `user_preferences`, `voice_style`, `constraints`, `version`. 32 tests, 100% stmt coverage. |
| L4 PersonaEngine | `packages/core/src/persona/engine.ts` | `PersonaEngine` (interface), `buildSystemPrompt()` (pure fn) | IN_SYNC | C35 | Interface: 5 methods (load, reload, getSystemPrompt, evolve, updatePreference). `buildSystemPrompt` pure function in core; hot-reload (fs.watch) deferred to infra impl. |
| L4 ChannelAdaptations | `packages/core/src/persona/channel-adaptations.ts` | `ChannelAdaptation` | IN_SYNC | C35 | Per-channel formality/verbosity. 6 channels: discord, telegram, slack, cli, email, webchat. `CHANNEL_ADAPTATIONS` constant map. |
| L4 index | `packages/core/src/persona/index.ts` | (barrel export) | IN_SYNC | C35 | **Added by dev-core**: barrel export for persona module. |

### B.6 Orchestrator (CORE-006)

Source: plan Layer 7 (lines 1378-1483), ADR-014

| Plan Section | Code Location | Interfaces | Status | Last Synced | Notes |
|---|---|---|---|---|---|
| L7 ReActConfig | `packages/core/src/orchestrator/types.ts` | `ReActConfig` | NOT_STARTED | — | maxIterations:15, toolTimeout:30s, totalTimeout:300s, streaming flag (plan:1396-1401). |
| L7 reactLoop | `packages/core/src/orchestrator/react-loop.ts` | `reactLoop()` | NOT_STARTED | — | AsyncGenerator<ReActEvent>. 4 error recovery paths (plan:1439-1444). Uses `LlmProvider` + `ToolDefinition[]`. |
| L7 SessionRouter | `packages/core/src/orchestrator/session-router.ts` | `SessionRouter`, `UnifiedSession` | NOT_STARTED | — | ADR-014. resolveSession, switchChannel, endSession (plan:1452-1470). Cross-channel session unification. |

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
| `ContextBudget`, `AssembledContext`, `ContextDataProvider` | core/context/types.ts | infra (data providers impl) | Context assembly DI contract |
| `Persona`, `PersonaEngine` | core/persona/*.ts | infra (file I/O impl), core (orchestrator) | Persona system contract |
| `ReActConfig`, `SessionRouter`, `UnifiedSession` | core/orchestrator/types.ts | infra (Redis session store), channels (message routing) | Orchestration contract |
| `LlmProvider`, `ChatParams`, `ChatChunk` | plan L5 (lines 1247-1270) | infra/src/llm/ only | NOT in core/types — defined in infra. Infra-internal interface. |

## Phase C: Infra Sprint

| Plan Section | Layer | Code Location | Status | Last Synced | Notes |
|---|---|---|---|---|---|
| L2 Persistence | TL2 | `packages/infra/src/db/` | NOT_STARTED | — | ADR-002. PostgreSQL 17 + pgvector. Connection pool + prepared statements. |
| L2 Cache | TL2 | `packages/infra/src/cache/` | NOT_STARTED | — | ADR-003. Redis 7. Working memory + stream buffer + prefetch cache. |
| L5 LLM Adapter | TL2 | `packages/infra/src/llm/` | NOT_STARTED | — | Provider adapters (Anthropic, Google, Ollama). Circuit breaker + retry. `LlmProvider` interface. |
| L5 Embedding | TL2 | `packages/infra/src/embedding/` | NOT_STARTED | — | ADR-016. gemini-embedding-001. 3072d. batchEmbedContents. |
| L6 MCP Registry | TL2 | `packages/infra/src/mcp/` | NOT_STARTED | — | `defineTool()` pattern. Auto-registration. Command allowlist (ADR-010). |

## Phase D: Edge Sprint

| Plan Section | Layer | Code Location | Status | Last Synced | Notes |
|---|---|---|---|---|---|
| L8 CLI Channel | TL1 | `packages/channels/src/cli/` | NOT_STARTED | — | ADR-009. readline-based. |
| L8 Discord | TL1 | `packages/channels/src/discord/` | NOT_STARTED | — | ADR-009. discord.js. |
| L8 Telegram | TL1 | `packages/channels/src/telegram/` | NOT_STARTED | — | ADR-009. Grammy. |
| L9 Gateway | TL1 | `packages/gateway/src/` | NOT_STARTED | — | HTTP/WS. OpenAPI spec (PLAN-002). |
| Bootstrap | TL0 | `apps/axel/src/` | NOT_STARTED | — | DI container assembly. Lifecycle management (ADR-021). |

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
