# DEPLOY

> Maintained by DevOps Division. Tracks infrastructure and deployment state.

## Environment Status

| Component | Status | Version | Notes |
|-----------|--------|---------|-------|
| Node.js | ✅ READY | 22.13.1 | Runtime — ready for Phase E |
| pnpm | ✅ READY | 9.15.4 (via npx) | Package manager — functional |
| PostgreSQL | ✅ READY | 17 + pgvector 0.8.1 | Docker Compose running, schema migrated (6 migrations applied) |
| Redis | ✅ READY | 7 Alpine | Docker Compose running |
| Docker Compose | ✅ READY | — | Dev environment operational |
| GitHub Actions | ✅ READY | — | CI workflow active |
| Migration Tool | ✅ READY | @axel/migrate 0.1.0 | DB migration runner (tools/migrate/), 10 tests pass |

## Monorepo Scaffolding

| File | Status | Notes |
|------|--------|-------|
| `pnpm-workspace.yaml` | ✅ CREATED | Workspace definition |
| `tsconfig.base.json` | ✅ CREATED | TypeScript 5.7 strict config |
| `biome.json` | ✅ CREATED | Linter + formatter config |
| `package.json` (root) | ✅ CREATED | Workspace scripts |
| `vitest.config.ts` (root) | ✅ CREATED | Test config |
| `packages/core/package.json` | ✅ UPDATED | + tsconfig.json, vitest.config.ts, @vitest/coverage-v8, **subpath exports** (C44) |
| `packages/infra/package.json` | ✅ CREATED | + tsconfig.json, vitest.config.ts |
| `packages/channels/package.json` | ✅ UPDATED | + tsconfig.json, vitest.config.ts, **subpath exports** (C48) |
| `packages/gateway/package.json` | ✅ UPDATED | + tsconfig.json, vitest.config.ts, **subpath exports** (C48) |
| `apps/axel/package.json` | ✅ CREATED | + tsconfig.json, vitest.config.ts |

## Docker Compose (Dev)

| Service | Image | Port | Status |
|---------|-------|------|--------|
| PostgreSQL 17 | `pgvector/pgvector:pg17` | 5432 | ✅ CONFIGURED |
| Redis 7 | `redis:7-alpine` | 6379 | ✅ CONFIGURED |

File: `docker/docker-compose.dev.yml`

## CI/CD Pipeline

| Workflow | Trigger | Steps | Status |
|----------|---------|-------|--------|
| CI | push to main, PRs | lint → typecheck → test | ✅ CREATED |

File: `.github/workflows/ci.yml`
- Node.js 22, pnpm 9
- pnpm store caching enabled
- Sequential: lint → typecheck → test

## Coverage Tooling

| Package | Provider | Thresholds | Status |
|---------|----------|------------|--------|
| `@axel/core` | v8 | 90% (lines/functions/branches/statements) | ✅ CONFIGURED |
| `@axel/infra` | v8 | 80% (lines/functions/branches/statements) | ✅ CONFIGURED (testcontainers: PG17+pgvector, Redis7) |
| `@axel/channels` | v8 | 75% (lines/functions/branches/statements) | ✅ CONFIGURED (C48, DEVOPS-006) |
| `@axel/gateway` | v8 | 80% (lines/functions/branches/statements) | ✅ CONFIGURED (C48, DEVOPS-006) |

## Phase C Dependencies (Infra Sprint)

| Package | Dependencies | Status |
|---------|-------------|--------|
| `@axel/infra` | pg@^8.18.0, ioredis@^5.9.2 | ✅ ADDED (C42) |
| `@axel/infra` | @anthropic-ai/sdk@^0.74.0 | ✅ ADDED (C42) |
| `@axel/infra` | @google/generative-ai@^0.24.1 | ✅ ADDED (C42) |
| `@axel/infra` | @types/pg@^8.16.0, testcontainers@^11.11.0 | ✅ ADDED (C42, devDeps) |
| `@axel/infra` | @testcontainers/postgresql@^11.11.0 | ✅ ADDED (C47, FIX-INFRA-001) |
| `@axel/infra` | zod@^4.3.6 | ✅ RESOLVED (C47 — symlink regenerated via pnpm install) |

## Phase D Dependencies (Edge Sprint)

| Package | Dependencies | Status |
|---------|-------------|--------|
| `@axel/channels` | discord.js@^14.25.1 | ✅ ADDED (C47, DEVOPS-005) |
| `@axel/channels` | grammy@^1.39.3 | ✅ ADDED (C47, DEVOPS-005) |
| `@axel/gateway` | pino@^10.3.0 | ✅ ADDED (C47, DEVOPS-005) |
| `@axel/gateway` | ws@^8.19.0 | ✅ ADDED (C47, DEVOPS-005) |
| `@axel/gateway` | zod@^4.3.6 | ✅ ADDED (C47, DEVOPS-005) |
| `@axel/gateway` | @types/ws@^8.5.14 (devDep) | ✅ ADDED (C47, DEVOPS-005) |

## Subpath Exports

### @axel/core

| Export | Path | Status |
|--------|------|--------|
| `@axel/core/types` | `./src/types/index.ts` | ✅ CONFIGURED (C44) |
| `@axel/core/memory` | `./src/memory/index.ts` | ✅ CONFIGURED (C44) |
| `@axel/core/decay` | `./src/decay/index.ts` | ✅ CONFIGURED (C44) |
| `@axel/core/context` | `./src/context/index.ts` | ✅ CONFIGURED (C44) |
| `@axel/core/persona` | `./src/persona/index.ts` | ✅ CONFIGURED (C44) |
| `@axel/core/orchestrator` | `./src/orchestrator/index.ts` | ✅ CONFIGURED (C44) |

### @axel/channels

| Export | Path | Status |
|--------|------|--------|
| `@axel/channels` | `./src/index.ts` | ✅ CONFIGURED (C48, DEVOPS-006) |
| `@axel/channels/cli` | `./src/cli/index.ts` | ✅ CONFIGURED (C48, DEVOPS-006) |
| `@axel/channels/discord` | `./src/discord/index.ts` | ✅ CONFIGURED (C48, DEVOPS-006) |
| `@axel/channels/telegram` | `./src/telegram/index.ts` | ✅ CONFIGURED (C48, DEVOPS-006) |

### @axel/gateway

| Export | Path | Status |
|--------|------|--------|
| `@axel/gateway` | `./src/index.ts` | ✅ CONFIGURED (C48, DEVOPS-006) |
| `@axel/gateway/routes` | `./src/routes/index.ts` | ✅ CONFIGURED (C48, DEVOPS-006) |
| `@axel/gateway/middleware` | `./src/middleware/index.ts` | ✅ CONFIGURED (C48, DEVOPS-006) |
| `@axel/gateway/websocket` | `./src/websocket/index.ts` | ✅ CONFIGURED (C48, DEVOPS-006) |

**Enables clean cross-package imports per CONSTITUTION §9.** Verified: 646 tests pass (C55), typecheck+lint clean.

## Migration Tool

| Component | Status | Notes |
|-----------|--------|-------|
| `@axel/migrate` | ✅ OPERATIONAL | TypeScript migration runner in tools/migrate/ |
| Runner Implementation | ✅ COMPLETE | migrator.ts (sequential, transactional, idempotent) |
| CLI | ✅ COMPLETE | cli.ts (up/down/status commands) |
| SQL Migrations | ✅ COMPLETE | 6 migrations (001-006) with rollback support |
| Tests | ✅ PASS | 10 tests, testcontainers (PG17+pgvector) |
| Docker Compose Integration | ✅ VERIFIED | All 6 migrations applied to axel-postgres container |

### Migrations Applied

| Version | Name | Status | Applied At |
|---------|------|--------|------------|
| 001 | extensions | ✅ APPLIED | 2026-02-08 18:00:42 |
| 002 | episodic_memory | ✅ APPLIED | 2026-02-08 18:00:42 |
| 003 | semantic_memory | ✅ APPLIED | 2026-02-08 18:00:42 |
| 004 | conceptual_memory | ✅ APPLIED | 2026-02-08 18:00:42 |
| 005 | meta_memory | ✅ APPLIED | 2026-02-08 18:00:42 |
| 006 | interaction_logs | ✅ APPLIED | 2026-02-08 18:00:42 |

### Schema Verified

- ✅ pgvector extension 0.8.1 enabled
- ✅ Tables: sessions, messages, memories, entities, relations, memory_access_patterns, interaction_logs
- ✅ Materialized view: hot_memories
- ✅ All indexes created (except memories vector index — see ERR-069)

### Usage

```bash
# Apply all pending migrations
DATABASE_URL="postgresql://axel:axel_dev_password@localhost:5432/axel" \
  node tools/migrate/dist/cli.js up

# Rollback specific migration
DATABASE_URL="postgresql://axel:axel_dev_password@localhost:5432/axel" \
  node tools/migrate/dist/cli.js down 6

# Show migration status
DATABASE_URL="postgresql://axel:axel_dev_password@localhost:5432/axel" \
  node tools/migrate/dist/cli.js status
```

## Known Issues

| ID | Severity | Description | Status |
|----|----------|-------------|--------|
| ERR-069 | **CRITICAL P0 BLOCKER** | pgvector 0.8.1 has **HARD LIMIT of 2000 dimensions** for ALL index types (HNSW, IVFFlat). Plan specifies 3072d embeddings (ADR-016), which is **INCOMPATIBLE**. Options: (1) Downgrade to ≤2000d (requires ADR-016 amendment), (2) Wait for pgvector 0.9+, (3) Unindexed vector search (unacceptable), (4) Alternative vector DB (violates ADR-002). TEMPORARY: memories table created WITHOUT vector index. Vector search will use sequential scan. **Escalate to Coordinator immediately.** | ⚠️ OPEN |

## Known Issues (Resolved)

| Issue | Cycle | Resolution |
|-------|-------|-----------|
| ERR-065 MEDIUM: zod resolve failure — 16 MCP tests skipped (QA-016 HIGH) | C46 | **RESOLVED (C47, FIX-INFRA-001)**: Root cause: zod symlink missing in packages/infra/node_modules. Fix: (1) pnpm install regenerated zod symlink, (2) Added @testcontainers/postgresql@^11.11.0 devDep (PostgreSqlContainer moved to separate package in testcontainers v11+), (3) Updated tests/setup.ts import. **Result: 475 tests, 41 files, 0 skips.** CONSTITUTION §10 compliance restored. |

## Release History

| Version | Date | Notes |
|---------|------|-------|
| — | — | — |
