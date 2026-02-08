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
| 3.3 Monorepo | TL0 | `pnpm-workspace.yaml` | NOT_STARTED | — | ADR-004. Workspace packages: `packages/*`, `apps/*`, `tools/*` (plan:202-276) |
| 3.3 Monorepo | TL0 | `package.json` (root) | NOT_STARTED | — | ADR-004. Workspace scripts: `typecheck`, `test`, `lint`, `build` |
| 3.3/TL0 tsconfig | TL0 | `tsconfig.base.json` | NOT_STARTED | — | ADR-001. strict:true, noUncheckedIndexedAccess, exactOptionalPropertyTypes, target ES2023, module NodeNext (plan:546-557) |
| TL0 Biome | TL0 | `biome.json` | NOT_STARTED | — | ADR-007. Replaces ESLint+Prettier. Lint + format config (plan:541) |
| 6.3 Test Infra | TL0 | `vitest.config.ts` (root) | NOT_STARTED | — | ADR-008. pool:"forks" for process isolation (plan:1790-1815) |
| TL0 Docker | TL0 | `docker/docker-compose.dev.yml` | NOT_STARTED | — | ADR-002, ADR-003. PostgreSQL 17 + pgvector + Redis 7 (plan:268-271) |

### A.2 Per-Package Config (SCAFFOLD-004~005)

| Plan Section | Layer | Code Location | Status | Last Synced | Notes |
|---|---|---|---|---|---|
| 3.3 Monorepo | TL0 | `packages/core/package.json` | NOT_STARTED | — | No external I/O deps. Exports `types/`. (plan:210-219) |
| 3.3 Monorepo | TL0 | `packages/core/tsconfig.json` | NOT_STARTED | — | extends tsconfig.base.json |
| 3.3 Monorepo | TL0 | `packages/infra/package.json` | NOT_STARTED | — | May import `@axel/core/types` only (CONSTITUTION §9) |
| 3.3 Monorepo | TL0 | `packages/infra/tsconfig.json` | NOT_STARTED | — | extends tsconfig.base.json |
| 3.3 Monorepo | TL0 | `packages/channels/package.json` | NOT_STARTED | — | May import `@axel/core/types` only (CONSTITUTION §9) |
| 3.3 Monorepo | TL0 | `packages/channels/tsconfig.json` | NOT_STARTED | — | extends tsconfig.base.json |
| 3.3 Monorepo | TL0 | `packages/gateway/package.json` | NOT_STARTED | — | May import `@axel/core/types` only (CONSTITUTION §9) |
| 3.3 Monorepo | TL0 | `packages/gateway/tsconfig.json` | NOT_STARTED | — | extends tsconfig.base.json |
| 3.3 Monorepo | TL0 | `apps/axel/package.json` | NOT_STARTED | — | May import any `@axel/*` (CONSTITUTION §9) |
| 3.3 Monorepo | TL0 | `apps/axel/tsconfig.json` | NOT_STARTED | — | extends tsconfig.base.json |
| 6.3 Test Infra | TL0 | `packages/*/vitest.config.ts` | NOT_STARTED | — | ADR-008. Per-package test config |

### A.3 CI Pipeline (SCAFFOLD-007)

| Plan Section | Layer | Code Location | Status | Last Synced | Notes |
|---|---|---|---|---|---|
| 7/Phase 0 CI | TL0 | `.github/workflows/ci.yml` | NOT_STARTED | — | RES-005. Pipeline: lint → typecheck → test (plan:1860, CONSTITUTION §13) |

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

| Plan Section | Layer | Code Location | Status | Last Synced | Notes |
|---|---|---|---|---|---|
| 3.5 Core Types | TL3 | `packages/core/src/types/` | NOT_STARTED | — | |
| 4.3 Adaptive Decay | TL3 | `packages/core/src/decay/` | NOT_STARTED | — | ADR-015 |
| 4.2 Memory Layers | TL3 | `packages/core/src/memory/` | NOT_STARTED | — | ADR-013 |
| 4.4 Context Assembly | TL3 | `packages/core/src/context/` | NOT_STARTED | — | |
| 4.5 Persona Engine | TL3 | `packages/core/src/persona/` | NOT_STARTED | — | |
| 4.6 Orchestrator | TL3 | `packages/core/src/orchestrator/` | NOT_STARTED | — | |

## Phase C: Infra Sprint

| Plan Section | Layer | Code Location | Status | Last Synced | Notes |
|---|---|---|---|---|---|
| 4.1 Persistence | TL2 | `packages/infra/src/db/` | NOT_STARTED | — | ADR-002 |
| 4.1 Cache | TL2 | `packages/infra/src/cache/` | NOT_STARTED | — | ADR-003 |
| 4.7 LLM Adapter | TL2 | `packages/infra/src/llm/` | NOT_STARTED | — | |
| 4.8 Embedding | TL2 | `packages/infra/src/embedding/` | NOT_STARTED | — | ADR-016 |
| 4.9 MCP Registry | TL2 | `packages/infra/src/mcp/` | NOT_STARTED | — | |

## Phase D: Edge Sprint

| Plan Section | Layer | Code Location | Status | Last Synced | Notes |
|---|---|---|---|---|---|
| 5.1 CLI Channel | TL1 | `packages/channels/src/cli/` | NOT_STARTED | — | |
| 5.3 App Bootstrap | TL0 | `apps/axel/src/` | NOT_STARTED | — | |
| 5.2 Gateway | TL1 | `packages/gateway/src/` | NOT_STARTED | — | |
| 5.4 Discord | TL1 | `packages/channels/src/discord/` | NOT_STARTED | — | |
| 5.5 Telegram | TL1 | `packages/channels/src/telegram/` | NOT_STARTED | — | |

## Drift Log

| Cycle | Section | Direction | Resolution | Resolved By |
|-------|---------|-----------|------------|-------------|
| 20 | ADR-013:144,171-174 | plan→plan | IVFFlat→HNSW aligned with plan body, ADR-002, migration-strategy | FIX-PRE-IMPL |
| 20 | migration-strategy:372,377-393 | plan→plan | IVFFlat text/SQL→HNSW, note rewritten for HNSW characteristics | FIX-PRE-IMPL |
| 20 | plan:843-853 | plan→plan | hot_memories MV SQL: INNER JOIN→LEFT JOIN, aligned with migration-strategy:285-302 | FIX-PRE-IMPL |
