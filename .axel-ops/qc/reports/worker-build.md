# QC Worker: Build & Test
## Cycle: 20260208_1921

### Pre-flight
- package.json scripts found: `build`, `build:clean`, `typecheck`, `test`, `test:watch`, `test:coverage`, `lint`, `lint:fix`, `format`, `format:check`

### Results
| Step | Command | Status | Exit Code |
|------|---------|--------|-----------|
| 1 | pnpm install --frozen-lockfile | PASS | 0 |
| 2 | pnpm build | FAIL | 2 |
| 3 | pnpm typecheck | FAIL | 1 |
| 4 | pnpm lint | FAIL | 1 |
| 5 | pnpm test | PASS | 0 |
| 6 | node apps/axel/dist/main.js | FAIL | 1 |
| 7 | node tools/migrate/dist/cli.js --help | FAIL | 1 |

### Findings

- [FINDING-B1] severity: **P0**. `pnpm build` (`tsc -b`) fails with 14 TypeScript compilation errors across 2 files:
  - `apps/axel/src/config.ts(234)`: TS4111 — index signature property `telegram` must use bracket notation
  - `apps/axel/src/container.ts(229)`: TS2345 — PgPool type mismatch (`rows: unknown[]` vs `rows: T[]`, missing generic compatibility)
  - `apps/axel/src/container.ts(244)`: TS2345 — GoogleGenAIClient type mismatch (deep generics incompatibility with `exactOptionalPropertyTypes`)
  - `tools/migrate/src/cli.ts` (lines 12-41): 11× TS4111 — `process.env` index signature properties (`DATABASE_URL`, `PGHOST`, etc.) must use bracket notation

- [FINDING-B2] severity: **P2**. `pnpm typecheck` fails: `packages/core/src/decay/types.ts(2)`: TS6133 — unused import `MemoryType`. This blocks the recursive typecheck pipeline (workspace-concurrency=1 means first failure stops all).

- [FINDING-B3] severity: **P2**. `pnpm lint` (biome check) reports 48 errors and 136 warnings across the codebase.

- [FINDING-B4] severity: **P2**. `tools/migrate/dist/cli.js --help` does not support `--help` flag — it always attempts DB connection and fails without env vars. Not a crash bug, but a UX issue.

### Self-Verification Notes

- **Step 2 (pnpm build)**: Self-check: (1) Command correct? Yes — `pnpm build` runs `tsc -b` as defined in package.json, no extra flags added. (2) Known behavior? No — these are real TS compilation errors (TS4111, TS2345). (3) Cascade? No — these are root cause errors in source code. (4) Senior dev agrees? Yes — strict TS config (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) is correctly catching real type issues.
  - Verdict: **REAL ISSUE**

- **Step 3 (pnpm typecheck)**: Self-check: (1) Command correct? Yes — `pnpm typecheck` as defined. (2) Known behavior? No — unused import is a real code issue. (3) Cascade? No — different package (`packages/core`) from build errors. (4) Senior dev agrees? Yes — unused import with strict TS config.
  - Verdict: **REAL ISSUE**

- **Step 4 (pnpm lint)**: Self-check: (1) Command correct? Yes — `pnpm lint` runs `biome check .` as defined. (2) Known behavior? No — 48 errors are real lint violations. (3) Cascade? No — lint is independent of build. (4) Senior dev agrees? Yes.
  - Verdict: **REAL ISSUE**

- **Step 5 (pnpm test)**: All 1075 tests passed, 36 skipped (integration tests requiring PG/Redis). No issues.

- **Step 6 (node main.js)**: Self-check: (1) Command correct? Yes. (2) Known behavior? No. (3) **Cascade? YES** — build failed in Step 2, so `dist/` contains stale output. The `ERR_UNKNOWN_FILE_EXTENSION .ts` error means `dist/main.js` imports a `.ts` source file from a package that failed to compile properly. This is a direct consequence of FINDING-B1.
  - Verdict: **DISCARDED** — cascade of FINDING-B1

- **Step 7 (migrate --help)**: Self-check: (1) Command correct? Yes. (2) Known behavior? CLI tools that require env vars before parsing args is a design choice, not a crash bug. (3) Cascade? No — the migrate dist exists from a previous successful build. (4) Senior dev agrees? Debatable — it's a minor UX issue, not a bug per se.
  - Verdict: **REAL ISSUE (P2)** — downgraded from P1 to P2 as it's a UX concern, not a code crash

### Output (failed commands only)

**Step 2 — pnpm build (last 15 lines of errors):**
```
apps/axel/src/config.ts(234,23): error TS4111: Property 'telegram' comes from an index signature, so it must be accessed with ['telegram'].
apps/axel/src/container.ts(229,59): error TS2345: Argument of type '{ query(...): ... }' is not assignable to parameter of type 'PgPool'.
apps/axel/src/container.ts(244,47): error TS2345: Argument of type '{ getGenerativeModel(...): ... }' is not assignable to parameter of type 'GoogleGenAIClient'.
tools/migrate/src/cli.ts(12,50): error TS4111: Property 'DATABASE_URL' comes from an index signature, so it must be accessed with ['DATABASE_URL'].
tools/migrate/src/cli.ts(14-18): 5× error TS4111: PG* env vars must use bracket notation.
tools/migrate/src/cli.ts(34-41): 5× error TS4111: PG* env vars must use bracket notation (second occurrence block).
 ELIFECYCLE  Command failed with exit code 2.
```

**Step 3 — pnpm typecheck:**
```
src/decay/types.ts(2,1): error TS6133: 'MemoryType' is declared but its value is never read.
 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  @axel/core@0.0.0 typecheck: `tsc --noEmit`
Exit status 1
```

**Step 4 — pnpm lint:**
```
Found 48 errors.
Found 136 warnings.
check × Some errors were emitted while running checks.
 ELIFECYCLE  Command failed with exit code 1.
```

**Step 6 — node main.js (cascade, discarded):**
```
TypeError [ERR_UNKNOWN_FILE_EXTENSION]: Unknown file extension ".ts" for packages/gateway/src/index.ts
```

**Step 7 — migrate --help:**
```
Migration error: Error: DATABASE_URL or individual PG* environment variables must be set
```
