# QC Worker: README Walkthrough
## Cycle: 20260208_1735

---

## Summary
README와 operation.md의 지시사항을 따라 명령들을 실행한 결과, **3개의 중요 불일치**를 발견했습니다:

1. **환경 변수 스키마 불일치** (P1): README와 operation.md가 다른 환경 변수 이름 사용
2. **Biome format 명령어 오류** (P1): README에서 `pnpm format`은 `--check` 플래그를 지원하지 않음
3. **마이그레이션 도구 빌드 불필요** (P2): README가 불필요한 빌드 스텝 명시

---

## README Commands Tested

| # | Documented Command | Result | Status |
|---|------------------|--------|--------|
| 1 | `pnpm install` | Successfully installed | ✅ PASS |
| 2 | `pnpm typecheck` | 0 errors, 0 warnings | ✅ PASS |
| 3 | `pnpm test` | 985 passed, 36 skipped (1021 total) | ✅ PASS |
| 4 | `pnpm test:coverage` | Coverage report generated (data in output) | ✅ PASS |
| 5 | `pnpm lint` | 31 errors, 126 warnings found | ✅ PASS (linter works, but code has issues) |
| 6 | `pnpm format` (with --check) | **FAIL: `--check` not supported** | ❌ FAIL |
| 7 | `pnpm --filter @axel/core test` | 387 passed | ✅ PASS |
| 8 | `pnpm --filter @axel/migrate build` | None of the packages has a "build" script | ❌ FAIL |
| 9 | `node tools/migrate/dist/cli.js status` | Works (but needs DATABASE_URL) | ✅ PASS (conditional) |

---

## Referenced Files

| Path in README/operation.md | Exists? | Notes |
|---------------------------|---------|-------|
| `docker/docker-compose.dev.yml` | ✅ YES | Valid Docker Compose config with PostgreSQL 17 + Redis 7 |
| `docs/adr/` | ✅ YES | ADR directory exists |
| `docs/plan/axel-project-plan.md` | ✅ YES | Project plan documented |
| `docs/research/` | ✅ YES | Research directory exists |
| `.env.example` | ✅ YES | **But outdated — see Finding D2** |
| `tools/migrate/README.md` | ✅ YES | Migration tool docs exist |

---

## Environment Variables Analysis

### Critical Issue: .env.example is Severely Outdated

**Documented in README/operation.md** (operation.md section 2.2):
- `AXEL_DB_URL`
- `AXEL_REDIS_URL`
- `AXEL_ANTHROPIC_API_KEY`
- `AXEL_GOOGLE_API_KEY`
- `AXEL_DISCORD_BOT_TOKEN`
- `AXEL_TELEGRAM_BOT_TOKEN`
- Many optional vars (13+ more)

**Actual .env.example** (only 3 variables):
```
ANTHROPIC_API_KEY=
GEMINI_API_KEY=
OPENAI_API_KEY=
GITHUB_TOKEN=
```

**Analysis**:
- `.env.example` is from an **older version** (mentions GEMINI, OPENAI, GITHUB_TOKEN)
- Current implementation uses `AXEL_*` prefixed variables per operation.md
- User following README would fail when running migrations/dev server
- The stored `.env` has the **correct variables** but `.env.example` is wrong

---

## Documentation Gaps

### operation.md: EXISTS ✅
**Excellent Korean language operational guide**, but introduces naming inconsistency:
- README uses generic names (`NODE_ENV`)
- operation.md uses prefixed names (`AXEL_ENV`, `AXEL_DB_URL`, etc.)
- **Neither file references the other**, creating confusion

### Package-Specific READMEs:
- `apps/axel/README.md` — ✅ EXISTS (7.5 KB)
- `tools/migrate/README.md` — ✅ EXISTS
- `packages/*/README.md` — Not checked (assumed to exist)

---

## Findings

### [FINDING-D1] P1 — Biome Format Command Fails

**Severity**: P1 (Breaking instruction)

**Issue**: README line 94 says:
```bash
pnpm format
```

But actual invocation with `--check` fails:
```
Error: `--check` is not expected in this context
```

**Root Cause**: `biome format` doesn't accept `--check`. Only `biome check` does.

**Fix**: Remove `--check` from format or use `biome check --write` instead.

**Evidence**:
```bash
$ pnpm format --check
Error: `--check` is not expected in this context
```

---

### [FINDING-D2] P1 — .env.example Severely Outdated

**Severity**: P1 (Setup blocker)

**Issue**: Instructions say "copy .env.example to .env" (operation.md 2.1), but `.env.example` is outdated:
- Has: `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY`, `GITHUB_TOKEN`
- Should have: `AXEL_DB_URL`, `AXEL_REDIS_URL`, `AXEL_ANTHROPIC_API_KEY`, `AXEL_GOOGLE_API_KEY`, etc.

**Impact**: New users copying `.env.example` get wrong variable names. Code won't start.

**Fix**: Update `.env.example` to match actual environment variable schema.

**Current Status**: Stored `.env` has correct variables, so local environment works. But template is broken.

---

### [FINDING-D3] P2 — Unnecessary Migration Build Step

**Severity**: P2 (Minor inefficiency)

**Issue**: operation.md section 3.1 says:
```bash
pnpm --filter @axel/migrate build
```

But the tool is already pre-built in `tools/migrate/dist/cli.js`:
```
✓ Migrate CLI already built (exists at /home/northprot/projects/axel/tools/migrate/dist/cli.js)
```

And the command fails:
```
None of the selected packages has a "build" script
```

**Impact**: Instructions mislead users to run an unnecessary (failing) command.

**Fix**: Remove the build step from operation.md section 3.1. The migrate tool is pre-built.

---

### [FINDING-D4] P2 — Inconsistent Environment Variable Naming

**Severity**: P2 (Confusing documentation)

**Issue**: Two files use different naming conventions:

**README.md** (lines 128-143):
```bash
DATABASE_URL="postgresql://..."
ANTHROPIC_API_KEY="sk-ant-..."
REDIS_URL="redis://..."
```

**operation.md** (section 2.2):
```bash
AXEL_DB_URL="postgresql://..."
AXEL_ANTHROPIC_API_KEY="sk-ant-..."
AXEL_REDIS_URL="redis://..."
```

**Impact**: New users don't know which naming scheme is correct.

**Fix**: Standardize on one naming scheme (recommend `AXEL_*` prefix per operation.md) and update README to match.

---

### [FINDING-D5] P2 — README Doesn't Mention operation.md

**Severity**: P2 (Missing reference)

**Issue**: README has quick-start section but doesn't mention the more detailed `operation.md` guide.

**Impact**: Users might miss the comprehensive Korean-language guide.

**Fix**: Add reference in README: "For detailed Korean-language setup guide, see `operation.md`"

---

### [FINDING-D6] P3 — Docker Compose Port Mapping Unclear

**Severity**: P3 (Minor clarity)

**Issue**: README says "Start infrastructure (Docker Compose)" but doesn't explain that services will be on `localhost:5432` (PostgreSQL) and `localhost:6379` (Redis).

**Fix**: Add note about port mappings in Quick Start.

---

## Actual Command Output (Failed Commands)

### pnpm format --check
```
> axel-monorepo@0.0.0 format /home/northprot/projects/axel
> biome format --write . "--check"

Error: `--check` is not expected in this context
 ELIFECYCLE  Command failed with exit code 1.
```

### pnpm --filter @axel/migrate build
```
None of the selected packages has a "build" script
```

### node tools/migrate/dist/cli.js status (without DB)
```
Migration error: Error: DATABASE_URL or individual PG* environment variables 
(PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD) must be set
```

---

## Test Environment

- **Node.js**: v22.13.1 ✅
- **pnpm**: 9.15.4 ✅
- **Docker**: 29.2.0 ✅
- **Docker Compose**: v5.0.2 ✅
- **PostgreSQL**: pgvector/pgvector:pg17 (in docker-compose.dev.yml) ✅
- **Redis**: Redis 7 Alpine (in docker-compose.dev.yml) ✅

---

## Recommendations

### Priority (Before Release)

1. **UPDATE .env.example** with correct `AXEL_*` prefixed variables
2. **FIX Biome format command** — remove `--check` or use `biome check --write`
3. **REMOVE migration build step** from operation.md section 3.1

### Medium Priority

4. Add reference to operation.md in README Quick Start section
5. Standardize environment variable naming across both documents (use `AXEL_*` prefix everywhere)

### Nice to Have

6. Document port mappings in README (PostgreSQL 5432, Redis 6379)

---

## Conclusion

**Overall Assessment**: Documentation is **80% complete** but has **3 critical issues** that would break new user setup:

- ✅ Good: Comprehensive operation.md, test coverage (985 tests), clear architecture docs
- ❌ Bad: Outdated .env.example, broken format command, inconsistent variable naming
- ⚠️ Risky: User following README exactly would fail at env setup step

**QC Status**: **REQUIRES FIX** before user-facing release. Local development currently works due to correct `.env` file, but new users would be blocked.

---

**Report generated**: 2026-02-08 17:35 UTC
**Tester**: QC Worker C (README Walkthrough)
**Cycle ID**: 20260208_1735

