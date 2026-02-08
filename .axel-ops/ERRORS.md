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
| ERR-024 | **HIGH** | quality | 0208 | Gateway auth model underspecified: no JWT details (algorithm, secret mgmt, expiry/refresh, token transport). No ADR for auth strategy. | FIX-006 |
| ERR-025 | **HIGH** | quality | 0208 | WebSocket endpoint has no authentication/authorization. Unauthenticated WS allows streaming conversation data. | FIX-006 |
| ERR-026 | **HIGH** | quality | 0208 | executeCommandTool validates command name but NOT args array or cwd path. Allows malicious arguments (e.g., git push --force) and path traversal via cwd. | FIX-006 |
| ERR-027 | MEDIUM | quality | 0208 | SecurityConfigSchema missing: JWT config, CORS origins, HTTPS enforcement, session timeout, max body size, webhook secrets, per-route rate limiting. | FIX-006 |
| ERR-028 | MEDIUM | quality | 0208 | Webhook endpoints (Telegram/Discord) lack signature verification — forged messages accepted as legitimate input. Prompt injection vector. | FIX-006 |
| ERR-029 | MEDIUM | quality | 0208 | Prompt injection defense relies solely on regex blocklist + wrapping. No system prompt instruction spec, no output sanitization, no canary tokens. | FIX-006 |
| ERR-030 | MEDIUM | quality | 0208 | Migration chromadb-extractor.ts uses Python subprocess — violates ADR-001 TS single stack and reintroduces shell injection risk (claude_reports #01). | FIX-006 |
| ERR-031 | LOW | quality | 0208 | Default command allowlist includes docker/docker-compose/node — privilege escalation risk. Should follow least-privilege principle. | FIX-007 |
| ERR-032 | LOW | quality | 0208 | DB/Redis connection URLs contain credentials; no redaction spec for error logs. interaction_logs.error could leak connection strings. | FIX-007 |
| ERR-033 | LOW | quality | 0208 | Security test cases (Section 6.4) missing: JWT expiry, WS auth, webhook signature, SQL injection, rate limiting, CORS preflight tests. | FIX-007 |
| ERR-034 | **HIGH** | quality | 0208 | DI container covers only 2 of ~15 injectable services. Missing: PersonaEngine, LlmProvider (×3), SessionRouter, AxelChannel (×4), ContextAssembler, ModelRouter, CircuitBreaker, RetryHandler, ToolRegistry. No implementation class names. | FIX-008 |
| ERR-035 | **HIGH** | quality | 0208 | Core domain types Memory, Message, MemoryEngine used in interfaces but never defined. Distributed agent cannot implement services without type shapes. | FIX-008 |
| ERR-036 | **HIGH** | quality | 0208 | ReAct loop has zero error handling. No try/catch around llmProvider.chat() or executeTool(). totalTimeoutMs never enforced. No partial result on maxIterations. | FIX-008 |
| ERR-037 | **HIGH** | quality | 0208 | No error type hierarchy. ToolError, HttpError, FailoverError, classifyError() mentioned but never defined. No base type, no category enum. | FIX-008, ADR-020 |
| ERR-038 | **HIGH** | quality | 0208 | Redis serves 5 critical functions with zero error handling. No fallback, no reconnection strategy, no degradation paths. Compounds ERR-010. | FIX-008, ADR-021 |
| ERR-039 | **HIGH** | quality | 0208 | Memory consolidation (L2→L3) entirely unspecified. No algorithm, no duplicate detection, no importance scoring, no trigger mechanism. | FIX-008 |
| ERR-040 | **HIGH** | quality | 0208 | Graceful shutdown unspecified. No SIGTERM handling, no shutdown ordering, no Redis-to-PG flush. Docker 10s grace vs 300s totalTimeout = guaranteed data loss. | FIX-008, ADR-021 |
| ERR-041 | **HIGH** | quality | 0208 | Session lifecycle has no state machine. No SessionState enum, no idle-to-ended transition handler, no archival mechanism, no concurrent session policy. | FIX-008 |
| ERR-042 | MEDIUM | quality | 0208 | AxelChannel interface lacks reconnection lifecycle. No reconnect(), no onDisconnect, no reconnection backoff. HealthStatus type undefined. | FIX-009 |
| ERR-043 | MEDIUM | quality | 0208 | Circuit Breaker has config but no state machine (closed/open/half-open). No integration with fallback chain. Scoped only to LLM. | FIX-009, ADR-021 |
| ERR-044 | MEDIUM | quality | 0208 | Streaming pipeline no error handling. No partial response recovery, no client disconnect detection, no abort mechanism, no backpressure. | FIX-009 |
| ERR-045 | MEDIUM | quality | 0208 | PersonaEngine hot-reload has no in-flight request handling. No atomic swap, no file-watch trigger, no malformed input recovery. | FIX-009 |
| ERR-046 | LOW | quality | 0208 | Meta Memory (L5) feedback loop to L0 Speculative Prefetch described conceptually but no mechanism defined. | FIX-009 |

## Resolved

| ID | Resolution | Resolved By | Date |
|----|------------|-------------|------|
