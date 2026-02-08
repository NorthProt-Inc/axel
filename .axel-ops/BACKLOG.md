# BACKLOG

> Managed by Coordinator only. Other Divisions request changes via comms.
>
> **Cycle 10**: WP-1~3, WP-5~7, ADR-017/018 completed. 8 tasks moved to Done.
> WP-4 and FIX-MED dependencies resolved, moved to Queued-assignable.
> QA-008 created for quality gate re-verification.

## Queued

| ID | Priority | Division | Task | Depends | Created |
|----|----------|----------|------|---------|---------|
| WP-4 | P0 | arch | Redis role clarification: redefine Redis as ephemeral cache with PG shadow writes. Update ADR-003, create ADR-016 (Redis Role Redefinition). Add degradation paths for Redis unavailability. Absorbs ERR-010, ERR-038. | — | 0208 |
| FIX-MED | P1 | arch | MEDIUM/LOW issues batch (17 items): Zod v4 compat (ERR-015), countTokens async (ERR-016), TTFT target revision (ERR-017), Docker cold start qualifier (ERR-018), tsdown attribution (ERR-019), EmbeddingService signature (ERR-022), layer numbering (ERR-023), channel reconnection (ERR-042), streaming error handling (ERR-044), persona hot-reload (ERR-045), meta memory feedback (ERR-046), DI container completeness (ERR-034), credential redaction (ERR-032), default allowlist (ERR-031), security test cases (ERR-033), naming collision (ERR-004), dual embedding (ERR-005), context assembler I/O (ERR-006), mentions ambiguity (ERR-007), claude_reports gaps (ERR-008), InboundHandler (ERR-009). | WP-4 | 0208 |
| QA-008 | P0 | quality | Quality gate re-verification: review all WP-1~7 outputs (ADR-001~021, plan Section 3.5, factual corrections). Re-assess 5 CONSTITUTION quality gates. Determine if ERR-QG1 can be fully resolved. | — | 0208 |

## In Progress

| ID | Division | Started | ETA |
|----|----------|---------|-----|
| WP-4 | arch | 0208T0830 | 0208T0930 |
| QA-008 | quality | 0208T0830 | 0208T0930 |

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
