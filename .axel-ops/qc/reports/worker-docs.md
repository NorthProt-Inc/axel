# QC Worker: README Walkthrough
## Cycle: 20260208_1834

### README Commands Tested

| # | Documented Command | Worked? | Notes |
|---|-------------------|---------|-------|
| 1 | `pnpm install` | YES | 650ms, dependencies already up to date |
| 2 | `docker compose -f docker/docker-compose.dev.yml up -d` | SKIPPED | Services already running (9h), health check OK |
| 3 | `pnpm build` | NO | TypeScript compilation failures (see below) |
| 4 | `pnpm typecheck` | NO | TypeScript errors in @axel/core package |
| 5 | `pnpm test` | YES | 1075 tests passed, 36 skipped (5.39s) |
| 6 | `pnpm test:coverage` | NOT TESTED | Skipped (time constraint) |
| 7 | `pnpm lint` | NO | 48 errors, 136 warnings found |
| 8 | `pnpm format:check` | NO | 17 formatting errors |
| 9 | `pnpm format` | NOT TESTED | Not run due to existing format errors |
| 10 | `docker compose ps` | YES | PostgreSQL & Redis running healthy |
| 11 | Database migration tool (referenced) | NOT TESTED | Blocked by build failures |

### Referenced Files
| Path in README | Exists? | Status |
|---------------|---------|--------|
| `docker/docker-compose.dev.yml` | YES | Valid, services running |
| `docs/adr/` | YES | 23 ADRs documented |
| `docs/plan/axel-project-plan.md` | YES | Exists |
| `docs/plan/migration-strategy.md` | YES | Exists |
| `tools/migrate/` | YES | Exists |
| `apps/axel/` | YES | Exists |
| `packages/core/` | YES | Exists |
| `.env.example` | YES | Exists |

### Documentation Gaps

- **operation.md**: EXISTS ✓
  - Very comprehensive (757 lines)
  - Covers all aspects: installation, configuration, deployment, troubleshooting
  - Variables match README but use `AXEL_*` prefix (operation.md is more detailed)

- **README.md vs operation.md discrepancy**:
  - README uses `DATABASE_URL`, `REDIS_URL` format
  - operation.md uses `AXEL_DB_URL`, `AXEL_REDIS_URL` format
  - **This is confusing and needs clarification**

### Findings

#### [FINDING-D1] severity: P0 ✗ CRITICAL
**Issue**: `pnpm build` fails with TypeScript compilation errors

- **Location**: `apps/axel/src/container.ts` (lines 229, 244)
- **Cause**: Type mismatches in dependency injection container:
  1. `PgPool` type incompatibility (rows type inference)
  2. `GoogleGenAIClient` streaming type incompatibility with `exactOptionalPropertyTypes: true`
- **Impact**: Cannot build project at all
- **Block**: Prevents production deployment and Docker image building
- **Evidence**: 
  ```
  apps/axel/src/container.ts(229,59): error TS2345: Argument not assignable to parameter of type 'PgPool'
  apps/axel/src/container.ts(244,47): error TS2345: Argument not assignable to parameter of type 'GoogleGenAIClient'
  ```

#### [FINDING-D2] severity: P0 ✗ CRITICAL
**Issue**: `pnpm typecheck` fails with 4 type errors in core package

- **Location**: `packages/core/src/decay/types.ts` line 2
- **Cause**: Unused import `MemoryType` (but also suggests broader type setup issues)
- **Impact**: Type checking fails in CI/CD pipeline
- **Evidence**:
  ```
  src/decay/types.ts(2,1): error TS6133: 'MemoryType' is declared but its value is never read.
  ```

#### [FINDING-D3] severity: P1 ⚠ MAJOR
**Issue**: `tools/migrate/src/cli.ts` has `noUncheckedIndexedAccess` violations

- **Cause**: Accessing `process.env['DATABASE_URL']` without proper bracket notation checks
- **Lines**: 12, 14-18, 34-35, 37-41 (11 errors total)
- **Impact**: Migration tool won't compile as part of build pipeline
- **Evidence**:
  ```
  tools/migrate/src/cli.ts(12,50): error TS4111: Property 'DATABASE_URL' comes from 
  an index signature, so it must be accessed with ['DATABASE_URL'].
  ```

#### [FINDING-D4] severity: P1 ⚠ MAJOR
**Issue**: `pnpm lint` fails with 48 errors, 136 warnings

- **Primary issues**:
  1. Import statement organization (alphabetical sorting)
  2. Unused variable `_handleMessage` in `apps/axel/src/main.ts:64`
- **Impact**: Cannot merge PR (CI check fails)
- **Evidence**: Mixed import order, unused exports detected

#### [FINDING-D5] severity: P2 ⚠ MODERATE
**Issue**: `pnpm format:check` fails with 17 formatting errors

- **Issues**: 
  1. Multi-line import formatting inconsistencies
  2. Import type vs regular import ordering
- **Impact**: Code doesn't match Biome formatter expectations
- **Evidence**: Biome suggests unsafe fixes available

#### [FINDING-D6] severity: P2 ⚠ MODERATE
**Issue**: Environment variable name mismatch between README and operation.md

- **README uses**: `DATABASE_URL`, `REDIS_URL` (no prefix)
- **operation.md uses**: `AXEL_DB_URL`, `AXEL_REDIS_URL` (with AXEL_ prefix)
- **Impact**: Users following README will use wrong variable names
- **Recommendation**: Standardize across all documentation

#### [FINDING-D7] severity: P2 ⚠ MODERATE
**Issue**: `.env.example` missing 4 variables that `.env` has

- **Missing in .env.example**: `AXEL_ANTHROPIC_API_KEY`, `AXEL_DB_URL`, `AXEL_GOOGLE_API_KEY`, `AXEL_REDIS_URL`
- **Impact**: Users copying .env.example won't have required variables
- **Recommendation**: Ensure .env.example has all required variables with placeholder values

### Output (Failed Commands)

#### Build Errors (pnpm build)
```
apps/axel/src/container.ts(229,59): error TS2345: Argument of type '{ query(...): Promise<{ rows: unknown[]; rowCount: number | null; }>; ...' is not assignable to parameter of type 'PgPool'.
  The types returned by 'query(...)' are incompatible between these types.

apps/axel/src/container.ts(244,47): error TS2345: Argument of type '{ getGenerativeModel(...): { generateContentStream(...): Promise<{ stream: AsyncIterable<...>; }>;...' is not assignable to parameter of type 'GoogleGenAIClient'.
```

#### Typecheck Errors (pnpm typecheck)
```
packages/core:
> @axel/core@0.0.0 typecheck /home/northprot/projects/axel/packages/core
> tsc --noEmit

src/decay/types.ts(2,1): error TS6133: 'MemoryType' is declared but its value is never read.
```

#### Migration Tool Errors (in build)
```
tools/migrate/src/cli.ts(12,50): error TS4111: Property 'DATABASE_URL' comes from an index signature, so it must be accessed with ['DATABASE_URL'].
[... 10 more similar errors ...]
```

#### Lint Errors (pnpm lint)
```
Found 48 errors, 136 warnings.
Key issues:
- Import statement organization (unsafe fixes available with --fix)
- Unused variable _handleMessage in apps/axel/src/main.ts:64
```

### Summary
- **Total Critical Issues (P0)**: 2 (build failures)
- **Total Major Issues (P1)**: 2 (lint failures, migration tool)
- **Total Moderate Issues (P2)**: 2 (formatting, env variable mismatches)

**README Status**: Largely accurate but missing some environment variable details. operation.md is comprehensive but uses different variable naming convention.

**Project Build Status**: ❌ BROKEN — Cannot run `pnpm build` due to TypeScript errors. However, `pnpm test` passes successfully (1075 tests).

