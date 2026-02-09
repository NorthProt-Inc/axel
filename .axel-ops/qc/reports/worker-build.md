# QC Worker: Build & Test
## Cycle: 20260208_1907

### Results
| Step | Command | Status | Exit Code |
|------|---------|--------|-----------|
| 1 | pnpm install | PASS | 0 |
| 2 | pnpm build | FAIL | 2 |
| 3 | pnpm typecheck | FAIL | 1 |
| 4 | pnpm lint | FAIL | 1 |
| 5 | pnpm test | FAIL | 1 |
| 6 | node main.js | FAIL | 1 |
| 7 | migrate --help | FAIL | 1 |

### Findings

#### [BUILD-ERR-001] — P0: Build step fails with TypeScript errors
**Scope**: apps/axel, tools/migrate
**Issue**: TypeScript strict mode errors in config.ts and container.ts prevent build
- `config.ts:234` — index signature access: `telegram` must use bracket notation
- `container.ts:229` — PgPool type mismatch: query() returns `unknown[]` instead of generic `T[]`
- `container.ts:244` — GoogleGenAIClient type mismatch: stream chunk types incompatible

**Impact**: Build fails at compile step. No dist/ artifacts generated for main app or migration tool.

#### [TYPECHECK-ERR-002] — P1: Unused import in packages/core
**Scope**: packages/core/src/decay/types.ts
**Issue**: `MemoryType` declared but never used
```
src/decay/types.ts(2,1): error TS6133: 'MemoryType' is declared but its value is never read.
```
**Impact**: Blocks typecheck phase

#### [LINT-ERR-003] — P1: Biome lint failures with 48 errors, 136 warnings
**Scope**: 239 files checked
**Issue**: Biome found 48 errors and 136 warnings
- Suggestion fixes suggest test format changes (e.g., chaining expect calls)
- Total diagnostics exceed display threshold

**Impact**: Lint check fails. Some issues marked as "unsafe" fixes

#### [RUNTIME-ERR-004] — P1: Main app fails with TypeScript file extension error
**Scope**: apps/axel/dist/main.js → packages/gateway/src/index.ts
**Issue**: Node.js cannot load `.ts` file from built dist/ code
```
TypeError [ERR_UNKNOWN_FILE_EXTENSION]: Unknown file extension ".ts" for /home/northprot/projects/axel/packages/gateway/src/index.ts
  at Object.getFileProtocolModuleFormat [as file:] (node:internal/modules/esm/get_format:219:9)
```
**Impact**: Main app crashes immediately. Build artifacts incomplete or misconfigured.

#### [MIGRATE-ERR-005] — P1: Migration tool requires DATABASE_URL or PG* env vars
**Scope**: tools/migrate/dist/cli.js
**Issue**: Even though build succeeded, migration fails due to missing environment variables
```
Migration error: Error: DATABASE_URL or individual PG* environment variables (PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD) must be set
```
**Impact**: Migration tool cannot run without database configuration. Expected behavior but blocks full end-to-end test.

#### [TEST-ERR-006] — P1: pnpm test command unrecognized
**Scope**: package.json test script
**Issue**: Command `pnpm test --run` failed with:
```
ERROR  Unknown option: 'run'
For help, run: pnpm help test
```
**Impact**: Test suite cannot be invoked. Correct flag likely `--`, not `--run`.

### Output (failed commands)

**BUILD ERRORS (pnpm build)**
```
apps/axel/src/config.ts(234,23): error TS4111: Property 'telegram' comes from an index signature, so it must be accessed with ['telegram'].
apps/axel/src/container.ts(229,59): error TS2345: Argument of type '{ query(...): Promise<...>; }' is not assignable to parameter of type 'PgPool'.
apps/axel/src/container.ts(244,47): error TS2345: Argument of type '{ getGenerativeModel(...): ... }' is not assignable to parameter of type 'GoogleGenAIClient'.
tools/migrate/src/cli.ts(12,50): error TS4111: Property 'DATABASE_URL' comes from an index signature, so it must be accessed with ['DATABASE_URL'].
[... 6 more index signature errors in tools/migrate/src/cli.ts ...]
 ELIFECYCLE  Command failed with exit code 2.
```

**TYPECHECK ERRORS (pnpm typecheck)**
```
src/decay/types.ts(2,1): error TS6133: 'MemoryType' is declared but its value is never read.
```

**LINT ERRORS (pnpm lint)**
```
Found 48 errors.
Found 136 warnings.
  × Some errors were emitted while running checks.
 ELIFECYCLE  Command failed with exit code 1.
```

**RUNTIME ERROR (node main.js)**
```
TypeError [ERR_UNKNOWN_FILE_EXTENSION]: Unknown file extension ".ts" for /home/northprot/projects/axel/packages/gateway/src/index.ts
    at Object.getFileProtocolModuleFormat [as file:] (node:internal/modules/esm/get_format:219:9)
```

**MIGRATION TOOL ERROR (migrate --help)**
```
Migration error: Error: DATABASE_URL or individual PG* environment variables must be set
```

### Summary
Repository in **broken state**. Build phase fails due to TypeScript strict mode violations in container and config files. Even if build were fixed, runtime would fail due to TypeScript file resolution issues in ESM context. Lint and test phases cannot be reached. Database environment variables needed for full integration test.
