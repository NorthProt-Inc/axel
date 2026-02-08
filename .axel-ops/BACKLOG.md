# BACKLOG

> Managed by Coordinator only. Other Divisions request changes via comms.

## Queued

| ID | Priority | Division | Task | Depends | Created |
|----|----------|----------|------|---------|---------|
| FIX-003 | P0 | arch | QA-003 HIGH issues: Redis/PG role clarification, embedding model update, tiktoken removal, IVFFlat formula fix, Gemini Flash latency | FIX-001 | 0208 |
| ADR-016 | P0 | arch | Redis role redefinition ADR — resolve ADR-002/003 tension, PG as authoritative source, Redis as ephemeral cache | FIX-003 | 0208 |
| FIX-004 | P1 | arch | QA-003 MEDIUM/LOW issues: Zod v4 compat, countTokens async, TTFT target revision, Docker cold start qualifier, tsdown attribution | FIX-003 | 0208 |
| ADR-017 | P1 | arch | Svelte 5 WebChat SPA decision ADR (based on RES-004) | — | 0208 |
| ADR-018 | P1 | arch | Token counting strategy ADR: Anthropic SDK countTokens + per-model strategy (based on RES-002) | — | 0208 |
| QA-004 | P1 | quality | Review Research outputs RES-002~005 for quality gates (sources, accuracy, completeness) | — | 0208 |

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
