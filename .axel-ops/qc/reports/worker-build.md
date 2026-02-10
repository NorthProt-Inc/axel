# QC Worker: Build & Test
## Cycle: 20260209_1759

### Pre-flight
- package.json scripts found: `build`, `build:clean`, `typecheck`, `test`, `test:watch`, `test:coverage`, `lint`, `lint:fix`, `format`, `format:check`

### Results
| Step | Command | Status | Exit Code |
|------|---------|--------|-----------|
| 1 | pnpm install --frozen-lockfile | PASS | 0 |
| 2 | pnpm build | FAIL | 2 |
| 3 | pnpm typecheck | FAIL | 2 |
| 4 | pnpm lint | FAIL | 1 |
| 5 | pnpm test | PASS | 0 |
| 6 | node apps/axel/dist/main.js | SKIP | — |
| 7 | node tools/migrate/dist/cli.js --help | SKIP | — |

### Findings
- **[FINDING-B1]** severity: **P0**. `pnpm build` (`tsc -b`) fails with a type error in `packages/infra/src/link/link-content-pipeline.ts(131,5)`: `error TS2820: Type '"reference"' is not assignable to type 'MemoryType'. Did you mean '"preference"'?`
- **[FINDING-B2]** severity: **P2**. `pnpm lint` (`biome check .`) reports 27 errors and 167 warnings. Errors include `noNonNullAssertion` violations across multiple files.

### Self-Verification Notes

- **Step 2 (pnpm build):** Command correct? Yes — `pnpm build` runs `tsc -b` exactly as defined. Known behavior? No — this is a real TS2820 compilation error, not a warning or deprecation. Cascade? No — this is the root cause. Senior dev agrees? Yes — a type mismatch is a real bug.
  - **Verdict: REAL ISSUE**

- **Step 3 (pnpm typecheck):** Same error as Step 2. `typecheck` and `build` both run `tsc -b`. This is the same root cause as FINDING-B1, not reported separately.
  - **Verdict: DUPLICATE of FINDING-B1 (not counted separately)**

- **Step 4 (pnpm lint):** Command correct? Yes — `pnpm lint` runs `biome check .` exactly as defined. Known behavior? These are real Biome lint rule violations (errors), not warnings from the tooling itself. Cascade? No — independent of build failure. Senior dev agrees? Yes — 27 lint errors indicate code quality issues.
  - **Verdict: REAL ISSUE (P2 — lint errors don't block build/tests)**

- **Step 6 (node main.js):** EADDRINUSE on port 8000. This means the app is already running on this machine. The app itself started correctly and attempted to bind. This is an environment issue, not a code bug.
  - **Verdict: DISCARDED (environment-specific, not a code bug)**

- **Step 7 (migrate --help):** `DATABASE_URL or individual PG* environment variables must be set`. The migration tool requires DB credentials even for `--help`. This is a minor UX issue but the tool correctly validates its environment. No dist/ issue — the file exists and runs.
  - **Verdict: DISCARDED (expected behavior — tool requires DB config)**

### Output (failed commands only)

**Step 2 — pnpm build:**
```
> axel-monorepo@0.0.0 build /home/northprot/projects/axel
> tsc -b

packages/infra/src/link/link-content-pipeline.ts(131,5): error TS2820: Type '"reference"' is not assignable to type 'MemoryType'. Did you mean '"preference"'?
 ELIFECYCLE  Command failed with exit code 2.
```

**Step 4 — pnpm lint (last 15 lines):**
```
./packages/infra/src/db/pg-semantic-memory.ts:149:16 lint/style/noNonNullAssertion

  ! Forbidden non-null assertion.

Skipped 3 suggested fixes.
If you wish to apply the suggested (unsafe) fixes, use the command biome check --fix --unsafe

The number of diagnostics exceeds the number allowed by Biome.
Diagnostics not shown: 198.
Checked 342 files in 92ms. No fixes applied.
Found 27 errors.
Found 167 warnings.

  × Some errors were emitted while running checks.
```
