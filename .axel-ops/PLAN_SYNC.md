# PLAN_SYNC: Plan-Code Synchronization

> Maintained by Architect Division. Updated at every milestone.
> DRIFT status unresolved for 5+ cycles → automatic escalation (CONSTITUTION Rule 11).

## Sync Status Legend

- `NOT_STARTED` — Code location does not exist yet
- `IN_SYNC` — Plan and code are aligned
- `DRIFT` — Plan and code have diverged; resolution needed
- `AMENDED` — Plan was updated to match implementation discovery

## Phase A: Foundation

| Plan Section | Layer | Code Location | Status | Last Synced | Notes |
|---|---|---|---|---|---|
| — | — | `pnpm-workspace.yaml` | NOT_STARTED | — | DevOps scaffolding |
| — | — | `tsconfig.base.json` | NOT_STARTED | — | DevOps scaffolding |
| — | — | `biome.json` | NOT_STARTED | — | DevOps scaffolding |
| — | — | `vitest.config.ts` | NOT_STARTED | — | DevOps scaffolding |
| — | — | `docker/docker-compose.dev.yml` | NOT_STARTED | — | DevOps scaffolding |
| — | — | `.github/workflows/ci.yml` | NOT_STARTED | — | DevOps scaffolding |

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
| — | — | — | — | — |
