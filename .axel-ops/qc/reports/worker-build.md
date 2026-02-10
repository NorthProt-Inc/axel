# QC Worker: Build & Test
## Cycle: 20260209_1734

### Pre-flight
- package.json scripts found: `build`, `build:clean`, `typecheck`, `test`, `test:watch`, `test:coverage`, `lint`, `lint:fix`, `format`, `format:check`

### Results
| Step | Command | Status | Exit Code |
|------|---------|--------|-----------|
| 1 | pnpm install --frozen-lockfile | PASS | 0 |
| 2 | pnpm build | PASS | 0 |
| 3 | pnpm typecheck | PASS | 0 |
| 4 | pnpm lint | FAIL | 1 |
| 5 | pnpm test | PASS | 0 |
| 6 | node apps/axel/dist/main.js | FAIL | 1 |
| 7 | node tools/migrate/dist/cli.js --help | FAIL | 1 |

### Findings

- **[FINDING-B1]** severity: **P2**. `pnpm lint` exits with code 1. Biome reports 24 errors and 167 warnings across 336 checked files. Errors include cognitive complexity violations (e.g., `tools/data-quality/src/cli.ts:143` with score 32 vs max 15) and other lint rule violations. Total diagnostics exceed Biome's display limit (195 diagnostics not shown).

- **[FINDING-B2]** severity: **P1**. `node apps/axel/dist/main.js` crashes immediately with `ERR_UNKNOWN_FILE_EXTENSION: Unknown file extension ".ts"` for `packages/gateway/src/index.ts`. The compiled `dist/main.js` (ESM module) imports `@axel/gateway` which resolves to a `.ts` source file instead of compiled `.js` output. This indicates a package exports/path mapping issue — the gateway package's `exports` or `main` field points to source `.ts` files rather than compiled `.js` files, so the app cannot run via plain `node`.

- **[FINDING-B3]** severity: **P3**. `node tools/migrate/dist/cli.js --help` fails because it validates `DATABASE_URL` / `PG*` environment variables before parsing CLI arguments. The tool runs and loads correctly, but `--help` cannot be displayed without a database configured. This is a minor CLI ergonomics issue (argument parsing should happen before env validation), not a build or runtime bug.

### Self-Verification Notes

- **Step 4 (lint):** Self-check: (1) Command correct? Yes — `pnpm lint` runs `biome check .` exactly as defined. (2) Known behavior? No — these are real lint rule violations, not warnings from tooling. (3) Cascade? No — independent of other steps. (4) Senior dev agrees? Yes — 24 errors is a real lint issue, though severity is P2 since it doesn't block build or tests.
  - **Verdict: REAL ISSUE** — P2, lint errors present but not blocking compilation or test execution.

- **Step 6 (main app):** Self-check: (1) Command correct? Yes — `node apps/axel/dist/main.js` is the standard way to run a compiled Node.js app. (2) Known behavior? No — `ERR_UNKNOWN_FILE_EXTENSION` for `.ts` files means the package resolution points to uncompiled source. (3) Cascade? No — build succeeded (Step 2 passed, `dist/main.js` exists and is valid JS). The issue is in how `@axel/gateway`'s package.json exports are configured. (4) Senior dev agrees? Yes — the app literally cannot start; this is a real runtime issue.
  - **Verdict: REAL ISSUE** — P1, the compiled application cannot be executed with `node` due to incorrect package exports resolution.

- **Step 7 (migrate --help):** Self-check: (1) Command correct? Yes — `--help` is a standard CLI flag. (2) Known behavior? Partially — many CLI tools require env setup before parsing args, though best practice is the opposite. (3) Cascade? No. (4) Senior dev agrees? A senior dev might say "just set DATABASE_URL" — this is more of a design preference than a bug.
  - **Verdict: REAL ISSUE (minor)** — P3, CLI ergonomics issue. The tool loads and runs correctly; it just validates env before parsing `--help`.

### Output (failed commands only)

**Step 4 — pnpm lint:**
```
The number of diagnostics exceeds the number allowed by Biome.
Diagnostics not shown: 195.
Checked 336 files in 91ms. No fixes applied.
Found 24 errors.
Found 167 warnings.
check ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  × Some errors were emitted while running checks.
```

**Step 6 — node apps/axel/dist/main.js:**
```
TypeError [ERR_UNKNOWN_FILE_EXTENSION]: Unknown file extension ".ts"
  for /home/northprot/projects/axel/packages/gateway/src/index.ts
    at Object.getFileProtocolModuleFormat [as file:]
      (node:internal/modules/esm/get_format:219:9)
    ...
  code: 'ERR_UNKNOWN_FILE_EXTENSION'
```

**Step 7 — node tools/migrate/dist/cli.js --help:**
```
Migration error: Error: DATABASE_URL or individual PG* environment
  variables (PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD) must be set
    at validateEnvironment (file:///...tools/migrate/dist/cli.js:18:15)
    at main (file:///...tools/migrate/dist/cli.js:25:5)
```

### Summary
- **Install, Build, Typecheck, Tests**: All green. 127 test files passed (1706 tests), 1 skipped (integration). Build completes cleanly.
- **Lint**: 24 errors + 167 warnings. Needs attention but doesn't block development.
- **App Runtime**: Cannot start via `node` due to gateway package exporting `.ts` source files instead of compiled `.js`. This is the most significant finding.
- **Migration Tool**: Works but needs CLI arg parsing before env validation for `--help` to work without DB config.
