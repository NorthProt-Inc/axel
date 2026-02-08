# Errors & Blockers

> Managed by Coordinator. Divisions report errors via comms.

## Open

| ID | Severity | Reporter | Date | Description | Assigned |
|----|----------|----------|------|-------------|----------|
| ERR-001 | HIGH | quality | 0207 | IVFFlat lists param inconsistency (sqrt(N)*10=316 vs 100). RES-001 recommends HNSW — may obsolete IVFFlat. | FIX-001 |
| ERR-002 | HIGH | quality | 0207 | Zod MemoryConfigSchema missing 6 decay parameters | FIX-001 |
| ERR-003 | HIGH | quality | 0207 | ADR-001~012 confirmed but no files in docs/adr/ | FIX-002 |
| ERR-004 | MEDIUM | quality | 0207 | Memory layer naming collision with Turtle Stack layers | FIX-001 |
| ERR-005 | MEDIUM | quality | 0207 | Dual embedding interface (LlmProvider.embed() vs EmbeddingService) | FIX-001 |
| ERR-006 | MEDIUM | quality | 0207 | Context Assembler I/O injection pattern undocumented | FIX-001 |
| ERR-007 | MEDIUM | quality | 0207 | channelMentions field ambiguity (distinct count vs sum) | FIX-001 |
| ERR-008 | MEDIUM | quality | 0207 | claude_reports #08, #13, #21 missing Axel mappings | FIX-001 |
| ERR-009 | LOW | quality | 0207 | InboundHandler type not defined in plan | FIX-001 |
| ERR-010 | **HIGH** | quality | 0208 | Redis usage violates PG single DB principle (MISSION #2). Session Router stores state exclusively in Redis with no PG fallback. Stream Buffer entirely Redis Streams. ADR-002/003 tension unresolved. | FIX-003, ADR-016 |
| ERR-011 | **HIGH** | quality | 0208 | text-embedding-004 deprecated Jan 2026. Plan references it in 3 locations. Successor: gemini-embedding-001. | FIX-003 |
| ERR-012 | **HIGH** | quality | 0208 | tiktoken wrong for Claude tokenization. Should use Anthropic SDK count_tokens. | FIX-003 |
| ERR-013 | **HIGH** | quality | 0208 | IVFFlat formula 'sqrt(N)*10' not from pgvector docs. For <10K vectors, sequential scan or HNSW is better. Supersedes ERR-001 with corrected source. | FIX-003 |
| ERR-014 | **HIGH** | quality | 0208 | Gemini Flash '<50ms' intent classification claim impossible via API (TTFT ~300ms min). Needs local model or revised target. | FIX-003 |
| ERR-015 | MEDIUM | quality | 0208 | Zod v4 breaking API changes from v3. Plan examples may be against v3 API. | FIX-004 |
| ERR-016 | MEDIUM | quality | 0208 | countTokens() conflates sync and async — Anthropic requires API call, tiktoken is sync. | FIX-004 |
| ERR-017 | MEDIUM | quality | 0208 | TTFT '500ms 이내' not achievable as guarantee. Realistic: p50 ~400-500ms, p95 ~700-1000ms. | FIX-004 |
| ERR-018 | MEDIUM | quality | 0208 | Docker cold start '<30s' only with cached images. First deploy exceeds 30s. | FIX-004 |
| ERR-019 | LOW | quality | 0208 | tsdown attribution: 'OpenClaw 동일' should be 'Rolldown ecosystem'. | FIX-004 |
| ERR-020 | **HIGH** | quality | 0208 | ToolDefinition type ownership: defined in MCP registry but used by LLM module. Creates reversed dependency (LLM→MCP instead of MCP→LLM). | FIX-003 |
| ERR-021 | **HIGH** | quality | 0208 | Migration direction REVERSED in Section 5.2 line 1427: says 'embedding-001→text-embedding-004' but text-embedding-004 is deprecated. Contradicts Section 11 and ERR-011. | FIX-003 |
| ERR-022 | MEDIUM | quality | 0208 | EmbeddingService.embed() singular vs LlmProvider.embed() plural signature inconsistency. ContextAssembler usage unclear. | FIX-004 |
| ERR-023 | MEDIUM | quality | 0208 | Triple Layer numbering confusion: Package L0-L7 labels vs Turtle Stack Layer 0-10 vs Memory Layer 0-5. Package labels don't map to Turtle layers. | FIX-004 |

## Resolved

| ID | Resolution | Resolved By | Date |
|----|------------|-------------|------|
