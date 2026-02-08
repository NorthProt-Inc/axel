# Errors & Blockers

> Managed by Coordinator. Divisions report errors via comms.
>
> **Cycle 10**: WP-1~7 + ADR-017/018 completed (commit 15351d8). 23 errors resolved.
> ERR-QG1 downgraded to PENDING — requires QA-008 re-verification of quality gates.
> Open: 24 (2 HIGH, 12 MEDIUM, 5 LOW, 1 PENDING). Resolved: 23.

## Open

| ID | Severity | Reporter | Date | Description | Assigned |
|----|----------|----------|------|-------------|----------|
| ERR-QG1 | **PENDING** | quality | 0208 | QUALITY GATE re-assessment needed. WP-1~7 resolved all 21 HIGH issues cited in original finding. Quality must re-verify all 5 gates via QA-008. Downgraded from CRITICAL. | QA-008 |
| ERR-004 | MEDIUM | quality | 0207 | Memory layer naming collision with Turtle Stack layers | FIX-MED |
| ERR-005 | MEDIUM | quality | 0207 | Dual embedding interface (LlmProvider.embed() vs EmbeddingService) | FIX-MED |
| ERR-006 | MEDIUM | quality | 0207 | Context Assembler I/O injection pattern undocumented | FIX-MED |
| ERR-007 | MEDIUM | quality | 0207 | channelMentions field ambiguity (distinct count vs sum) | FIX-MED |
| ERR-008 | MEDIUM | quality | 0207 | claude_reports #08, #13, #21 missing Axel mappings | FIX-MED |
| ERR-009 | LOW | quality | 0207 | InboundHandler type not defined in plan | FIX-MED |
| ERR-010 | **HIGH** | quality | 0208 | Redis usage violates PG single DB principle (MISSION #2). | WP-4 |
| ERR-015 | MEDIUM | quality | 0208 | Zod v4 breaking API changes from v3. | FIX-MED |
| ERR-016 | MEDIUM | quality | 0208 | countTokens() conflates sync and async. | FIX-MED |
| ERR-017 | MEDIUM | quality | 0208 | TTFT '500ms 이내' not achievable as guarantee. | FIX-MED |
| ERR-018 | MEDIUM | quality | 0208 | Docker cold start '<30s' only with cached images. | FIX-MED |
| ERR-019 | LOW | quality | 0208 | tsdown attribution incorrect. | FIX-MED |
| ERR-022 | MEDIUM | quality | 0208 | EmbeddingService.embed() signature inconsistency. | FIX-MED |
| ERR-023 | MEDIUM | quality | 0208 | Triple layer numbering confusion. | FIX-MED |
| ERR-031 | LOW | quality | 0208 | Default command allowlist too permissive. | FIX-MED |
| ERR-032 | LOW | quality | 0208 | No credential redaction spec for error logs. | FIX-MED |
| ERR-033 | LOW | quality | 0208 | Security test cases missing. | FIX-MED |
| ERR-034 | **HIGH** | quality | 0208 | DI container covers only 2 of ~15 injectable services. | FIX-MED |
| ERR-038 | **HIGH** | quality | 0208 | Redis 5 critical functions with zero error handling. | WP-4 |
| ERR-042 | MEDIUM | quality | 0208 | AxelChannel lacks reconnection lifecycle. | FIX-MED |
| ERR-044 | MEDIUM | quality | 0208 | Streaming pipeline no error handling. | FIX-MED |
| ERR-045 | MEDIUM | quality | 0208 | PersonaEngine hot-reload unspecified. | FIX-MED |
| ERR-046 | LOW | quality | 0208 | Meta Memory feedback loop no mechanism. | FIX-MED |

## Resolved

| ID | Resolution | Resolved By | Date |
|----|------------|-------------|------|
| ERR-QG2 | ADR-001~012 created. 12 confirmed ADRs now have formal files. | WP-1 (arch) | 0208 |
| ERR-001 | IVFFlat→HNSW index strategy updated in plan. | WP-3 (arch) | 0208 |
| ERR-002 | Zod MemoryConfigSchema decay parameters added. | WP-3 (arch) | 0208 |
| ERR-003 | ADR-001~012 batch created. | WP-1 (arch) | 0208 |
| ERR-011 | text-embedding-004 refs removed from plan. | WP-3 (arch) | 0208 |
| ERR-012 | tiktoken→Anthropic SDK countTokens corrected. | WP-3 (arch) | 0208 |
| ERR-013 | IVFFlat formula replaced with HNSW params. | WP-3 (arch) | 0208 |
| ERR-014 | Gemini Flash latency corrected to ~300-500ms. | WP-3 (arch) | 0208 |
| ERR-020 | ToolDefinition type moved to core domain. | WP-3 (arch) | 0208 |
| ERR-021 | Migration direction fixed to re-embed. | WP-3 (arch) | 0208 |
| ERR-024 | Gateway auth model specified in ADR-019. | WP-7 (arch) | 0208 |
| ERR-025 | WebSocket first-message auth with 5s timeout. | WP-7 (arch) | 0208 |
| ERR-026 | Command args/cwd validation specified. | WP-7 (arch) | 0208 |
| ERR-027 | SecurityConfigSchema fields addressed in ADR-019. | WP-7 (arch) | 0208 |
| ERR-028 | Webhook signature verification specified. | WP-7 (arch) | 0208 |
| ERR-029 | 4-layer prompt injection defense specified. | WP-7 (arch) | 0208 |
| ERR-030 | Migration subprocess TS-only via better-sqlite3+parquet-wasm. | WP-7 (arch) | 0208 |
| ERR-035 | Core domain types defined in plan Section 3.5. | WP-2 (arch) | 0208 |
| ERR-036 | ReAct loop error handling specified in ADR-020. | WP-5 (arch) | 0208 |
| ERR-037 | Error type hierarchy defined in ADR-020. | WP-5 (arch) | 0208 |
| ERR-039 | Memory consolidation L2→L3 algorithm specified. | WP-6 (arch) | 0208 |
| ERR-040 | Graceful shutdown 4-phase sequence specified. | WP-6 (arch) | 0208 |
| ERR-041 | Session state machine with 7 states specified. | WP-6 (arch) | 0208 |
| ERR-043 | Circuit breaker state machine specified. | WP-6 (arch) | 0208 |
