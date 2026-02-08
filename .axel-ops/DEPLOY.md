# DEPLOY

> Maintained by DevOps Division. Tracks infrastructure and deployment state.

## Environment Status

| Component | Status | Version | Notes |
|-----------|--------|---------|-------|
| Node.js | ✅ READY | 22.13.1 | Runtime — ready for Phase B |
| pnpm | ✅ READY | 9.15.4 (via npx) | Package manager — functional |
| PostgreSQL | ⏳ PENDING | 17 | + pgvector extension |
| Redis | ⏳ PENDING | 7 | Ephemeral cache |
| Docker Compose | ⏳ PENDING | — | Dev environment |
| GitHub Actions | ⏳ PENDING | — | CI/CD |

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
| `packages/channels/package.json` | ✅ CREATED | + tsconfig.json, vitest.config.ts |
| `packages/gateway/package.json` | ✅ CREATED | + tsconfig.json, vitest.config.ts |
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
| `@axel/channels` | — | 75% | ⏳ PENDING |
| `@axel/gateway` | — | 80% | ⏳ PENDING |

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

## Subpath Exports (@axel/core)

| Export | Path | Status |
|--------|------|--------|
| `@axel/core/types` | `./src/types/index.ts` | ✅ CONFIGURED (C44) |
| `@axel/core/memory` | `./src/memory/index.ts` | ✅ CONFIGURED (C44) |
| `@axel/core/decay` | `./src/decay/index.ts` | ✅ CONFIGURED (C44) |
| `@axel/core/context` | `./src/context/index.ts` | ✅ CONFIGURED (C44) |
| `@axel/core/persona` | `./src/persona/index.ts` | ✅ CONFIGURED (C44) |
| `@axel/core/orchestrator` | `./src/orchestrator/index.ts` | ✅ CONFIGURED (C44) |

**Enables clean cross-package imports per CONSTITUTION §9.** Verified: 475 tests pass, typecheck+lint clean.

## Known Issues (Resolved)

| Issue | Cycle | Resolution |
|-------|-------|-----------|
| ERR-065 MEDIUM: zod resolve failure — 16 MCP tests skipped (QA-016 HIGH) | C46 | **RESOLVED (C47, FIX-INFRA-001)**: Root cause: zod symlink missing in packages/infra/node_modules. Fix: (1) pnpm install regenerated zod symlink, (2) Added @testcontainers/postgresql@^11.11.0 devDep (PostgreSqlContainer moved to separate package in testcontainers v11+), (3) Updated tests/setup.ts import. **Result: 475 tests, 41 files, 0 skips.** CONSTITUTION §10 compliance restored. |

## Release History

| Version | Date | Notes |
|---------|------|-------|
| — | — | — |
