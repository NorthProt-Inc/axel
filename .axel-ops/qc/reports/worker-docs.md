# QC Worker C: README Walkthrough
## Cycle: 20260208_1854

### README Commands Tested

| # | Documented Command | Worked? | Actual Result |
|---|-------------------|---------|---------------|
| 1 | pnpm install | YES | Dependencies already up-to-date, completed in 633ms |
| 2 | docker compose -f docker/docker-compose.dev.yml up -d | SKIPPED | Docker services not started per QC rules |
| 3 | export DATABASE_URL=... && node tools/migrate/dist/cli.js up | SKIPPED | Requires Docker PostgreSQL |
| 4 | cp .env.example .env | N/A | File exists; skipped to avoid overwriting |
| 5 | pnpm --filter axel dev | SKIPPED | Development server requires full environment |
| 6 | pnpm build | **FAILED** | Multiple TypeScript compilation errors (see details below) |
| 7 | pnpm typecheck | **FAILED** | TypeScript errors in @axel/core and @axel/ui |
| 8 | pnpm test | **PASSED** | 1075 tests passed, 36 skipped, 89 test files |
| 9 | pnpm test:coverage | NOT TRIED | Depends on pnpm build working |
| 10 | pnpm lint | **FAILED** | 48 errors, 136 warnings found |
| 11 | pnpm format | NOT TRIED | Requires lint to pass first |
| 12 | pnpm format:check | **FAILED** | 17 formatting errors found |

### Referenced Files in README

| Path in README | Exists? | Note |
|---------------|---------|------|
| docker/docker-compose.dev.yml | YES | Confirmed |
| docs/adr/ | YES | 21 ADR files present |
| docs/plan/axel-project-plan.md | YES | Confirmed |
| docs/research/ | YES | 8 research files present |
| docs/plan/migration-strategy.md | YES | Confirmed |
| tools/migrate/ | YES | Confirmed |
| .axel-ops/ | YES | Confirmed |

### Documentation Gaps

**operation.md Status**: EXISTS

**Critical Issues**:

1. **README Environment Variables Mismatch**
   - README section "Environment Variables" lists:
     - `DATABASE_URL` (generic form)
     - `ANTHROPIC_API_KEY`
     - `GOOGLE_API_KEY`
   
   - `.env.example` contains:
     - `ANTHROPIC_API_KEY` ✓ matches
     - `GEMINI_API_KEY` ✗ README says `GOOGLE_API_KEY`
     - `OPENAI_API_KEY` (not mentioned in README)
     - `GITHUB_TOKEN` (not mentioned in README)
   
   - operation.md uses entirely different names:
     - `AXEL_DB_URL` (not `DATABASE_URL`)
     - `AXEL_REDIS_URL` (not mentioned in README)
     - `AXEL_ANTHROPIC_API_KEY` (not `ANTHROPIC_API_KEY`)
     - `AXEL_GOOGLE_API_KEY` (not `GOOGLE_API_KEY`)
   
   **Finding**: README and operation.md define conflicting environment variable names. Following README alone will not work; operation.md is required.

2. **README Quick Start is Incomplete**
   - README Quick Start references `node tools/migrate/dist/cli.js up` but does NOT mention:
     - Building the migration tool first (`pnpm --filter @axel/migrate build`)
     - This build step fails (TypeScript errors in tools/migrate/src/cli.ts)
   
   - README says "Edit .env with your API keys" but doesn't clarify which keys or format
   - operation.md has detailed key setup instructions (lines 94-170) not mentioned in README

3. **Build Failures Block All Setup**
   - `pnpm build` fails with 31 TypeScript errors
   - `pnpm typecheck` fails with unused variable and type mismatches
   - These prevent migration tool from being built, blocking database setup
   - README doesn't acknowledge these failures

### Findings

#### [FINDING-D1] severity: P0
**README Quick Start is Broken**

Following the README "Quick Start" section literally will fail:
1. `pnpm build` fails with TypeScript errors
2. Cannot build migration tool needed for `node tools/migrate/dist/cli.js up`
3. Environment variable names in README don't match .env.example or operation.md

**Expected**: README should either:
- Acknowledge that `pnpm build` currently fails
- OR provide explicit instructions to fix TypeScript errors before proceeding
- OR reference that operation.md must be read first (or merge the two documents)

---

#### [FINDING-D2] severity: P1
**Environment Variables Documentation is Inconsistent**

Three different naming schemes exist:
- **README** (line 128-150): `DATABASE_URL`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`
- **.env.example**: `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY`, `GITHUB_TOKEN`
- **operation.md** (line 82-170): `AXEL_DB_URL`, `AXEL_REDIS_URL`, `AXEL_ANTHROPIC_API_KEY`, `AXEL_GOOGLE_API_KEY`

**Expected**: Single source of truth for environment variable names. Currently there are 3 different specs.

---

#### [FINDING-D3] severity: P1
**README Missing Key Setup Instructions**

README Quick Start omits:
- Building the migration tool (`pnpm --filter @axel/migrate build`) before running migrations
- Verification step for Docker services health (operation.md has this at lines 58-65)
- `.env` file validation (operation.md explains all required keys at lines 78-170)

**Expected**: Either add these to README or clearly state "See operation.md for detailed setup".

---

#### [FINDING-D4] severity: P1
**TypeScript Compilation Errors Block Development**

`pnpm build` fails with 31 errors across:
- apps/axel/src/config.ts (1 error)
- apps/axel/src/container.ts (2 errors)
- tools/migrate/src/cli.ts (6 errors)
- (plus more from other packages)

README claims "Build all packages: `pnpm build`" but this command fails.

**Expected**: Either fix TypeScript errors OR document the workaround.

---

#### [FINDING-D5] severity: P2
**Linting and Formatting Issues Not Mentioned**

README lists `pnpm lint` and `pnpm format` as development commands but doesn't mention:
- Both currently fail (48 lint errors, 136 warnings; 17 format errors)
- No mention of required fixes before committing

**Expected**: Add note that code is not yet passing lint/format, or fix the issues.

---

#### [FINDING-D6] severity: P2
**README Doesn't Mention operation.md Exists**

README (line 207) only says: "This project uses an autonomous agent development organization. See `.axel-ops/` for operational infrastructure."

But the comprehensive `operation.md` (755 lines) provides:
- Detailed setup instructions (contradicting README)
- Troubleshooting guide (lines 665-697)
- Full environment variable reference (lines 726-753)
- Channel-specific configuration (lines 299-417)

**Expected**: README should reference operation.md early: "For detailed setup instructions, see operation.md".

---

### Test Results Summary

```
✓ Tests: 1075 passed, 36 skipped (90 test files)
✗ Build: Failed (31 TypeScript errors)
✗ Typecheck: Failed (unused variables, type mismatches)
✗ Lint: Failed (48 errors, 136 warnings)
✗ Format: Failed (17 errors)
```

### Next Steps for Project Team

1. **Immediately**: Fix TypeScript compilation errors in apps/axel and tools/migrate
2. **High Priority**: Unify environment variable naming across README, .env.example, and operation.md
3. **High Priority**: Update README to reference operation.md or merge documentation
4. **Medium Priority**: Fix lint and format issues before next QC cycle
5. **Documentation**: Update README's "Quick Start" section with accurate steps

---

**Report Generated**: 2026-02-08 18:54 UTC  
**QC Cycle**: 20260208_1854  
**Project**: Axel (main branch)

