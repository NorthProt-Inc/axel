# BACKLOG

> Managed by Coordinator only. Other Divisions request changes via comms.
>
> **Cycle 37**: Phase B (Core Sprint) ACTIVE. CORE-004 + QA-012 in progress. SYNC-003 assigned to arch.

## Queued

| ID | Priority | Division | Task | Depends | Created |
|----|----------|----------|------|---------|---------|
| CORE-006 | P2 | dev-core | Orchestrator: ReAct loop, tool dispatch, session lifecycle (plan §4.6). TDD. | CORE-001 ✅, CORE-003 ✅, CORE-004, CORE-005 ✅ | 0208C31 |
| QA-013 | P1 | quality | Phase B review — memory layers (CORE-003). Verify: (1) ADR-013 M0-M5 interface compliance, (2) TDD protocol, (3) Package boundary §9, (4) No >400 line files, (5) Coverage targets. | QA-012 | 0208C36 |

## In Progress

| ID | Division | Started | ETA |
|----|----------|---------|-----|
| QA-012 | quality | 0208C34 | C37 |
| CORE-004 | dev-core | 0208C36 | C38 |
| SYNC-003 | arch | 0208C37 | C37 |

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
| FIX-PRE-IMPL | arch | 0209T0500 | 3 MEDIUM consistency fixes (ERR-060~062). ADR-013 IVFFlat→HNSW, migration-strategy IVFFlat→HNSW, plan hot_memories LEFT JOIN. Plan v2.0.4. |
| SCAFFOLD-001 | devops | 0208C31 | pnpm-workspace.yaml, package.json |
| SCAFFOLD-002 | devops | 0208C31 | tsconfig.base.json |
| SCAFFOLD-003 | devops | 0208C31 | biome.json |
| SCAFFOLD-004 | devops | 0208C31 | packages/*/package.json + tsconfig.json |
| SCAFFOLD-005 | devops | 0208C31 | vitest.config.ts (root + per-package) |
| SCAFFOLD-006 | devops | 0208C31 | docker/docker-compose.dev.yml |
| SCAFFOLD-FIX | devops+coord | 0208C31 | Ownership violation fixed, tsconfig.json/package.json/biome.json corrected, milestone verified |
| SYNC-001 | arch | 0208C33 | PLAN_SYNC.md: Phase A IN_SYNC, Phase B interface contracts with full spec cross-refs |
| CORE-001 | dev-core | 0208C33 | 10 src + 10 test files, 55 tests pass, Biome+tsc clean. Domain types implemented per plan §3.5. |
| SCAFFOLD-007 | devops | 0208C33 | .github/workflows/ci.yml — lint → typecheck → test, Node.js 22 + pnpm 9 |
| CORE-002 | dev-core | 0208C34 | 4 src + 3 test files (decay module). 34 tests, 100% stmt coverage. ADR-015 8-step formula. |
| CORE-005 | dev-core | 0208C34 | 4 src + 3 test files (persona module). 32 tests, 100% stmt coverage. PersonaEngine interface + buildSystemPrompt. |
| DEVOPS-001 | coord | 0208C34 | @vitest/coverage-v8 added. Barrel exports excluded from coverage. 93%+ global coverage. |
| CORE-003 | dev-core | 0208C36 | 8 src + 7 test files (memory layers M0-M5). 241 tests, 100% stmt, 95% branch. ADR-013 6-layer architecture. |
| SYNC-002 | arch | 0208C36 | PLAN_SYNC.md: B.1/B.2/B.5 IN_SYNC, A.3 IN_SYNC. No drift detected. |
