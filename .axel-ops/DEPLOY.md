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
| `packages/core/package.json` | ✅ CREATED | + tsconfig.json, vitest.config.ts, @vitest/coverage-v8 |
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

## Release History

| Version | Date | Notes |
|---------|------|-------|
| — | — | — |
