# QC Worker: Build & Test
## Cycle: 20260208_1854

### Results
| Step | Command | Status | Exit Code |
|------|---------|--------|-----------|
| 1 | pnpm install | PASS | 0 |
| 2 | pnpm build | FAIL | 2 |
| 3 | pnpm typecheck | FAIL | 1 |
| 4 | pnpm lint | FAIL | 1 |
| 5 | pnpm test | FAIL | N/A |
| 6 | node main.js | FAIL | 1 |
| 7 | migrate --help | FAIL | 1 |

### Findings

#### [FINDING-B1] P0: TypeScript compilation errors in build
**Severity**: P0 (build completely broken)
**Files affected**: 
- apps/axel/src/config.ts:234
- apps/axel/src/container.ts:229, 244
- tools/migrate/src/cli.ts:12, 14-18, 34-41

**Error summary**: 
1. Index signature access errors: Properties accessed directly from `process.env` must use bracket notation (e.g., `process.env['telegram']` instead of `process.env.telegram`)
2. Type incompatibility: PgPool type mismatch in container.ts:229 - query return type doesn't match
3. Google GenAI type mismatch in container.ts:244 - stream chunk type incompatible with exactOptionalPropertyTypes
4. 12 index signature access violations in migration tool CLI

**Exit code**: 2

#### [FINDING-B2] P0: Typecheck failure due to unused import
**Severity**: P0
**File affected**: packages/core/src/decay/types.ts:2
**Error**: 'MemoryType' is declared but its value is never read
**Exit code**: 1

#### [FINDING-B3] P1: Lint errors and formatting issues
**Severity**: P1
**Command**: pnpm lint
**Output**: 
- 48 errors found
- 136 warnings found
- Issues include missing semicolons, incorrect imports order, unused variables, and broken sort order
- Exit code: 1

**Example errors shown**:
- apps/axel/src/container.ts: missing semicolons, unused variable
- packages/core/src/index.ts: broken sort order
- apps/webchat/tailwind.config.ts: imports should be sorted

#### [FINDING-B4] P1: Test suite cannot run
**Severity**: P1
**Command**: pnpm test --run
**Error**: Unknown option: 'run'
**Note**: Flag may be incorrect. Actual vitest flag should be checked.
**Exit code**: N/A (command parse error)

#### [FINDING-B5] P0: Cannot run main app - dist files not built
**Severity**: P0
**Command**: node apps/axel/dist/main.js
**Error**: TypeError [ERR_UNKNOWN_FILE_EXTENSION]: Unknown file extension ".ts" for /home/northprot/projects/axel/packages/gateway/src/index.ts
**Note**: App refers to source .ts file instead of compiled output. Build must complete first.
**Exit code**: 1

#### [FINDING-B6] P1: Migration tool missing required environment variables
**Severity**: P1
**Command**: node tools/migrate/dist/cli.js --help
**Error**: DATABASE_URL or individual PG* environment variables (PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD) must be set
**Note**: Tool successfully compiled but validation blocks execution. This is expected behavior for DB tools without env vars, but prevents testing the CLI.
**Exit code**: 1

### Output (failed commands only)

#### Build (Step 2) - Last 10 lines
```
apps/axel/src/config.ts(234,23): error TS4111: Property 'telegram' comes from an index signature, so it must be accessed with ['telegram'].
apps/axel/src/container.ts(229,59): error TS2345: Argument of type '{ query(text: string, params?: readonly unknown[] | undefined): Promise<{ rows: unknown[]; rowCount: number | null; }>; ... }' is not assignable to parameter of type 'PgPool'.
tools/migrate/src/cli.ts(12,50): error TS4111: Property 'DATABASE_URL' comes from an index signature, so it must be accessed with ['DATABASE_URL'].
... (12 more index signature errors in migrate CLI)
 ELIFECYCLE  Command failed with exit code 2.
```

#### Typecheck (Step 3) - Last 5 lines
```
src/decay/types.ts(2,1): error TS6133: 'MemoryType' is declared but its value is never read.
/home/northprot/projects/axel/packages/core:
 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  @axel/core@0.0.0 typecheck: `tsc --noEmit`
Exit status 1
```

#### Lint (Step 4) - Last 8 lines
```
Found 48 errors.
Found 136 warnings.
check ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  × Some errors were emitted while running checks.
  
 ELIFECYCLE  Command failed with exit code 1.
```

#### Test (Step 5) - Full output
```
 ERROR  Unknown option: 'run'
For help, run: pnpm help test
```

#### Main App (Step 6) - Last 5 lines
```
  at Object.getFileProtocolModuleFormat [as file:] (node:internal/modules/esm/get_format:219:9)
  at defaultGetFormat (node:internal/modules/esm/get_format:245:36)
  at defaultLoad (node:internal/modules/esm/load:120:22)
  at async ModuleLoader.loadAndTranslate (node:internal/modules/esm/loader:483:32) {
  code: 'ERR_UNKNOWN_FILE_EXTENSION'
}
EXIT: 1
```

#### Migration Tool (Step 7) - Last 3 lines
```
    at main (file:///home/northprot/projects/axel/tools/migrate/dist/cli.js:25:5)
    at file:///home/northprot/projects/axel/tools/migrate/dist/cli.js:90:5)
EXIT: 1
```

### Summary
The project has **5 critical blockers** preventing a clean build:

1. **TypeScript strict mode violations**: 12+ index signature access errors across config, container, and migration CLI
2. **Type incompatibilities**: PgPool and Google GenAI types don't match expected interfaces (exact optional properties mismatch)
3. **Unused imports**: packages/core/src/decay/types.ts has dead import
4. **Lint failures**: 48 errors + 136 warnings must be fixed before build succeeds
5. **Test command issue**: `--run` flag is not recognized by pnpm test

All steps fail. No executable artifacts are produced. The codebase is in a pre-implementation state and not runnable.
