# QC Worker: Runtime Execution
## Cycle: 20260209_1734

### Pre-flight
- .env: EXISTS
- Connection variables found: `AXEL_DB_URL`, `AXEL_REDIS_URL` (note: non-standard naming — migrate tool expects `DATABASE_URL` or `PG*` vars)
- Docker compose file: EXISTS (`docker/docker-compose.dev.yml`)
- Package scripts: `build`, `test`, `lint`, `format` (vitest-based)

### Infrastructure
| Service | Can Connect? | Details |
|---------|-------------|---------|
| Docker | YES | Both containers healthy, uptime 17h |
| PostgreSQL | YES | PG 17.7, accepting connections, query OK |
| pgvector | YES | Extension `vector` installed and available |
| Redis | YES | PONG response confirmed |

### Service Startup
| Step | Status | Details |
|------|--------|---------|
| migrations | FAIL | `DATABASE_URL or PG* vars must be set` — .env uses `AXEL_DB_URL` instead |
| app start | FAIL | `ERR_UNKNOWN_FILE_EXTENSION ".ts"` — compiled dist imports .ts source |
| health check | SKIP | Port 3000 occupied by `open-webui` (pid 1227), not Axel |
| channels test | PASS | 107/107 tests passed across 7 test files (538ms) |

### Findings
- [FINDING-R1] severity: P2. **Migration env var mismatch.** `tools/migrate` expects `DATABASE_URL` or `PG*` environment variables, but `.env` provides `AXEL_DB_URL`. Migration cannot run without manual env var translation.
- [FINDING-R2] severity: P1. **App startup crash — .ts import in compiled output.** Running `node apps/axel/dist/main.js` fails with `ERR_UNKNOWN_FILE_EXTENSION ".ts"` because the compiled JS references `packages/gateway/src/index.ts` (a TypeScript source path). This indicates a build output issue where `dist/main.js` contains unresolved `.ts` imports.

### Self-Verification Notes

**Step 6 (migrations FAIL):**
- Self-check: (1) Build cascade? No — `tools/migrate/dist/` exists and the JS executes successfully until it checks env vars. (2) Correct credentials? N/A — tool never gets to connection phase. (3) Correct container name? N/A. (4) Infra vs code? Configuration mismatch — the migrate tool expects standard PG env vars but the project uses `AXEL_*` prefixed vars. (5) Correct command? Yes — `node tools/migrate/dist/cli.js up` per the tool's own CLI.
- Verdict: **REAL ISSUE** — env var naming convention mismatch between migrate tool and project .env configuration.

**Step 7 (app start FAIL):**
- Self-check: (1) Build cascade? Partial — `dist/` exists so build did produce output, but the output contains incorrect `.ts` references. This is a build *quality* issue, not a missing build. (2) Correct credentials? N/A — crashes before any connection. (3) Correct container name? N/A. (4) Infra vs code? Code/build issue — the compiled output references TypeScript source paths. (5) Correct command? Yes — `node apps/axel/dist/main.js`.
- Verdict: **REAL ISSUE** — compiled output has broken import paths referencing `.ts` source files.

**Step 8 (health check SKIP):**
- Port 3000 is occupied by `open-webui` (pid 1227). The `{"status":true}` response came from open-webui, NOT Axel. Since Axel never started, health check is N/A.
- Verdict: **DISCARDED** — not an Axel issue. Noted as context only.

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
Exit code: 1
```
