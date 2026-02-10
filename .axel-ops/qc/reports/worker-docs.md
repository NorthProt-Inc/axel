# QC Worker C: README Walkthrough
## Cycle: 20260209_1734

### Pre-flight
- package.json scripts found (root): `build`, `build:clean`, `typecheck`, `test`, `test:watch`, `test:coverage`, `lint`, `lint:fix`, `format`, `format:check`
- package.json scripts found (apps/axel): `build`, `typecheck`, `test`, `test:watch`, `dev`, `start`

### README Commands Tested
| # | Documented Command | Source | Worked? | Actual Result |
|---|-------------------|--------|---------|---------------|
| 1 | `pnpm install` | README Quick Start | YES | Done in 647ms (lockfile up to date) |
| 2 | `docker compose -f docker/docker-compose.dev.yml up -d` | README Quick Start | YES (config validated, not started) | docker-compose.dev.yml validates successfully |
| 3 | `node tools/migrate/dist/cli.js up` | README Quick Start | **CONDITIONAL** | File exists only after build — see FINDING-D1 |
| 4 | `cp .env.example .env` | README Quick Start | YES | .env.example exists |
| 5 | `pnpm --filter axel dev` | README Quick Start | YES (script exists) | Script: `tsx --env-file=../../.env --watch ./src/main.ts` |
| 6 | `pnpm build` | README Development | YES | tsc -b completed successfully |
| 7 | `pnpm typecheck` | README Development | YES | tsc -b completed successfully |
| 8 | `pnpm test` | README Development | YES | 127 passed, 1 skipped, 1706 tests passed |
| 9 | `pnpm test:coverage` | README Development | YES (script exists) | vitest run --coverage |
| 10 | `pnpm lint` | README Development | YES* | Runs correctly; exits with errors due to code lint issues (Worker A domain) |
| 11 | `pnpm format` | README Development | YES* | Runs correctly; format errors in code (Worker A domain) |
| 12 | `pnpm format:check` | README Development | YES* | Runs correctly; format errors in code (Worker A domain) |
| 13 | `pnpm --filter @axel/core test` | README Package-Specific | YES | 40 files, 619 tests passed |
| 14 | `pnpm --filter @axel/core test:watch` | README Package-Specific | YES (script exists) | Script: `vitest` |
| 15 | `pnpm --filter @axel/infra typecheck` | README Package-Specific | YES | tsc --noEmit completed successfully |
| 16 | `pnpm lint:fix` | README (operation.md §6.8) | YES (script exists) | Script: `biome check --write .` |
| 17 | `pnpm --filter @axel/migrate build` | operation.md §3.1 | YES | tsc completed successfully |
| 18 | `node tools/migrate/dist/cli.js status` | operation.md §3.2 | YES (file exists after build) | Requires DB connection |
| 19 | `pnpm --filter axel build` | operation.md §4.2 | YES | Part of root `pnpm build` |
| 20 | `pnpm --filter axel start` | operation.md §4.2 | YES (script exists) | Script: `node ./dist/main.js` |
| 21 | `NODE_ENV=production node apps/axel/dist/main.js` | README Production | YES (file exists after build) | Matches start script |

### Referenced Files
| Path in README/operation.md | Exists? |
|---------------------------|---------|
| `apps/axel/` | YES |
| `apps/webchat/` | YES |
| `packages/core/` | YES |
| `packages/infra/` | YES |
| `packages/channels/` | YES |
| `packages/gateway/` | YES |
| `packages/ui/` | YES |
| `tools/migrate/` | YES |
| `docker/docker-compose.dev.yml` | YES |
| `docs/adr/` (21 ADRs claimed) | YES (21 files confirmed) |
| `docs/plan/axel-project-plan.md` | YES |
| `docs/research/` | YES |
| `docs/plan/migration-strategy.md` | YES |
| `.env.example` | YES |
| `apps/axel/src/config.ts` | YES |
| `tools/migrate/README.md` | YES |
| `.axel-ops/` | YES |
| `data/dynamic_persona.json` | **MISSING** |
| `packages/*/README.md` | YES (all 5 packages) |
| `apps/*/README.md` | YES (both apps) |

### Documentation Gaps
- **operation.md**: EXISTS (comprehensive, 757 lines)
- **README → Quick Start missing migration build step**: README tells users to run `node tools/migrate/dist/cli.js up` but `tools/migrate/dist/` is not committed to git. A fresh clone will fail here. operation.md §3.1 correctly includes `pnpm --filter @axel/migrate build` before the migration step.
- **README test count outdated**: README says "1000+ tests, 90 files" — actual: 1706 tests, 128 files. Not wrong (1000+ is true) but "90 files" is significantly outdated.
- **.env.example incomplete**: Contains only 4 variables (`AXEL_DB_URL`, `AXEL_REDIS_URL`, `AXEL_ANTHROPIC_API_KEY`, `AXEL_GOOGLE_API_KEY`). README documents additional variables like `AXEL_DISCORD_BOT_TOKEN`, `AXEL_TELEGRAM_BOT_TOKEN`, `AXEL_GATEWAY_AUTH_TOKEN`, `AXEL_GATEWAY_CORS_ORIGINS` that are not in .env.example.

### Findings

- **[FINDING-D1]** severity: **P0**. README Quick Start §Installation says to run `node tools/migrate/dist/cli.js up` but does NOT include the required build step `pnpm --filter @axel/migrate build` beforehand. `tools/migrate/dist/` is not committed to git (.gitignored). A new contributor following README literally will get `Error: Cannot find module 'tools/migrate/dist/cli.js'`. operation.md §3.1 correctly includes this step.

- **[FINDING-D2]** severity: **P2**. `.env.example` is out of sync with README documentation. README §Environment Variables documents `AXEL_DISCORD_BOT_TOKEN`, `AXEL_TELEGRAM_BOT_TOKEN`, `AXEL_GATEWAY_AUTH_TOKEN`, `AXEL_GATEWAY_CORS_ORIGINS` — none of these are in `.env.example`. A new user copying `.env.example` to `.env` won't see these optional variables.

- **[FINDING-D3]** severity: **P3**. README §Architecture says "1000+ tests, 90 files" — actual count is 1706 tests across 128 test files. The "1000+" is technically correct but "90 files" is outdated (~42% undercount).

- **[FINDING-D4]** severity: **P2**. operation.md §2.2 references `AXEL_PERSONA_PATH` with default value `./data/dynamic_persona.json`, but the file `data/dynamic_persona.json` does not exist in the repository. A user setting up for the first time may wonder about this missing file.

### Self-Verification Notes

- **FINDING-D1**: README Quick Start missing migration build step.
  - (1) Testing docs or code? **Docs** — the README omits a documented step that operation.md includes correctly.
  - (2) Ran exactly as documented? **Yes** — following README literally, there is no build step before `node tools/migrate/dist/cli.js up`.
  - (3) Infra issue? **No** — `dist/` simply doesn't exist in a fresh clone.
  - (4) Cascade? **No** — first point of failure.
  - **Verdict: DOCS ISSUE** ✓

- **FINDING-D2**: .env.example missing variables documented in README.
  - (1) Testing docs or code? **Docs** — README says "cp .env.example .env" but .env.example lacks variables README documents.
  - (2) Ran exactly as documented? **Yes**.
  - (3) Infra issue? **No**.
  - (4) Cascade? **No**.
  - **Verdict: DOCS ISSUE** ✓

- **FINDING-D3**: Outdated test count in README.
  - (1) Testing docs or code? **Docs** — README states incorrect numbers.
  - (2) Ran exactly as documented? **Yes** — `pnpm test` output shows actual counts.
  - (3) Infra issue? **No**.
  - (4) Cascade? **No**.
  - **Verdict: DOCS ISSUE** ✓ (minor — P3)

- **FINDING-D4**: Missing persona file referenced in operation.md.
  - (1) Testing docs or code? **Docs** — operation.md references a default file path that doesn't exist.
  - (2) Ran exactly as documented? **Yes** — checked file existence.
  - (3) Infra issue? **No**.
  - (4) Cascade? **No**.
  - **Verdict: DOCS ISSUE** ✓

### Discarded Findings

- `pnpm lint` exits with code 1 due to Biome lint errors → **DISCARDED** (code quality issue → Worker A)
- `pnpm format:check` exits with code 1 due to format errors → **DISCARDED** (code quality issue → Worker A)
- `pnpm format` exits with code 1 due to parse error in `tools/data-quality/report.json` → **DISCARDED** (code issue → Worker A)

### Output (relevant commands)

**Pre-flight — root package.json scripts:**
```json
{
  "build": "tsc -b",
  "build:clean": "tsc -b --clean",
  "typecheck": "tsc -b",
  "test": "vitest run --passWithNoTests",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage",
  "lint": "biome check .",
  "lint:fix": "biome check --write .",
  "format": "biome format --write .",
  "format:check": "biome format ."
}
```

**FINDING-D1 evidence — dist/cli.js not tracked by git:**
```
$ git ls-files --error-unmatch tools/migrate/dist/cli.js
error: pathspec 'tools/migrate/dist/cli.js' did not match any file(s) known to git
```

**FINDING-D2 evidence — .env.example contents:**
```
AXEL_DB_URL
AXEL_REDIS_URL
AXEL_ANTHROPIC_API_KEY
AXEL_GOOGLE_API_KEY
```
(Only 4 variables; README documents 10+ variables)

**FINDING-D4 evidence — missing persona file:**
```
$ [ -e data/dynamic_persona.json ] && echo EXISTS || echo MISSING
MISSING
```
