# CONSTITUTION: Agent Behavior Rules

> This document is immutable. Only the human operator (Mark) may modify it.
> All agents MUST comply with these rules at all times.

---

## 1. Division Ownership

### 1.1 Command Layer

| Division | Code | Owned Directories | Model | Worktree |
|----------|------|------------------|-------|----------|
| **CTO (Coordinator)** | `coord` | `.axel-ops/PROGRESS.md`, `.axel-ops/BACKLOG.md`, `.axel-ops/ERRORS.md`, `.axel-ops/METRICS.md`, `.axel-ops/comms/broadcast.jsonl` | opus | `axel` (main) |
| **Architect** | `arch` | `docs/plan/`, `docs/adr/`, `.axel-ops/PLAN_SYNC.md` | opus | `axel-wt-arch` |

### 1.2 Development Layer (TDD mandatory — see Rule 8)

| Division | Code | Owned Directories | Model | Worktree |
|----------|------|------------------|-------|----------|
| **Dev-Core** | `dev-core` | `packages/core/` | opus | `axel-wt-dev-core` |
| **Dev-Infra** | `dev-infra` | `packages/infra/` | opus | `axel-wt-dev-infra` |
| **Dev-Edge** | `dev-edge` | `packages/channels/`, `packages/gateway/`, `apps/axel/` | opus | `axel-wt-dev-edge` |
| **UI/UX** | `ui-ux` | `packages/ui/`, `apps/webchat/` | opus | `axel-wt-ui-ux` |

### 1.3 Assurance Layer

| Division | Code | Owned Directories | Model | Worktree |
|----------|------|------------------|-------|----------|
| **Quality** | `quality` | `.axel-ops/comms/quality.jsonl`, `.axel-ops/TEST_REPORT.md` (write), all files (read-only for review) | opus | `axel-wt-quality` |
| **Audit** | `audit` | `.axel-ops/comms/audit.jsonl` (write), all files (read-only for verification) | opus | `axel-wt-audit` |

### 1.4 Support Layer

| Division | Code | Owned Directories | Model | Worktree |
|----------|------|------------------|-------|----------|
| **Research** | `research` | `docs/research/` | sonnet | `axel-wt-research` |
| **DevOps** | `devops` | `packages/*/package.json`, `packages/*/tsconfig.json`, `packages/*/vitest.config.ts`, `docker/`, `.github/`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `biome.json`, `.axel-ops/DEPLOY.md`, `tools/migrate/` | sonnet | `axel-wt-devops` |

**Rule**: A Division may ONLY create/modify files in its owned directories. Reading any file is allowed.

## 2. Communication Protocol

### 2.1 Message Format (JSON-L)

Each Division writes to its own comms file. Coordinator reads all.

```jsonl
{"ts":"0207T1430","from":"arch","type":"done","task":"ADR-013","out":"docs/adr/013-memory-layers.md","note":"6-layer finalized"}
```

### 2.2 Message Types

| type | Meaning | Allowed From |
|------|---------|-------------|
| `assign` | Task assignment | coord only |
| `claim` | Task acceptance | any |
| `done` | Task completion | any |
| `issue` | Problem found | quality, any |
| `block` | Blocker encountered | any |
| `escalate` | Human intervention needed | coord only |
| `broadcast` | Global announcement | coord only |
| `finding` | Factual discrepancy found | audit only |
| `ack` | Acknowledgment | any |
| `test-result` | Test results (pass/fail/coverage) | dev-*, quality |
| `plan-amendment` | Implementation-driven plan change request | dev-*, arch |
| `research-suggestion` | Proactive improvement suggestion | research |
| `interface-contract` | Cross-package interface definition | arch |
| `activation` | Next-cycle Division activation list | coord only |
| `coverage-report` | Per-package coverage stats | dev-*, quality |
| `metric-alert` | Bottleneck/threshold breach detection | coord only |

### 2.3 Comms Files

| File | Writer | Readers |
|------|--------|---------|
| `comms/broadcast.jsonl` | Coordinator | All |
| `comms/arch.jsonl` | Architect | Coordinator, Quality, Dev-* |
| `comms/dev-core.jsonl` | Dev-Core | Coordinator, Quality, Architect |
| `comms/dev-infra.jsonl` | Dev-Infra | Coordinator, Quality, Architect |
| `comms/dev-edge.jsonl` | Dev-Edge | Coordinator, Quality, Architect |
| `comms/quality.jsonl` | Quality | Coordinator, Architect, Dev-* |
| `comms/research.jsonl` | Research | Coordinator, Architect |
| `comms/devops.jsonl` | DevOps | Coordinator, All |
| `comms/audit.jsonl` | Audit | Coordinator, Architect, Quality |
| `comms/ui-ux.jsonl` | UI/UX | Coordinator, Quality, Architect, Dev-Edge |
| `comms/human.md` | Human (Mark) | Coordinator (read-first every cycle) |

## 3. Quality Gates

Before any document is considered "done":

1. **Consistency**: No contradictions with existing ADRs or plan
2. **Completeness**: All v2.0 open items have answers
3. **Traceability**: claude_reports 23 issues all mapped to Axel solutions
4. **Feasibility**: Proposed tech stack exists and is compatible
5. **Sources**: Research results include source URLs

### Per-Review Checklist (Quality Division)

- [ ] New ADR does not contradict existing ADRs
- [ ] Research results include source URLs
- [ ] Plan changes align with v2.0 core decisions (TS single stack, PostgreSQL, etc.)
- [ ] Numbers (token budgets, costs, etc.) are arithmetically correct
- [ ] Specs are concrete enough for distributed agent implementation
- [ ] Migration SQL files match `migration-strategy.md`
- [ ] SQL syntax is PostgreSQL-compatible (no subquery in USING, etc.)
- [ ] New tables/columns are reflected in migration files

## 4. BACKLOG Rules

- **Only Coordinator** may modify `BACKLOG.md`
- Other Divisions request changes via their comms file
- Priority levels: P0 (blocking) > P1 (quality-impacting) > P2 (improvement) > P3 (nice-to-have)
- Tasks in "In Progress" must have a Division and start timestamp

## 5. Git Rules

- Each Division works in its own worktree + branch
- `git pull --rebase` before starting any work
- Conventional Commits format: `docs(plan):`, `docs(adr):`, `docs(research):`, `chore(ops):`
- All commits include `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>` or `Claude Sonnet 4.5`

## 6. Escalation Rules

| Condition | Action |
|-----------|--------|
| P0 blocker unresolved for 2+ cycles (1h) | Coordinator writes `escalate` to broadcast.jsonl |
| P0 blocker unresolved for 3+ cycles (1.5h) | Coordinator triggers user notification |
| Agent session failure | Log to ERRORS.md, retry next cycle |
| Cumulative errors > 5 open | Coordinator escalates to user |

## 7. Drift Prevention

Coordinator MUST verify every cycle:

1. Recent commits do not violate MISSION.md principles
2. BACKLOG tasks align with v3.0 goals
3. No Division has modified files outside its ownership
4. Token/cost numbers remain arithmetically consistent

## 8. TDD Mandatory

All files under `packages/*/src/` MUST have a corresponding test file under `packages/*/tests/`.
Test commits MUST precede source commits (verified by timestamp in git log).
Violation severity: **HIGH**. Quality Division enforces. Violating tasks are marked incomplete.

Coverage targets:
- `packages/core/`: 90%+
- `packages/infra/`: 80%+
- `packages/channels/`: 75%+
- `packages/gateway/`: 80%+
- `packages/ui/`: 80%+

## 9. Package Boundary Enforcement

| Package | May Import From |
|---------|----------------|
| `packages/core/` | No other `packages/` — only Node.js stdlib and external npm |
| `packages/infra/` | `@axel/core/{types,memory,orchestrator}` |
| `packages/channels/` | `packages/core/src/types/` and `@axel/ui` |
| `packages/gateway/` | `packages/core/src/types/` only |
| `packages/ui/` | `packages/core/src/types/` only (design tokens have no other internal deps) |
| `apps/axel/` | Any `packages/*` |
| `apps/webchat/` | Any `packages/*` |

Violation severity: **CRITICAL**. Quality Division enforces via import analysis.

## 10. Test Gate for `done` Reports

A Dev Division may only send a `done` message when ALL of the following are true:
1. All tests pass (`pnpm vitest run`)
2. Coverage meets the target for the package (Rule 8)
3. Zero Biome warnings (`pnpm biome check`)
4. TypeScript compiles (`pnpm tsc --noEmit`)

Violation severity: **HIGH**. Quality Division verifies.

## 11. Plan-Code Synchronization

Architect maintains `PLAN_SYNC.md` with plan-section ↔ code-location mappings.
PLAN_SYNC.md MUST be updated at every milestone.
Any `DRIFT` status unresolved for 5+ cycles triggers automatic escalation to Coordinator.

Flow:
- Dev discovers drift → sends `plan-amendment` message
- Coordinator activates Architect
- Architect evaluates: update plan OR instruct Dev to change code
- PLAN_SYNC.md updated

## 12. Conditional Activation

Only the Coordinator may decide which Divisions are active in a given cycle.
Coordinator writes an `activation` message to `broadcast.jsonl` each cycle.
No Division may self-activate — `cycle.sh` reads the activation list and only runs listed Divisions.

## 13. Merge Integrity

After merging Division branches into main (Phase 3), the following smoke tests MUST pass:
```bash
pnpm install --frozen-lockfile
pnpm typecheck     # tsc --noEmit
pnpm test --run    # vitest run
# Migration integrity check
docker compose -f docker/docker-compose.dev.yml up -d postgres
DATABASE_URL=postgresql://axel:axel_dev_password@localhost:5432/axel_test pnpm migrate up
docker compose -f docker/docker-compose.dev.yml down
```
If any test fails: identify the offending merge, revert it, create a P0 fix task.

## 14. File Size Limit

Source files (`packages/*/src/**/*.ts`) MUST NOT exceed 400 lines.
Quality Division monitors. Violation severity: **MEDIUM**.

## 15. Cross-Division Handoff

When a Dev Division completes work that affects shared resources:

1. **DB Schema Changes** (Dev-Infra → DevOps):
   - DevOps MUST verify migration runner executes successfully
   - Done message requires: `"migration-verified": true`

2. **Channel Interface Changes** (Dev-Edge → UI/UX):
   - UI/UX MUST verify rendering compatibility
   - Done message requires: `"rendering-verified": true`

3. **Core Type Changes** (Dev-Core → All Dev):
   - Dependent divisions MUST verify compilation
   - Done message requires: `"type-check-verified": true`

## 16. Human Directive Priority

Coordinator MUST read `comms/human.md` at the START of every cycle, BEFORE reading other comms.
- `directive` messages → immediately create BACKLOG task (inherit priority)
- `feedback` messages → route to relevant Division as `assign` with corrections
- `halt` messages → immediately move task to "Blocked (human-halted)"
- `approve` messages → unblock escalated items

Human directives ALWAYS override automated scheduling.
