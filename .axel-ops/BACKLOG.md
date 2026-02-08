# BACKLOG

> Managed by Coordinator only. Other Divisions request changes via comms.
>
> **Cycle 20**: QA-011 done — PLAN CLOSURE APPROVED. 3 MEDIUM consistency items → FIX-PRE-IMPL assigned to Arch.

## Queued

| ID | Priority | Division | Task | Depends | Created |
|----|----------|----------|------|---------|---------|

## In Progress

| ID | Division | Started | ETA |
|----|----------|---------|-----|
| FIX-PRE-IMPL | arch | 0209T0400 | 1 cycle |

## Cancelled

| ID | Reason | Superseded By |
|----|--------|---------------|
| FIX-001 | 6 cycles stalled, absorbed into WP-1~7 | WP-1, WP-2, WP-3, WP-4, WP-5, WP-6, WP-7 |
| FIX-002 | 6 cycles stalled, absorbed into WP-1 | WP-1 |
| FIX-003 | Absorbed into WP-3, WP-4 | WP-3, WP-4 |
| FIX-004 | Absorbed into FIX-MED | FIX-MED |
| FIX-005 | Absorbed into WP-3 | WP-3 |
| FIX-006 | Absorbed into WP-7 | WP-7 |
| FIX-007 | Absorbed into FIX-MED | FIX-MED |
| FIX-008 | Absorbed into WP-2, WP-5, WP-6 | WP-2, WP-5, WP-6 |
| FIX-009 | Absorbed into FIX-MED | FIX-MED |
| ADR-016 | Absorbed into WP-4 | WP-4 |
| ADR-019 | Absorbed into WP-7 | WP-7 |
| ADR-020 | Absorbed into WP-5 | WP-5 |
| ADR-021 | Absorbed into WP-6 | WP-6 |

## Done

| ID | Division | Completed | Output |
|----|----------|-----------|--------|
| PLAN-001 | arch | 0207T2200 | docs/plan/v2-open-items-decisions.md |
| ADR-013 | arch | 0207T2200 | docs/adr/013-six-layer-memory-architecture.md |
| ADR-014 | arch | 0207T2200 | docs/adr/014-cross-channel-session-router.md |
| PLAN-002 | arch | 0207T2330 | docs/plan/openapi-v1.yaml, docs/plan/websocket-protocol.md |
| PLAN-003 | arch | 0207T2330 | docs/plan/migration-strategy.md |
| ADR-015 | arch | 0207T2330 | docs/adr/015-adaptive-decay-v2.md |
| RES-001 | research | 0207T2138 | docs/research/RES-001-pgvector-index-comparison.md |
| RES-002 | research | 0208T0030 | docs/research/RES-002-typescript-token-counting.md |
| RES-003 | research | 0208T0030 | docs/research/RES-003-gemini-embedding-comparison.md |
| RES-004 | research | 0208T0030 | docs/research/RES-004-webchat-spa-framework.md |
| RES-005 | research | 0208T0030 | docs/research/RES-005-github-actions-ci-cd.md |
| QA-001 | quality | 0207T2133 | 3 HIGH, 5 MEDIUM, 1 LOW issues found |
| QA-002 | quality | 0207T2133 | 20/23 claude_reports mapped, 3 MEDIUM gaps |
| QA-003 | quality | 0208T0037 | 5 HIGH, 4 MEDIUM, 1 LOW issues found (feasibility review) |
| QA-004 | quality | 0208T0106 | 2 HIGH, 2 MEDIUM, 1 LOW issues found (cross-reference integrity) |
| QA-005 | quality | 0208T0212 | 3 HIGH, 4 MEDIUM, 3 LOW issues found (security design review) |
| QA-006 | quality | 0208T0313 | 8 HIGH, 4 MEDIUM, 1 LOW issues found (implementability review) |
| QA-007 | quality | 0208T0413 | Comprehensive review summary: 45 issues synthesized, 4 root causes, 7 work packages defined |
| WP-1 | arch | 0208T0830 | docs/adr/001-*.md ~ 012-*.md (12 ADR files created) |
| WP-2 | arch | 0208T0830 | docs/plan/axel-project-plan.md (Section 3.5 core domain types) |
| WP-3 | arch | 0208T0830 | docs/plan/axel-project-plan.md (7 factual corrections) |
| WP-5 | arch | 0208T0830 | docs/adr/020-error-taxonomy.md |
| WP-6 | arch | 0208T0830 | docs/adr/021-resilience-patterns.md |
| WP-7 | arch | 0208T0830 | docs/adr/019-auth-strategy.md |
| ADR-017 | arch | 0208T0830 | docs/adr/017-webchat-spa-framework.md |
| ADR-018 | arch | 0208T0830 | docs/adr/018-token-counting-strategy.md |
| WP-4 | arch | 0208T0930 | docs/adr/003-redis-working-memory.md, docs/plan/axel-project-plan.md (Redis PG-first, error handling) |
| QA-008 | quality | 0208T0955 | Quality gate re-verification: 3 PASS, 2 CONDITIONAL PASS. 23 errors confirmed resolved. 3 new issues found. |
| FIX-MED | arch | 0208T1130 | docs/plan/axel-project-plan.md — 22 MEDIUM/LOW issues resolved |
| QA-009 | quality | 0208T1335 | ALL 5 CONSTITUTION §3 quality gates PASS. PLAN FINALIZATION APPROVED. |
| AUDIT-001 | audit | 0208T2100 | 34 findings (22 HIGH, 8 MEDIUM, 4 LOW). Embedding 768d→3072d + factual accuracy audit. |
| EMBED-3072 | arch | 0208T2100 | 6 files updated: ADR-016, plan body, v2-open-items, migration-strategy, ADR-013, ADR-002. 768d→3072d applied. |
| QA-010 | quality | 0208T2115 | Proactive 768d→3072d impact analysis. 2 HIGH + 3 MEDIUM issues. Drift check PASS. |
| FIX-AUDIT | arch | 0209T0030 | ERR-050~056 (7 items) + AUD-023~026 (4 MEDIUM). ADR-016, v2-open-items, migration-strategy, plan v2.0.3. |
| AUDIT-002 | audit | 0209T0031 | Follow-up verification: 4 HIGH, 5 MEDIUM, 2 LOW findings. Most HIGH overlap with FIX-AUDIT scope. |
| QA-011 | quality | 0209T0335 | PLAN CLOSURE APPROVED: 4 PASS, 1 CONDITIONAL PASS. 3 MEDIUM non-blocking issues. ERR-050~056 verified. |
