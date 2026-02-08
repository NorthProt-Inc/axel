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
| `@axel/infra` | — | 80% | ⏳ PENDING |
| `@axel/channels` | — | 75% | ⏳ PENDING |
| `@axel/gateway` | — | 80% | ⏳ PENDING |

## Release History

| Version | Date | Notes |
|---------|------|-------|
| — | — | — |
