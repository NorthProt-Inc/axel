# QC Worker: README Walkthrough
## Cycle: 20260208_1921

### Pre-flight
- package.json scripts found: `build`, `build:clean`, `typecheck`, `test`, `test:watch`, `test:coverage`, `lint`, `lint:fix`, `format`, `format:check`
- operation.md: EXISTS

### Prerequisites Verified
| Prerequisite | README Says | Actual | OK? |
|---|---|---|---|
| Node.js | 22+ | v22.13.1 | YES |
| pnpm | 9+ | 9.15.4 | YES |
| PostgreSQL 17+ | Docker Compose | Docker 29.2.0 | YES |
| Docker Compose | Required | v5.0.2 | YES |

### README Commands Tested
| # | Documented Command | Source | Worked? | Actual Result |
|---|-------------------|--------|---------|---------------|
| 1 | `pnpm install` | README | YES | "Already up to date" — 622ms |
| 2 | `docker compose -f docker/docker-compose.dev.yml up -d` | README | SKIPPED | File exists, not starting infra |
| 3 | `node tools/migrate/dist/cli.js up` | README | SKIPPED | Requires running DB (infra) |
| 4 | `cp .env.example .env` | README | SKIPPED | .env already exists, checked content instead |
| 5 | `pnpm build` | README | NO | TS errors in infra/migrate — code bug (Worker A) |
| 6 | `pnpm typecheck` | README | NO | TS errors in @axel/core — code bug (Worker A) |
| 7 | `pnpm test` | README | YES | 1075 passed, 36 skipped, 89 files passed |
| 8 | `pnpm test:coverage` | README | YES | Coverage report generated |
| 9 | `pnpm test:watch` | README | YES | Runs in watch mode (killed by timeout as expected) |
| 10 | `pnpm lint` | README | NO | 48 errors, 136 warnings — code quality (Worker A) |
| 11 | `pnpm format` | README | YES | Formatted 239 files, fixed 17 |
| 12 | `pnpm format:check` | README | YES | Checked 239 files, no issues |
| 13 | `pnpm --filter @axel/core test` | README | YES | 387 passed |
| 14 | `pnpm --filter @axel/core test:watch` | README | YES | Script exists in package.json |
| 15 | `pnpm --filter @axel/infra typecheck` | README | YES | Script exists in package.json |
| 16 | `pnpm --filter axel dev` | README | SKIPPED | Would start dev server (requires infra) |
| 17 | `pnpm --filter @axel/migrate build` | operation.md | NO | TS errors — code bug (Worker A) |
| 18 | `pnpm --filter axel start` | operation.md | YES | Script exists (`node ./dist/main.js`) |

### Referenced Files
| Path in README/operation.md | Exists? |
|---|---|
| `docker/docker-compose.dev.yml` | YES |
| `tools/migrate/dist/cli.js` | YES |
| `apps/axel/dist/main.js` | YES |
| `docs/adr/` | YES |
| `docs/plan/axel-project-plan.md` | YES |
| `docs/research/` | YES |
| `docs/plan/migration-strategy.md` | YES |
| `.axel-ops/` | YES |
| `.env.example` | YES |
| `apps/axel/` | YES |
| `apps/webchat/` | YES |
| `packages/core/` | YES |
| `packages/infra/` | YES |
| `packages/channels/` | YES |
| `packages/gateway/` | YES |
| `packages/ui/` | YES |
| `tools/migrate/` | YES |
| `tools/migrate/README.md` | YES |
| `data/dynamic_persona.json` (operation.md default) | MISSING |

### Documentation Gaps
- operation.md: EXISTS (comprehensive, 757 lines)

### Findings

- [FINDING-D1] severity: **P1**. README "Environment Variables" section uses variable names (`DATABASE_URL`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `REDIS_URL`, `DISCORD_BOT_TOKEN`, `TELEGRAM_BOT_TOKEN`, `GATEWAY_PORT`, `GATEWAY_AUTH_TOKEN`) that are inconsistent with operation.md which uses `AXEL_` prefixed names (`AXEL_DB_URL`, `AXEL_ANTHROPIC_API_KEY`, `AXEL_GOOGLE_API_KEY`, `AXEL_REDIS_URL`, etc.). The `.env.example` uses yet a third convention for some (`GEMINI_API_KEY` instead of `GOOGLE_API_KEY` or `AXEL_GOOGLE_API_KEY`). A new contributor cannot tell which names are correct.

- [FINDING-D2] severity: **P2**. `.env.example` is severely out of sync with both README and operation.md:
  - `.env.example` has only 4 non-commented vars: `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY`, `GITHUB_TOKEN`
  - `AXEL_DB_URL` and `AXEL_REDIS_URL` are commented out with "(future)" note, but operation.md lists them as **required**
  - README lists `GOOGLE_API_KEY` but `.env.example` uses `GEMINI_API_KEY`
  - README lists `GATEWAY_PORT`, `GATEWAY_AUTH_TOKEN` — absent from `.env.example`
  - operation.md lists `AXEL_DISCORD_BOT_TOKEN`, `AXEL_TELEGRAM_BOT_TOKEN`, `AXEL_PORT`, `AXEL_HOST`, etc. — all absent from `.env.example`
  - `.env` has 7 AXEL-prefixed vars not in `.env.example`

- [FINDING-D3] severity: **P2**. operation.md section 2.1 says `cp .env.example .env` then section 2.2 tells users to set `AXEL_DB_URL`, `AXEL_ANTHROPIC_API_KEY`, `AXEL_GOOGLE_API_KEY` — but `.env.example` does not contain any of these `AXEL_` prefixed variables (DB/Redis are commented out, API keys use non-prefixed names). A new contributor following the steps would have a `.env` missing all required AXEL-prefixed variables.

- [FINDING-D4] severity: **P3**. operation.md references `data/dynamic_persona.json` as the default value for `AXEL_PERSONA_PATH`, but this file does not exist in the repository. Minor because it's a default config value that may be created at runtime.

- [FINDING-D5] severity: **P2**. README "Environment Variables" section and operation.md "Environment Variables" appendix are inconsistent about the variable `DATABASE_URL`:
  - README line 65: `export DATABASE_URL="postgresql://..."` for migration
  - README line 134: `DATABASE_URL="postgresql://..."` in the env var section  
  - operation.md line 185: `export DATABASE_URL="postgresql://..."` for migration but section 2.2 says the env file should have `AXEL_DB_URL`
  - Migration tool (`tools/migrate/dist/cli.js`) expects `DATABASE_URL` (confirmed by CLI source reference), but the `.env` convention uses `AXEL_DB_URL`. This creates confusion about which variable name the migration tool actually reads.

### Self-Verification Notes

- FINDING-D1: README says use `DATABASE_URL`, operation.md says use `AXEL_DB_URL`, `.env.example` comments out `AXEL_DB_URL`. Self-check: (1) Testing docs ✓ — this is a documentation naming inconsistency between two docs files (2) Ran exactly as documented? N/A — comparison finding (3) Infra issue? No (4) Cascade? No. **Verdict: DOCS ISSUE** — two official docs disagree on env var names.

- FINDING-D2: `.env.example` has 4 vars, README lists 8, operation.md lists 20+. Self-check: (1) Testing docs ✓ — `.env.example` should be the starting template per both docs (2) Ran diff as documented? Yes (3) Infra issue? No (4) Cascade? No. **Verdict: DOCS ISSUE** — `.env.example` is stale and doesn't match either README or operation.md.

- FINDING-D3: operation.md setup flow leads to `.env` without required vars. Self-check: (1) Testing docs ✓ — the documented workflow has a gap (2) Followed steps exactly? Yes (3) Infra issue? No (4) Cascade? Partially related to D2 but independently discoverable. **Verdict: DOCS ISSUE** — workflow gap.

- FINDING-D4: `data/dynamic_persona.json` missing. Self-check: (1) Testing docs ✓ — referenced path doesn't exist (2) Exact check? Yes (3) Infra? No (4) Cascade? No. **Verdict: DOCS ISSUE** (minor — may be runtime-generated).

- FINDING-D5: Migration tool env var name confusion. Self-check: (1) Testing docs ✓ — README and operation.md give conflicting guidance (2) Direct comparison (3) Infra? No (4) Cascade? Related to D1 but specifically about migration steps. **Verdict: DOCS ISSUE** — migration step uses `DATABASE_URL` but env file convention is `AXEL_DB_URL`.

### Output (failed/notable commands only)

**`pnpm build` (TS errors — code bug, NOT docs issue):**
```
tools/migrate/src/cli.ts(12,50): error TS4111: Property 'DATABASE_URL' comes from an index signature...
packages/infra/src/llm/google-llm-adapter.ts(26,5): error TS2345: Argument of type...
ELIFECYCLE  Command failed with exit code 2.
```

**`.env.example` vs `.env` diff (documentation gap):**
```
.env.example has only: ANTHROPIC_API_KEY, GEMINI_API_KEY, OPENAI_API_KEY, GITHUB_TOKEN
.env has additionally: AXEL_ANTHROPIC_API_KEY, AXEL_CHANNELS_CLI_ENABLED, AXEL_DB_URL, AXEL_GATEWAY_AUTH_TOKEN, AXEL_GATEWAY_CORS_ORIGINS, AXEL_GOOGLE_API_KEY, AXEL_REDIS_URL
```
