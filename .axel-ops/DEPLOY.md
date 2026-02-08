# DEPLOY

> Maintained by DevOps Division. Tracks infrastructure and deployment state.

## Environment Status

| Component | Status | Version | Notes |
|-----------|--------|---------|-------|
| Node.js | Required | 22 LTS | Runtime |
| pnpm | Required | 9.x | Package manager |
| PostgreSQL | Required | 17 | + pgvector extension |
| Redis | Required | 7 | Ephemeral cache |
| Docker Compose | Required | — | Dev environment |
| GitHub Actions | Required | — | CI/CD |

## Monorepo Scaffolding

| File | Status | Notes |
|------|--------|-------|
| `pnpm-workspace.yaml` | NOT_CREATED | |
| `tsconfig.base.json` | NOT_CREATED | |
| `biome.json` | NOT_CREATED | |
| `package.json` (root) | NOT_CREATED | |
| `vitest.config.ts` (root) | NOT_CREATED | |
| `packages/core/package.json` | NOT_CREATED | |
| `packages/infra/package.json` | NOT_CREATED | |
| `packages/channels/package.json` | NOT_CREATED | |
| `packages/gateway/package.json` | NOT_CREATED | |
| `apps/axel/package.json` | NOT_CREATED | |

## Docker Compose (Dev)

| Service | Image | Port | Status |
|---------|-------|------|--------|
| PostgreSQL 17 | `pgvector/pgvector:pg17` | 5432 | NOT_CONFIGURED |
| Redis 7 | `redis:7-alpine` | 6379 | NOT_CONFIGURED |

## CI/CD Pipeline

| Workflow | Trigger | Steps | Status |
|----------|---------|-------|--------|
| CI | push, PR | lint → typecheck → test | NOT_CREATED |

## Release History

| Version | Date | Notes |
|---------|------|-------|
| — | — | — |
