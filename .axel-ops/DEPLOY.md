# DEPLOY

> Maintained by DevOps Division. Tracks infrastructure and deployment state.

## Environment Status

| Component | Status | Version | Notes |
|-----------|--------|---------|-------|
| Node.js | ⚠️ MISMATCH | 18.19.1 (need 22 LTS) | Runtime — upgrade required |
| pnpm | ❌ MISSING | — (need 9.x) | Package manager — install required |
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
| `packages/core/package.json` | ✅ CREATED | + tsconfig.json, vitest.config.ts |
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
| CI | push, PR | lint → typecheck → test | NOT_CREATED |

## Release History

| Version | Date | Notes |
|---------|------|-------|
| — | — | — |
