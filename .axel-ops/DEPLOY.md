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

## Production Build Pipeline

| Component | Command | Status | Notes |
|-----------|---------|--------|-------|
| Root Build Script | `pnpm build` | ⚠️ CONFIGURED (type errors) | TypeScript project references (`tsc -b`) |
| Package Build Scripts | Individual `pnpm build` | ⚠️ CONFIGURED (type errors) | All packages/apps/tools have build scripts |
| TypeScript References | `tsconfig.json` | ✅ CONFIGURED | 8 project references configured |
| Clean Build | `pnpm build:clean` | ✅ CONFIGURED | Cleans all build artifacts |
| Format Check | `pnpm format:check` | ✅ CONFIGURED | Biome format validation (CI-ready) |

### Build Configuration

**Root TypeScript Config** (`tsconfig.json`):
- 8 project references: core, infra, channels, gateway, ui, axel, webchat, migrate
- Uses `tsc -b` for incremental builds
- Dependency graph automatically resolved

**Package Build Scripts**:
- `packages/core`: `tsc` → `dist/`
- `packages/infra`: `tsc` → `dist/`
- `packages/channels`: `tsc` → `dist/`
- `packages/gateway`: `tsc` → `dist/`
- `packages/ui`: `tsc` → `dist/`
- `apps/axel`: `tsc` → `dist/`
- `apps/webchat`: `vite build` (Svelte SPA)
- `tools/migrate`: `tsc` → `dist/`

### Known Build Issues

**Status**: Build pipeline configured (C90, FIX-BUILD-001), type errors remain in source code.

Type errors encountered during `pnpm build`:
- `noPropertyAccessFromIndexSignature` violations (process.env, SDK property access)
- `exactOptionalPropertyTypes` violations (optional property handling)
- Unused variables/imports (`MemoryType`, `config`)
- Type mismatches in external SDK type definitions (Anthropic, Google AI)

**Affected Files**:
- `packages/core/src/decay/types.ts` (unused import)
- `packages/infra/src/db/pg-pool.ts` (unused variable)
- `packages/infra/src/llm/anthropic-provider.ts` (index signature, exactOptional)
- `packages/infra/src/llm/google-provider.ts` (index signature, exactOptional)
- `packages/infra/src/mcp/tool-registry.ts` (index signature)
- `packages/channels/src/discord/discord-channel.ts` (type mismatch, exactOptional)
- `packages/gateway/src/route-handlers.ts` (index signature, exactOptional)

**Impact**: Development workflow unaffected (dev mode uses `tsx`), tests pass (985 tests).

**Resolution**: Requires separate FIX task to address source code type issues.

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
| SQL Migrations | ✅ COMPLETE | 8 migrations (001-008) with rollback support |
| Tests | ✅ PASS | 15 tests, testcontainers (PG17+pgvector) |
| Docker Compose Integration | ✅ VERIFIED | All 8 migrations ready for deployment |

### Migrations Available

| Version | Name | Status | Notes |
|---------|------|--------|-------|
| 001 | extensions | ✅ READY | pgvector extension |
| 002 | episodic_memory | ✅ READY | sessions + messages tables (with created_at, token_count) |
| 003 | semantic_memory | ✅ READY | memories table |
| 004 | conceptual_memory | ✅ READY | entities + relations tables |
| 005 | meta_memory | ✅ READY | memory_access_patterns + hot_memories view |
| 006 | interaction_logs | ✅ READY | interaction_logs table |
| 007 | fix_sessions_schema | ✅ READY | last_activity_at column + channel_history JSONB→TEXT[] (conditional) |
| 008 | session_summaries | ✅ READY | session_summaries table |

### Schema Coverage

- ✅ pgvector extension 0.8.1 enabled
- ✅ Tables: sessions, messages, memories, entities, relations, memory_access_patterns, interaction_logs, session_summaries
- ✅ Materialized view: hot_memories
- ✅ All indexes created (except memories vector index — see ERR-069)
- ✅ messages table columns: created_at, token_count (002)
- ✅ sessions table: last_activity_at, channel_history TEXT[] (007)

### Usage

**IMPORTANT**: Never use hardcoded credentials. Always use environment variables.

```bash
# Option 1: Using DATABASE_URL (recommended)
export DATABASE_URL="postgresql://user:password@host:port/database"
node tools/migrate/dist/cli.js up

# Option 2: Using individual PG environment variables
export PGHOST="localhost"
export PGPORT="5432"
export PGDATABASE="axel"
export PGUSER="axel"
export PGPASSWORD="your_secure_password"
node tools/migrate/dist/cli.js up

# Rollback specific migration
node tools/migrate/dist/cli.js down 6

# Show migration status
node tools/migrate/dist/cli.js status
```

**Development Environment** (Docker Compose):
```bash
# Load credentials from .env file (not committed to git)
export $(grep -v '^#' .env | xargs)
node tools/migrate/dist/cli.js up
```

## Documentation

| Document | Status | Notes |
|----------|--------|-------|
| `operation.md` | ✅ CREATED | User-friendly operations manual (C87) — installation, configuration, execution, debugging, operations |

## Known Issues

| ID | Severity | Description | Status |
|----|----------|-------------|--------|
| cycle.sh untracked files WARNING | INFO | patches/ directory not in devops owned paths | Diagnosed (C87, DIAG-UNTRACK-001) — requires cycle.sh:93 update |

## Known Issues (Resolved)

| Issue | Cycle | Resolution |
|-------|-------|-----------|
| ERR-069 CRITICAL: pgvector 2000d dimension limit | C68 | **RESOLVED (C68, FIX-DIMENSION-001)**: Mark(Human) approved 1536d Matryoshka truncation. 16 files updated (source, tests, ADRs, plan docs, SQL migration). HNSW index activated. 835 tests pass. Commits: `6120a90` + `228a146`. |
| ERR-086 HIGH: punycode DEP0040 + telegram test failures | C84 | **RESOLVED (C84, FIX-PUNYCODE-001+002)**: FIX-PUNYCODE-001의 packageExtensions + postinstall script가 정상 작동. whatwg-url@5.0.0 require('../punycode') 해결됨. **Result: 975 tests pass (0 FAIL), telegram 25 tests pass.** FIX-PUNYCODE-002는 재검증 결과 불필요 판정. |
| ERR-065 MEDIUM: zod resolve failure — 16 MCP tests skipped (QA-016 HIGH) | C46 | **RESOLVED (C47, FIX-INFRA-001)**: Root cause: zod symlink missing in packages/infra/node_modules. Fix: (1) pnpm install regenerated zod symlink, (2) Added @testcontainers/postgresql@^11.11.0 devDep (PostgreSqlContainer moved to separate package in testcontainers v11+), (3) Updated tests/setup.ts import. **Result: 475 tests, 41 files, 0 skips.** CONSTITUTION §10 compliance restored. |
| AUD-083 HIGH: Hardcoded DB credentials in migrate CLI (AUDIT-005) | C61 | **RESOLVED (C61, FIX-AUDIT-E-003)**: Removed hardcoded fallback credentials ('axel_dev_password') from tools/migrate/src/cli.ts. Added validateEnvironment() to enforce explicit env vars (DATABASE_URL or PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD). Updated DEPLOY.md with secure usage examples. **Result: 5 new tests, 806 tests pass.** Security compliance verified. |

## Release History

| Version | Date | Notes |
|---------|------|-------|
| — | — | — |
