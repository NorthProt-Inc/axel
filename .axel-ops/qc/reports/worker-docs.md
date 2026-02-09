# QC Worker: README Walkthrough
## Cycle: 20260208_1907

### Prerequisites Verification
| Tool | Required | Installed | Version |
|------|----------|-----------|---------|
| Node.js | 22+ | YES | v22.13.1 |
| pnpm | 9+ | YES | 9.15.4 |
| Docker | ✓ | YES | 29.2.0 |
| Docker Compose | ✓ | YES | v5.0.2 |
| operation.md | — | EXISTS | — |

### README Commands Tested
| # | Documented Command | Worked? | Status |
|---|-------------------|---------|--------|
| 1 | pnpm install | YES | Already up to date (650ms) |
| 2 | docker compose -f docker/docker-compose.dev.yml up -d | YES | Both containers running |
| 3 | docker compose -f docker/docker-compose.dev.yml ps | YES | axel-postgres: Up (healthy), axel-redis: Up (healthy) |
| 4 | pnpm --filter @axel/migrate build | NO | TypeScript errors TS4111 (index signature access) |
| 5 | pnpm build | NO | Multiple TypeScript errors (see below) |
| 6 | pnpm test | PARTIAL | 1075 tests passed, 36 skipped, 0 failed |
| 7 | pnpm typecheck | NO | 1 error in @axel/core (unused import MemoryType) |
| 8 | pnpm lint | NO | 48 errors, 136 warnings |
| 9 | pnpm format:check | NO | 17 formatting errors found |
| 10 | pnpm --filter axel dev | NO | Port 8000 already in use (EADDRINUSE) |

### Referenced Files in README
| Path in README | Exists? | Notes |
|---|---|---|
| docker/docker-compose.dev.yml | ✓ YES | Valid, services running |
| docs/adr/ | ✓ YES | Directory exists with 23 ADRs |
| docs/plan/axel-project-plan.md | ✓ YES | Main architecture plan |
| docs/research/ | ✓ YES | Directory exists |
| docs/plan/migration-strategy.md | ✓ YES | Exists |
| .env.example | ✓ YES | Exists |
| tools/migrate/dist/cli.js | ✓ YES | Compiled (but source has errors) |
| apps/axel/dist/main.js | ✓ YES | Compiled (but has build issues) |

### Environment Variables Comparison
**.env.example has:**
- All AXEL_* prefixed variables documented (per operation.md section 2.2)

**.env currently has (variables missing from .env.example):**
- AXEL_ANTHROPIC_API_KEY
- AXEL_CHANNELS_CLI_ENABLED
- AXEL_DB_URL
- AXEL_GATEWAY_AUTH_TOKEN
- AXEL_GATEWAY_CORS_ORIGINS
- AXEL_GOOGLE_API_KEY
- AXEL_REDIS_URL

**Finding:** .env.example is incomplete. It's missing critical required variables documented in operation.md section 2.2.

### Documentation Gaps & Issues

#### From operation.md:
- Section 3.1: states "expected output" shows migrations completing successfully, but migrate build fails
- Section 4.1: "pnpm --filter axel dev" should work but port 8000 is already in use (previous dev server still running)

#### Critical Issues:
1. **README Step 6 (Run Migrations)** - Cannot execute because `pnpm build` fails
2. **README Step 7 (Start Dev Server)** - Cannot execute because port 8000 already in use

### Build & Code Quality Status

**FAIL: pnpm build**
```
Multiple packages fail TypeScript strict mode checks:
- packages/core: unused import MemoryType (src/decay/types.ts)
- packages/infra: Google API type mismatch (exactOptionalPropertyTypes)
- tools/migrate: TS4111 errors - environment variables accessed without bracket notation
```

**FAIL: pnpm typecheck**
```
@axel/core@0.0.0 typecheck error:
src/decay/types.ts(2,1): error TS6133: 'MemoryType' is declared but its value is never read.
Exit status 1
```

**FAIL: pnpm lint**
```
Biome check found:
- 48 errors (including formatting issues)
- 136 warnings
- Suggested fixes available with --unsafe flag
Exit status 1
```

**PARTIAL: pnpm test**
```
✓ Test Files: 89 passed | 1 skipped (90)
✓ Tests: 1075 passed | 36 skipped (1111)
✓ Duration: 5.39s
Status: All tests pass, but integration tests skipped
```

### Findings Summary

#### [FINDING-D1] severity: P0
**Issue:** README Quick Start is incomplete and leads to broken setup.
**Details:** 
- Step 6: "Run database migrations" cannot be executed because `pnpm --filter @axel/migrate build` fails with 12 TypeScript errors
- step 7: "Start development server" cannot be executed because port 8000 is already in use

**Expected:** README should document these prerequisites or include build steps to fix TypeScript errors

#### [FINDING-D2] severity: P1
**Issue:** .env.example is missing required environment variables documented in operation.md
**Details:**
- operation.md section 2.2 lists 10+ required AXEL_* variables
- .env.example is empty/minimal
- Users following README will not have proper template for `.env`

**Expected:** .env.example should contain all variables from operation.md section 2.2 with placeholder values

#### [FINDING-D3] severity: P1
**Issue:** TypeScript strict mode violations prevent `pnpm build` from succeeding
**Details:**
- tools/migrate: 12 TS4111 errors (index signature access)
- packages/infra: Google API type incompatibility (exactOptionalPropertyTypes)
- packages/core: Unused import (TS6133)

**Expected:** README should state "pnpm build" works, but codebase cannot compile

#### [FINDING-D4] severity: P2
**Issue:** Code formatting violations prevent CI from passing
**Details:**
- 17 formatting errors detected by biome check
- 48 linting errors total
- Not blocking local development but will fail CI

**Expected:** All code should pass `pnpm format:check` before README walkthrough

#### [FINDING-D5] severity: P2
**Issue:** README references incorrect environment variable names
**Details:**
- README (line 65): Uses `DATABASE_URL` 
- operation.md (line 86): Uses `AXEL_DB_URL`
- Inconsistency will confuse users following instructions

**Expected:** Consistent variable naming across all documentation

### Output (Failed Commands)

**tools/migrate build errors:**
```
src/cli.ts(12,50): error TS4111: Property 'DATABASE_URL' comes from an index signature, so it must be accessed with ['DATABASE_URL'].
src/cli.ts(14,23): error TS4111: Property 'PGHOST' comes from an index signature, so it must be accessed with ['PGHOST'].
src/cli.ts(15,23): error TS4111: Property 'PGPORT' comes from an index signature, so it must be accessed with ['PGPORT'].
src/cli.ts(16,23): error TS4111: Property 'PGDATABASE' comes from an index signature, so it must be accessed with ['PGDATABASE'].
src/cli.ts(17,23): error TS4111: Property 'PGUSER' comes from an index signature, so it must be accessed with ['PGUSER'].
src/cli.ts(18,23): error TS4111: Property 'PGPASSWORD' comes from an index signature, so it must be accessed with ['PGPASSWORD'].
(6 more similar errors)
```

**packages/core typecheck error:**
```
src/decay/types.ts(2,1): error TS6133: 'MemoryType' is declared but its value is never read.
```

**packages/infra build error:**
```
Type 'Promise<{ stream: AsyncIterable<{ readonly candidates?: ... }>' is not assignable to type 'Promise<{ stream: AsyncIterable<GoogleStreamChunk>; }>'
(Type mismatch with exactOptionalPropertyTypes enabled)
```

**pnpm lint output:**
```
Biome check: 48 errors, 136 warnings
Including: formatting issues, unused variables, type mismatches
```

---

## Recommendations

1. **CRITICAL:** Fix TypeScript errors in tools/migrate and packages/infra before next release
2. **CRITICAL:** Update .env.example with all variables from operation.md section 2.2
3. Standardize environment variable naming (DATABASE_URL vs AXEL_DB_URL) across README and operation.md
4. Run `pnpm format` and `pnpm lint:fix` to resolve code quality issues
5. Ensure `pnpm build` succeeds before README walkthrough is attempted
6. Kill any existing processes on port 8000 before testing `pnpm --filter axel dev`

