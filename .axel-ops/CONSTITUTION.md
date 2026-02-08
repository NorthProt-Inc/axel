# CONSTITUTION: Agent Behavior Rules

> This document is immutable. Only the human operator (Mark) may modify it.
> All agents MUST comply with these rules at all times.

---

## 1. Division Ownership

| Division | Owned Directories | Model |
|----------|------------------|-------|
| **Coordinator** | `.axel-ops/PROGRESS.md`, `.axel-ops/BACKLOG.md`, `.axel-ops/ERRORS.md`, `.axel-ops/comms/broadcast.jsonl` | opus |
| **Architecture** | `docs/plan/`, `docs/adr/` | opus |
| **Research** | `docs/research/` | sonnet |
| **Quality** | `.axel-ops/comms/quality.jsonl` (write), all `docs/` (read-only for review) | opus |

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
| `ack` | Acknowledgment | any |

### 2.3 Comms Files

| File | Writer | Readers |
|------|--------|---------|
| `comms/arch.jsonl` | Architecture | Coordinator, Quality |
| `comms/research.jsonl` | Research | Coordinator, Architecture |
| `comms/quality.jsonl` | Quality | Coordinator, Architecture |
| `comms/broadcast.jsonl` | Coordinator | All |

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
