# BACKLOG

> Managed by Coordinator only. Other Divisions request changes via comms.

## Queued

| ID | Priority | Division | Task | Depends | Created |
|----|----------|----------|------|---------|---------|
| FIX-003 | P0 | arch | QA-003 HIGH issues: Redis/PG role clarification, embedding model update, tiktoken removal, IVFFlat formula fix, Gemini Flash latency + QA-004 HIGH: ToolDefinition type ownership, migration direction reversal | FIX-001 | 0208 |
| ADR-016 | P0 | arch | Redis role redefinition ADR — resolve ADR-002/003 tension, PG as authoritative source, Redis as ephemeral cache | FIX-003 | 0208 |
| FIX-004 | P1 | arch | QA-003+004 MEDIUM/LOW issues: Zod v4 compat, countTokens async, TTFT target revision, Docker cold start qualifier, tsdown attribution, EmbeddingService signature, Layer numbering cleanup | FIX-003 | 0208 |
| FIX-005 | P1 | arch | QA-004 standalone fixes not requiring FIX-003: ToolDefinition → core/types extraction, migration direction text fix | — | 0208 |
| ADR-017 | P1 | arch | Svelte 5 WebChat SPA decision ADR (based on RES-004) | — | 0208 |
| ADR-018 | P1 | arch | Token counting strategy ADR: Anthropic SDK countTokens + per-model strategy (based on RES-002) | — | 0208 |
| FIX-006 | P0 | arch | QA-005 security HIGH issues: auth strategy ADR needed (JWT vs static bearer), WS auth, command args validation, webhook signatures, prompt injection defense, migration subprocess TS-only | FIX-001 | 0208 |
| ADR-019 | P0 | arch | Authentication strategy ADR — JWT vs static bearer for single-user MVP, token transport, WS auth | FIX-006 | 0208 |
| FIX-007 | P2 | arch | QA-005 security LOW issues: docker/node in default allowlist, credential redaction in logs, missing security test cases | FIX-006 | 0208 |
| FIX-008 | P0 | arch | QA-006 HIGH issues: complete DI container spec, define core types (Memory, Message, MemoryEngine), ReAct loop error handling, error type hierarchy, Redis failure modes, memory consolidation algorithm, graceful shutdown, session state machine | FIX-001 | 0208 |
| ADR-020 | P0 | arch | Error Taxonomy ADR — base AxelError class, subclasses (TransientError, PermanentError, ValidationError, AuthError, ProviderError, ToolError), category enum, classifyError() mapping | FIX-008 | 0208 |
| ADR-021 | P0 | arch | Resilience Patterns ADR — Redis degradation paths, circuit breaker state machine, graceful shutdown sequence, reconnection strategy | FIX-008 | 0208 |
| FIX-009 | P1 | arch | QA-006 MEDIUM/LOW issues: channel reconnection lifecycle, circuit breaker state machine, streaming error handling, persona hot-reload, meta memory feedback loop | FIX-008 | 0208 |

## In Progress

| ID | Division | Started | ETA |
|----|----------|---------|-----|
| FIX-001 | arch | 0207T2200 | — |
| FIX-002 | arch | 0207T2200 | — |

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
