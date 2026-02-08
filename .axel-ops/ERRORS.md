# Errors & Blockers

> Managed by Coordinator. Divisions report errors via comms.
>
> **Cycle 7**: Assigned column updated from cancelled FIX-IDs to Work Package IDs.
> Added 2 CRITICAL quality gate findings from QA-007. Total: 48 open (21 HIGH, 18 MEDIUM, 6 LOW, 2 CRITICAL).

## Open

| ID | Severity | Reporter | Date | Description | Assigned |
|----|----------|----------|------|-------------|----------|
| ERR-QG1 | **CRITICAL** | quality | 0208 | QUALITY GATE NOT MET: 5 gates assessed — Consistency NOT MET (3 HIGH contradictions), Completeness PARTIAL, Traceability PARTIAL, Feasibility NOT MET (3 HIGH factual errors). Plan CANNOT be finalized. | WP-1~7 |
| ERR-QG2 | **CRITICAL** | quality | 0208 | 12 ADRs declared 'confirmed' in plan but ZERO files exist in docs/adr/ (only .gitkeep + ADR-013/014/015). Single largest documentation gap. | WP-1 |
| ERR-001 | HIGH | quality | 0207 | IVFFlat lists param inconsistency. RES-001 recommends HNSW. Superseded by ERR-013. | WP-3 |
| ERR-002 | HIGH | quality | 0207 | Zod MemoryConfigSchema missing 6 decay parameters | WP-3 |
| ERR-003 | HIGH | quality | 0207 | ADR-001~012 confirmed but no files in docs/adr/ | WP-1 |
| ERR-004 | MEDIUM | quality | 0207 | Memory layer naming collision with Turtle Stack layers | FIX-MED |
| ERR-005 | MEDIUM | quality | 0207 | Dual embedding interface (LlmProvider.embed() vs EmbeddingService) | FIX-MED |
| ERR-006 | MEDIUM | quality | 0207 | Context Assembler I/O injection pattern undocumented | FIX-MED |
| ERR-007 | MEDIUM | quality | 0207 | channelMentions field ambiguity (distinct count vs sum) | FIX-MED |
| ERR-008 | MEDIUM | quality | 0207 | claude_reports #08, #13, #21 missing Axel mappings | FIX-MED |
| ERR-009 | LOW | quality | 0207 | InboundHandler type not defined in plan | FIX-MED |
| ERR-010 | **HIGH** | quality | 0208 | Redis usage violates PG single DB principle (MISSION #2). Session Router stores state exclusively in Redis with no PG fallback. | WP-4 |
| ERR-011 | **HIGH** | quality | 0208 | text-embedding-004 deprecated Jan 2026. Plan references it in 3 locations. | WP-3 |
| ERR-012 | **HIGH** | quality | 0208 | tiktoken wrong for Claude tokenization. Should use Anthropic SDK count_tokens. | WP-3 |
| ERR-013 | **HIGH** | quality | 0208 | IVFFlat formula 'sqrt(N)*10' not from pgvector docs. Supersedes ERR-001. | WP-3 |
| ERR-014 | **HIGH** | quality | 0208 | Gemini Flash '<50ms' impossible via API (TTFT ~300ms min). | WP-3 |
| ERR-015 | MEDIUM | quality | 0208 | Zod v4 breaking API changes from v3. | FIX-MED |
| ERR-016 | MEDIUM | quality | 0208 | countTokens() conflates sync and async. | FIX-MED |
| ERR-017 | MEDIUM | quality | 0208 | TTFT '500ms 이내' not achievable as guarantee. | FIX-MED |
| ERR-018 | MEDIUM | quality | 0208 | Docker cold start '<30s' only with cached images. | FIX-MED |
| ERR-019 | LOW | quality | 0208 | tsdown attribution incorrect. | FIX-MED |
| ERR-020 | **HIGH** | quality | 0208 | ToolDefinition type ownership: reversed dependency. | WP-3 |
| ERR-021 | **HIGH** | quality | 0208 | Migration direction REVERSED in Section 5.2. | WP-3 |
| ERR-022 | MEDIUM | quality | 0208 | EmbeddingService.embed() signature inconsistency. | FIX-MED |
| ERR-023 | MEDIUM | quality | 0208 | Triple layer numbering confusion. | FIX-MED |
| ERR-024 | **HIGH** | quality | 0208 | Gateway auth model underspecified. No ADR for auth strategy. | WP-7 |
| ERR-025 | **HIGH** | quality | 0208 | WebSocket endpoint has no authentication. | WP-7 |
| ERR-026 | **HIGH** | quality | 0208 | executeCommandTool args/cwd unvalidated. | WP-7 |
| ERR-027 | MEDIUM | quality | 0208 | SecurityConfigSchema missing critical fields. | FIX-MED |
| ERR-028 | MEDIUM | quality | 0208 | Webhook endpoints lack signature verification. | WP-7 |
| ERR-029 | MEDIUM | quality | 0208 | Prompt injection defense insufficient. | WP-7 |
| ERR-030 | MEDIUM | quality | 0208 | Migration uses Python subprocess — violates ADR-001. | WP-7 |
| ERR-031 | LOW | quality | 0208 | Default command allowlist too permissive. | FIX-MED |
| ERR-032 | LOW | quality | 0208 | No credential redaction spec for error logs. | FIX-MED |
| ERR-033 | LOW | quality | 0208 | Security test cases missing. | FIX-MED |
| ERR-034 | **HIGH** | quality | 0208 | DI container covers only 2 of ~15 injectable services. | FIX-MED |
| ERR-035 | **HIGH** | quality | 0208 | Core domain types never defined. | WP-2 |
| ERR-036 | **HIGH** | quality | 0208 | ReAct loop has zero error handling. | WP-5 |
| ERR-037 | **HIGH** | quality | 0208 | No error type hierarchy defined. | WP-5 |
| ERR-038 | **HIGH** | quality | 0208 | Redis 5 critical functions with zero error handling. | WP-4 |
| ERR-039 | **HIGH** | quality | 0208 | Memory consolidation entirely unspecified. | WP-6 |
| ERR-040 | **HIGH** | quality | 0208 | Graceful shutdown unspecified. | WP-6 |
| ERR-041 | **HIGH** | quality | 0208 | Session lifecycle has no state machine. | WP-6 |
| ERR-042 | MEDIUM | quality | 0208 | AxelChannel lacks reconnection lifecycle. | FIX-MED |
| ERR-043 | MEDIUM | quality | 0208 | Circuit Breaker has no state machine. | FIX-MED |
| ERR-044 | MEDIUM | quality | 0208 | Streaming pipeline no error handling. | FIX-MED |
| ERR-045 | MEDIUM | quality | 0208 | PersonaEngine hot-reload unspecified. | FIX-MED |
| ERR-046 | LOW | quality | 0208 | Meta Memory feedback loop no mechanism. | FIX-MED |

## Resolved

| ID | Resolution | Resolved By | Date |
|----|------------|-------------|------|
