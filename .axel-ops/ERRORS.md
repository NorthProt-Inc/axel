# Errors & Blockers

> Managed by Coordinator. Divisions report errors via comms.
>
> **Cycle 94 (CTO update)**: 3 errors open (2 CRITICAL, 1 HIGH). QC 시스템이 발견한 build/typecheck 실패.

## Open

| ID | Severity | Description | Reported | Assigned To |
|----|----------|-------------|----------|-------------|
| ERR-087 | CRITICAL | `pnpm typecheck` FAILS — packages/core/src/decay/types.ts:2 unused `import type { MemoryType }`. CI pipeline broken. | C94 | FIX-TYPECHECK-001 (dev-core) |
| ERR-088 | CRITICAL | `pnpm build` FAILS — apps/axel/src/container.ts:229 PgPool type mismatch (rows: unknown[] vs T[]), :244 GoogleGenAIClient exactOptionalPropertyTypes incompatible. Production build blocked. | C94 | FIX-CONTAINER-001 (dev-edge) |
| ERR-089 | HIGH | tools/migrate/src/cli.ts:12+ — 11× TS4111 errors. `noUncheckedIndexedAccess` requires bracket notation for process.env access. Build pipeline includes this package. | C94 | FIX-MIGRATE-CLI-001 (devops) |

## Resolved

| ID | Resolution | Resolved By | Date |
|----|------------|-------------|------|
| ERR-086 | FIX-PUNYCODE-001 수정(packageExtensions + postinstall script)이 이미 정상 작동중. 975 tests pass, 0 FAIL. telegram 25 tests pass. Mark가 cycle.sh 소유범위 수정(7718b97) + 유실 산출물 복구(217cdc8)로 해결. | FIX-PUNYCODE-002 (devops) + Mark (Human) | 0208C85 |
|----|------------|-------------|------|
| ERR-085 | `migration-strategy.md` 업데이트: 디렉토리 구조, messages 컬럼, 007/008 migration, Execution Order 반영. | FIX-MIGRATION-002 (coord CTO override) | 0208C77 |
| ERR-082 | Migration 002 messages 테이블에 `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()` + `token_count INTEGER NOT NULL DEFAULT 0` 컬럼 추가. | FIX-MIGRATION-001 (devops) | 0208C75 |
| ERR-083 | Migration 007 ALTER COLUMN TYPE USING subquery → `DO $$` conditional block 방식으로 재작성 (PG 호환). | FIX-MIGRATION-001 (devops) | 0208C75 |
| ERR-084 | 008_session_summaries.sql 신규 migration 생성. session_summaries 테이블 + down migration. | FIX-MIGRATION-001 (devops) | 0208C75 |

| ID | Resolution | Resolved By | Date |
|----|------------|-------------|------|
| ERR-076 | Runtime deps factory 구현: `apps/axel/src/runtime-deps.ts` 생성, `main.ts` bootstrap 호출 추가, `.env` AXEL_ 변수, `package.json` dev 스크립트. | **Mark (Human)** | Runtime bootstrap |
| ERR-077 | Node.js `.ts` 실행 불가: `tsx` devDependency 추가, dev 스크립트 `node` → `tsx` 변경. | **Mark (Human)** | Runtime bootstrap |
| ERR-078 | `sessions` 테이블 drift: `last_activity_at` 컬럼 누락 + `channel_history` JSONB→TEXT[] 변환. docker exec로 적용. | **Mark (Human)** | Runtime bootstrap |
| ERR-079 | `messages` 테이블 drift: `created_at`, `token_count` 컬럼 누락. docker exec로 추가. | **Mark (Human)** | Runtime bootstrap |
| ERR-080 | `session_summaries` 테이블 누락. docker exec로 생성. | **Mark (Human)** | Runtime bootstrap |
| ERR-081 | Anthropic SDK `messages.create({stream:true})` → `Promise<Stream>` 반환하나 `ContainerDeps`는 `AsyncIterable` 기대. `runtime-deps.ts`에 async generator bridge 적용. | **Mark (Human)** | Runtime bootstrap |
| ERR-069 | pgvector 2000d limit resolved: **Mark(Human) approved 1536d Matryoshka truncation** and directly applied changes across 16 files (source, tests, ADRs, plan docs, SQL migration). HNSW index now active. 835 tests pass. Commits: `6120a90` (auto CTO cycle) + `228a146` (plan docs). | **Mark (Human)** | 0208C68 |
| ERR-075 | Hardcoded DB credentials removed from migrate CLI. Env vars enforced (DATABASE_URL or PG*). 5 new tests. 806 tests pass. AUD-083 resolved. | FIX-AUDIT-E-003 (devops) | 0208C63 |

| ID | Resolution | Resolved By | Date |
|----|------------|-------------|------|
| ERR-070 | Sessions table schema drift fixed: channel_history JSONB→TEXT[], last_activity_at TIMESTAMPTZ added, idx_sessions_user updated. migration-strategy.md + 002_episodic_memory.sql aligned with PgSessionStore. | FIX-SCHEMA-001 (coord CTO override) | 0208C62 |
| ERR-074 | Missing timestamp fixed — gateway adds `timestamp: Date.now()` in HTTP chat, SSE stream, WS handler. HandleMessage type updated. AUD-082 resolved. | FIX-AUDIT-E-001 (dev-edge) | 0208C61 |
| ERR-073 | InboundHandler silent error discard fixed — onError callback with ErrorInfo interface. Backward compatible. AUD-081 resolved. | FIX-AUDIT-E-002 (dev-core) | 0208C61 |
| ERR-072 | Rate limit bucket memory leak fixed — evictStaleBuckets() lazy cleanup of entries >2x window age. getRateLimitBucketCount() for observability. AUD-080 resolved. | FIX-AUDIT-E-001 (dev-edge) | 0208C61 |
| ERR-071 | WS message size limit fixed — MAX_WS_MESSAGE_BYTES=65536, Buffer size check, close 1009 on overflow. AUD-079 resolved. | FIX-AUDIT-E-001 (dev-edge) | 0208C61 |
| ERR-068 | 32KB request body size limit implemented — streaming byte accumulator, 413 Payload Too Large. AUD-067 resolved. | FIX-GATEWAY-001 (dev-edge) | 0208C55 |
| ERR-067 | In-memory sliding window rate limiting — per-IP request counting, 60s window, 429+Retry-After. /health exempt. AUD-066 resolved. | FIX-GATEWAY-001 (dev-edge) | 0208C55 |
| ERR-066 | WS auth replaced from query param to ADR-019 first-message pattern — {type:'auth',token:...} first frame, 5s timeout, 4001 close on failure. AUD-065 resolved. | FIX-GATEWAY-001 (dev-edge) | 0208C55 |
| ERR-065 | zod dependency resolve fixed — pnpm install regenerated symlink, @testcontainers/postgresql added. 475 tests, 0 skips. | FIX-INFRA-001 (devops) | 0208C47 |
| ERR-064 | Dev-infra root package.json/pnpm-lock.yaml modification — minor ownership overlap, no functional impact. Already resolved via merge. | coord | 0208C47 |
| ENV-001 | Node.js 22.13.1 confirmed. pnpm 9.15.4 available (npx/packageManager). | CTO (coord) | 0208C31 |
| ERR-063 | Ownership violation file (packages/core/src/types/index.ts) already removed in SCAFFOLD-FIX (5b4de15). | SCAFFOLD-FIX (devops) | 0208C31 |
| ERR-060 | ADR-013:144,171-174 IVFFlat→HNSW rewritten. Comparison table + index decision section aligned. | FIX-PRE-IMPL (arch) | 0209 |
| ERR-061 | migration-strategy:372,377-393 IVFFlat text→HNSW. Execution order + index note rewritten. | FIX-PRE-IMPL (arch) | 0209 |
| ERR-062 | plan:843-853 hot_memories MV INNER JOIN→LEFT JOIN LATERAL aligned with migration-strategy. | FIX-PRE-IMPL (arch) | 0209 |
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
