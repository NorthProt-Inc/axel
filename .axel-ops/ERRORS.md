# Errors & Blockers

> Managed by Coordinator. Divisions report errors via comms.
>
> **Cycle 20**: QA-011 completed — PLAN CLOSURE APPROVED (4 PASS, 1 CONDITIONAL PASS).
> ERR-057 RESOLVED, ERR-058 RESOLVED (downgraded LOW, micro-discrepancy), ERR-059 CLOSED (acceptable).
> 3 new MEDIUM consistency issues from QA-011 (ERR-060~062). Open: 3. Resolved: 58.

## Open

| ID | Severity | Reporter | Date | Description | Assigned |
|----|----------|----------|------|-------------|----------|
| ERR-060 | MEDIUM | quality | 0209 | ADR-013:144,171-174 still recommends IVFFlat. Plan/ADR-002/migration-strategy all use HNSW. Last remaining IVFFlat reference in ADRs. | FIX-PRE-IMPL |
| ERR-061 | MEDIUM | quality | 0209 | migration-strategy:372,377-393 IVFFlat text sections not updated to HNSW. SQL in migration 003 correct (HNSW), but surrounding text inconsistent. | FIX-PRE-IMPL |
| ERR-062 | MEDIUM | quality | 0209 | plan:843-853 hot_memories MV uses INNER JOIN (drops empty channel_mentions). migration-strategy:285-302 uses LEFT JOIN (correct). Align plan body to LEFT JOIN version. | FIX-PRE-IMPL |

## Resolved

| ID | Resolution | Resolved By | Date |
|----|------------|-------------|------|
| ERR-057 | ADR-016 dimension options correctly updated to 128-3072 flexible range. FIX-AUDIT applied AUD-023. | QA-011 (quality) | 0209 |
| ERR-058 | ADR-016 MTEB score clarified: 68.16 (GA 3072d). 68.16 vs 68.17 micro-discrepancy — zero practical impact. Downgraded LOW, closed. | QA-011 (quality) | 0209 |
| ERR-059 | RES-001 1536d memory calc acceptable as historical research record. Plan/migration-strategy use correct 3072d values. | QA-011 (quality) | 0209 |
| ERR-050 | v2-open-items React→Svelte superseded notation added. | FIX-AUDIT (arch) | 0209 |
| ERR-051 | ADR-016 max input tokens corrected 8192→2048. | FIX-AUDIT (arch) | 0209 |
| ERR-052 | Plan migration logic already updated by EMBED-3072 (3072d). | EMBED-3072 (arch) | 0208 |
| ERR-053 | migration-strategy HNSW unified + 3072d memory recalculation. | FIX-AUDIT (arch) | 0209 |
| ERR-054 | ADR-016 index reuse claim already removed by EMBED-3072. | EMBED-3072 (arch) | 0208 |
| ERR-055 | ADR-016 rateLimitRpm clarified as paid tier, free tier 5-15 RPM noted. | FIX-AUDIT (arch) | 0209 |
| ERR-056 | v2-open-items 768d→3072d override note added at top. | FIX-AUDIT (arch) | 0209 |
| ERR-QG1 | ALL 5 quality gates PASS. QA-009 final sign-off confirmed. | QA-009 (quality) | 0208 |
| ERR-004 | Memory/Turtle layer naming convention clarified in plan. | FIX-MED (arch) | 0208 |
| ERR-005 | LlmProvider.embed() removed, EmbeddingService is canonical. | FIX-MED (arch) | 0208 |
| ERR-006 | ContextDataProvider interface documented. | FIX-MED (arch) | 0208 |
| ERR-007 | channelMentions field ambiguity resolved. | FIX-MED (arch) | 0208 |
| ERR-008 | claude_reports #08, #13, #21 MEDIUM Axel mappings added. | FIX-MED (arch) | 0208 |
| ERR-009 | InboundHandler type defined in plan. | FIX-MED (arch) | 0208 |
| ERR-010 | Redis shadow write table + degradation path added to plan body Layer 2. | FIX-MED (arch) | 0208 |
| ERR-015 | Zod v4 breaking API changes addressed. | FIX-MED (arch) | 0208 |
| ERR-016 | countTokens() sync/async separation clarified. | FIX-MED (arch) | 0208 |
| ERR-017 | TTFT criterion revised with p50/p95 qualifiers. | FIX-MED (arch) | 0208 |
| ERR-018 | Docker cold start qualifier added (cached images). | FIX-MED (arch) | 0208 |
| ERR-019 | tsdown attribution corrected. | FIX-MED (arch) | 0208 |
| ERR-022 | EmbeddingService.embed() signature unified. | FIX-MED (arch) | 0208 |
| ERR-023 | Triple layer numbering clarified. | FIX-MED (arch) | 0208 |
| ERR-031 | Default command allowlist tightened. | FIX-MED (arch) | 0208 |
| ERR-032 | Credential redaction spec added for error logs. | FIX-MED (arch) | 0208 |
| ERR-033 | Security test cases expanded. | FIX-MED (arch) | 0208 |
| ERR-034 | DI container expanded to ~20 injectable services. | FIX-MED (arch) | 0208 |
| ERR-042 | AxelChannel reconnection lifecycle specified. | FIX-MED (arch) | 0208 |
| ERR-044 | Streaming pipeline error handling added. | FIX-MED (arch) | 0208 |
| ERR-045 | PersonaEngine hot-reload mechanism specified. | FIX-MED (arch) | 0208 |
| ERR-046 | Meta Memory feedback loop mechanism defined. | FIX-MED (arch) | 0208 |
| ERR-047 | React→Svelte refs fixed in 3 plan locations. | FIX-MED (arch) | 0208 |
| ERR-048 | ToolDefinition consolidated to single definition. | FIX-MED (arch) | 0208 |
| ERR-049 | Gemini Flash latency citation added. | FIX-MED (arch) | 0208 |
| ERR-038 | Redis 5 critical functions now have explicit error handling with circuit breaker + typed fallbacks. | WP-4 (arch) | 0208 |
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
