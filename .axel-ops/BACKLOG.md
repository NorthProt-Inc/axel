# BACKLOG

> Managed by Coordinator only. Other Divisions request changes via comms.
>
> **Cycle 7 Restructure**: FIX-001~009 absorbed into 7 Work Packages per QA-007 root cause analysis.
> Dependency chains simplified. FIX-001/FIX-002 cancelled (6 cycles stalled, superseded).

## Queued

| ID | Priority | Division | Task | Depends | Created |
|----|----------|----------|------|---------|---------|
| WP-1 | P0 | arch | Batch-create ADR-001~012 files in docs/adr/. Each needs: title, status(confirmed), context, decision, consequences, alternatives. ADR-003 (Redis) needs clarification per ERR-010. Absorbs FIX-002, ERR-003. | — | 0208 |
| WP-2 | P0 | arch | Define core domain types in plan Section 3: Memory, Message, MemoryEngine, ToolResult, ReActEvent, SessionSummary, HealthStatus, SessionState. Absorbs ERR-035 part of FIX-008. | WP-1 | 0208 |
| WP-3 | P0 | arch | Factual corrections: (1) text-embedding-004→gemini-embedding-001 in 3 locations (ERR-011,021), (2) tiktoken→Anthropic SDK countTokens (ERR-012), (3) Gemini Flash latency '<50ms'→realistic target (ERR-014), (4) IVFFlat formula removal (ERR-013), (5) ToolDefinition type ownership (ERR-020), (6) migration direction text fix (ERR-021). Absorbs FIX-003 HIGH + FIX-005. | — | 0208 |
| WP-4 | P0 | arch | Redis role clarification: redefine Redis as ephemeral cache with PG shadow writes. Update ADR-003, create ADR-016 (Redis Role Redefinition). Add degradation paths for Redis unavailability. Absorbs ERR-010, ERR-038, ADR-016. | WP-1 | 0208 |
| WP-5 | P0 | arch | Error handling specification: (1) ADR-020 Error Taxonomy (AxelError base, TransientError, PermanentError, ValidationError, AuthError, ProviderError, ToolError), (2) ReAct loop try/catch + timeout enforcement (ERR-036), (3) error type hierarchy definition (ERR-037). Absorbs FIX-008 error items, ADR-020. | WP-2 | 0208 |
| WP-6 | P0 | arch | Lifecycle specification: (1) Session state machine with SessionState enum (ERR-041), (2) graceful shutdown sequence with SIGTERM handling (ERR-040), (3) memory consolidation L2→L3 algorithm (ERR-039), (4) ADR-021 Resilience Patterns (circuit breaker, reconnection, degradation). Absorbs FIX-008 lifecycle items, ADR-021. | WP-2 | 0208 |
| WP-7 | P0 | arch | Security specification: (1) ADR-019 Auth Strategy (JWT vs static bearer, token transport, WS auth), (2) WebSocket authentication (ERR-025), (3) command args + cwd validation (ERR-026), (4) webhook signature verification (ERR-028), (5) prompt injection defense beyond regex (ERR-029), (6) migration subprocess TS-only (ERR-030). Absorbs FIX-006, ADR-019. | — | 0208 |
| FIX-MED | P1 | arch | MEDIUM/LOW issues batch: Zod v4 compat (ERR-015), countTokens async (ERR-016), TTFT target revision (ERR-017), Docker cold start qualifier (ERR-018), tsdown attribution (ERR-019), EmbeddingService signature (ERR-022), layer numbering (ERR-023), SecurityConfigSchema (ERR-027), channel reconnection (ERR-042), circuit breaker state machine (ERR-043), streaming error handling (ERR-044), persona hot-reload (ERR-045), meta memory feedback (ERR-046), DI container completeness (ERR-034), credential redaction (ERR-032), default allowlist (ERR-031), security test cases (ERR-033). | WP-3,WP-5,WP-6,WP-7 | 0208 |
| ADR-017 | P1 | arch | Svelte 5 WebChat SPA decision ADR (based on RES-004) | — | 0208 |
| ADR-018 | P1 | arch | Token counting strategy ADR: Anthropic SDK countTokens + per-model strategy (based on RES-002) | — | 0208 |

## In Progress

| ID | Division | Started | ETA |
|----|----------|---------|-----|
| (none) | — | — | — |

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
