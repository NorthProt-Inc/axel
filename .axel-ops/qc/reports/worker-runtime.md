# QC Worker: Runtime Execution
## Cycle: 20260208_1921

### Pre-flight
- .env: EXISTS
- Connection variables found: AXEL_DB_URL, AXEL_REDIS_URL (note: prefixed with `AXEL_`, not standard `DATABASE_URL`/`PG*`)
- Docker compose file: EXISTS

### Infrastructure
| Service | Can Connect? | Details |
|---------|-------------|---------|
| Docker | YES | Both containers Up 9 hours (healthy) |
| PostgreSQL | YES | pg_isready: accepting connections. PostgreSQL 17.7 (pgvector/pgvector:pg17) |
| pgvector | YES | Extension `vector` installed and active |
| Redis | YES | redis-cli PONG. Redis 7 (alpine) |

### Service Startup
| Step | Status | Details |
|------|--------|---------|
| migrations | FAIL | migrate CLI requires `DATABASE_URL` or `PG*` env vars; project uses `AXEL_DB_URL` instead |
| app start | FAIL | ERR_UNKNOWN_FILE_EXTENSION: dist/main.js tries to import `.ts` file from packages/gateway/src/index.ts |
| health check | SKIP | Port 3000 is occupied by `open-webui` (pid 2382630), not Axel. Health response `{"status":true}` is from open-webui. |
| channels test | PASS | 80/80 tests passed across 5 test files (537ms) |

### Findings
- [FINDING-R1] severity: P2. Migration CLI env var mismatch — `tools/migrate/dist/cli.js` expects `DATABASE_URL` or `PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD`, but `.env` defines `AXEL_DB_URL`. Migrations cannot run without manual env var mapping.
- [FINDING-R2] severity: P1. App startup crash — `apps/axel/dist/main.js` fails with `ERR_UNKNOWN_FILE_EXTENSION ".ts"` when attempting to import `packages/gateway/src/index.ts`. The compiled output references source `.ts` files instead of compiled `.js` files, causing Node.js to refuse loading.

### Self-Verification Notes

- Step 6 (migrations): FAIL. Self-check: (1) Build cascade? No — `tools/migrate/dist/cli.js` exists and executes, fails on env vars (2) Correct credentials? The tool never got to auth — env var names don't match (3) Correct container name? N/A (4) Infra vs code? Code configuration issue — migrate CLI hardcodes `DATABASE_URL`/`PG*` but project convention uses `AXEL_DB_URL` (5) Correct command? Yes — `node tools/migrate/dist/cli.js up` per instructions
  - Verdict: **REAL ISSUE** — env var naming mismatch between migrate tool and project convention

- Step 7 (app start): FAIL. Self-check: (1) Build cascade? Partially — `dist/main.js` exists and runs, but it tries to import an uncompiled `.ts` file from a dependency package. This is a build output issue where path mappings resolve to source instead of dist. (2) Correct credentials? N/A — crash before any connection attempt (3) Correct container name? N/A (4) Infra vs code? Code issue — compiled JS references `.ts` source (5) Correct command? Yes — `node apps/axel/dist/main.js` per instructions
  - Verdict: **REAL ISSUE** — compiled output has incorrect import paths pointing to `.ts` source files

- Step 8 (health check): SKIP. Port 3000 occupied by open-webui, not Axel. Cannot meaningfully test Axel health endpoint.

### Output (failed steps only)

**Step 6 — Migration:**
```
Migration error: Error: DATABASE_URL or individual PG* environment variables (PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD) must be set
    at validateEnvironment (file:///home/northprot/projects/axel/tools/migrate/dist/cli.js:18:15)
    at main (file:///home/northprot/projects/axel/tools/migrate/dist/cli.js:25:5)
    at file:///home/northprot/projects/axel/tools/migrate/dist/cli.js:90:5
```

**Step 7 — App Start:**
```
TypeError [ERR_UNKNOWN_FILE_EXTENSION]: Unknown file extension ".ts" for /home/northprot/projects/axel/packages/gateway/src/index.ts
    at Object.getFileProtocolModuleFormat [as file:] (node:internal/modules/esm/get_format:219:9)
    at defaultGetFormat (node:internal/modules/esm/get_format:245:36)
    at defaultLoad (node:internal/modules/esm/load:120:22)
    at async ModuleLoader.loadAndTranslate (node:internal/modules/esm/loader:483:32)
```
