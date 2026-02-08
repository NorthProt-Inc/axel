# BACKLOG

> Managed by Coordinator only. Other Divisions request changes via comms.
>
> **Cycle 74 (CTO update)**: 4 runtime bootstrap errors discovered (ERR-082~085). Migration files need repair. 2 fix tasks created and assigned.

## Queued

(none)

## In Progress

| ID | Priority | Division | Task | Started |
|----|----------|----------|------|---------|
| FIX-MIGRATION-001 | P1 | devops | Fix migration files: (1) 002 messages 테이블에 `created_at TIMESTAMPTZ DEFAULT NOW()`, `token_count INTEGER DEFAULT 0` 컬럼 추가. (2) 007 ALTER COLUMN TYPE USING subquery → PG 호환 방식 재작성. (3) 008 migration 신규: `session_summaries` 테이블. ERR-082/083/084. | 0208C74 |
| FIX-MIGRATION-002 | P2 | arch | migration-strategy.md 업데이트: 007/008 마이그레이션 + messages 컬럼 변경사항 문서화. ERR-085. | 0208C74 |

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
| QA-012 | 5 cycles stalled (C34→C39). CORE-001 types already verified by SYNC-002. Scope absorbed into QA-013. | QA-013 |

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
| WP-4 | arch | 0208T0930 | docs/adr/003-redis-working-memory.md, docs/plan/axel-project-plan.md (Redis PG-first, error handling) |
| QA-008 | quality | 0208T0955 | Quality gate re-verification: 3 PASS, 2 CONDITIONAL PASS. 23 errors confirmed resolved. 3 new issues found. |
| FIX-MED | arch | 0208T1130 | docs/plan/axel-project-plan.md — 22 MEDIUM/LOW issues resolved |
| QA-009 | quality | 0208T1335 | ALL 5 CONSTITUTION §3 quality gates PASS. PLAN FINALIZATION APPROVED. |
| AUDIT-001 | audit | 0208T2100 | 34 findings (22 HIGH, 8 MEDIUM, 4 LOW). Embedding 768d→3072d + factual accuracy audit. |
| EMBED-3072 | arch | 0208T2100 | 6 files updated: ADR-016, plan body, v2-open-items, migration-strategy, ADR-013, ADR-002. 768d→3072d applied. |
| QA-010 | quality | 0208T2115 | Proactive 768d→3072d impact analysis. 2 HIGH + 3 MEDIUM issues. Drift check PASS. |
| FIX-AUDIT | arch | 0209T0030 | ERR-050~056 (7 items) + AUD-023~026 (4 MEDIUM). ADR-016, v2-open-items, migration-strategy, plan v2.0.3. |
| AUDIT-002 | audit | 0209T0031 | Follow-up verification: 4 HIGH, 5 MEDIUM, 2 LOW findings. Most HIGH overlap with FIX-AUDIT scope. |
| QA-011 | quality | 0209T0335 | PLAN CLOSURE APPROVED: 4 PASS, 1 CONDITIONAL PASS. 3 MEDIUM non-blocking issues. ERR-050~056 verified. |
| FIX-PRE-IMPL | arch | 0209T0500 | 3 MEDIUM consistency fixes (ERR-060~062). ADR-013 IVFFlat→HNSW, migration-strategy IVFFlat→HNSW, plan hot_memories LEFT JOIN. Plan v2.0.4. |
| SCAFFOLD-001 | devops | 0208C31 | pnpm-workspace.yaml, package.json |
| SCAFFOLD-002 | devops | 0208C31 | tsconfig.base.json |
| SCAFFOLD-003 | devops | 0208C31 | biome.json |
| SCAFFOLD-004 | devops | 0208C31 | packages/*/package.json + tsconfig.json |
| SCAFFOLD-005 | devops | 0208C31 | vitest.config.ts (root + per-package) |
| SCAFFOLD-006 | devops | 0208C31 | docker/docker-compose.dev.yml |
| SCAFFOLD-FIX | devops+coord | 0208C31 | Ownership violation fixed, tsconfig.json/package.json/biome.json corrected, milestone verified |
| SYNC-001 | arch | 0208C33 | PLAN_SYNC.md: Phase A IN_SYNC, Phase B interface contracts with full spec cross-refs |
| CORE-001 | dev-core | 0208C33 | 10 src + 10 test files, 55 tests pass, Biome+tsc clean. Domain types implemented per plan §3.5. |
| SCAFFOLD-007 | devops | 0208C33 | .github/workflows/ci.yml — lint → typecheck → test, Node.js 22 + pnpm 9 |
| CORE-002 | dev-core | 0208C34 | 4 src + 3 test files (decay module). 34 tests, 100% stmt coverage. ADR-015 8-step formula. |
| CORE-005 | dev-core | 0208C34 | 4 src + 3 test files (persona module). 32 tests, 100% stmt coverage. PersonaEngine interface + buildSystemPrompt. |
| DEVOPS-001 | coord | 0208C34 | @vitest/coverage-v8 added. Barrel exports excluded from coverage. 93%+ global coverage. |
| CORE-003 | dev-core | 0208C36 | 8 src + 7 test files (memory layers M0-M5). 241 tests, 100% stmt, 95% branch. ADR-013 6-layer architecture. |
| SYNC-002 | arch | 0208C36 | PLAN_SYNC.md: B.1/B.2/B.5 IN_SYNC, A.3 IN_SYNC. No drift detected. |
| CORE-004 | dev-core | 0208C40 | 3 src + 2 test files (context assembly). 289 tests, 100% stmt+branch+func+lines. Plan §3.3 ContextBudget+Assembler. |
| CORE-006 | dev-core | 0208C40 | 4 src + 3 test files (orchestrator). 330 tests, 99.69% stmt. ReAct loop+SessionRouter+tool dispatch. ADR-014/020/021. |
| SYNC-003 | arch | 0208C41 | PLAN_SYNC.md: B.3+B.4+B.6 IN_SYNC. Phase B plan-code sync 100%. |
| QA-013 | quality | 0208C41 | Phase B final verification: 330 tests smoke test, ALL CONSTITUTION gates PASS. 0 CRITICAL, 0 HIGH. READY FOR PHASE B CLOSURE. |
| DEVOPS-002 | devops | 0208C43 | npm deps: pg, ioredis, @anthropic-ai/sdk, @google/generative-ai, @types/pg, testcontainers. pnpm install+typecheck PASS. |
| DEVOPS-003 | devops | 0208C43 | testcontainers setup: PostgreSQL 17 pgvector + Redis 7. packages/infra/tests/setup.ts lifecycle. |
| INFRA-001 | dev-infra | 0208C43 | L2 PG persistence: 6 adapters (Episodic, Semantic, Conceptual, Meta, Session, Pool). 62 tests, 95.5% stmt. ADR-002/013/021. |
| INFRA-004 | dev-infra | 0208C43 | L5 Embedding: GeminiEmbeddingService, 3072d, batch, retry, circuit breaker. 16 tests, 99.18% stmt. ADR-016. |
| COMMON-CB | dev-infra | 0208C43 | Circuit breaker (ADR-021): closed→open→half_open state machine. 11 tests, 100% stmt. packages/infra/src/common/. |
| INFRA-002 | dev-infra | 0208C44 | L2 Redis cache: RedisWorkingMemory (PG-first, cache-aside, TTL 3600s) + RedisStreamBuffer (Redis Streams). 25 tests, 91.44% stmt. ADR-003. |
| INFRA-003 | dev-infra | 0208C44 | L5 LLM adapters: AnthropicLlmProvider + GoogleLlmProvider. Streaming, tool calling, circuit breaker. 15 tests, 95.89% stmt. ADR-020/021. |
| INFRA-005 | dev-infra | 0208C44 | L6 MCP registry: defineTool(), ToolRegistry, McpToolExecutor, validatePath. 16 tests, 92.12% stmt. ADR-010. |
| DEVOPS-004 | devops | 0208C44 | Core subpath exports: @axel/core/{types,memory,decay,context,persona,orchestrator}. 475 tests pass. |
| SYNC-004 | coord (CTO) | 0208C46 | PLAN_SYNC.md Phase C: ALL 6 subsections NOT_STARTED→IN_SYNC. 9 interface mappings + known issues table. CTO override (arch 3 cycles stalled). |
| QA-016 | quality | 0208C46 | Phase C code review: 2 HIGH, 7 MEDIUM, 4 LOW. CONDITIONAL PASS (459/475 tests, zod fix needed). TDD PASS. File size PASS. |
| AUDIT-003 | audit | 0208C46 | Phase C code audit: 6 HIGH, 8 MEDIUM, 5 LOW. TDD PASS (100%). File size PASS. No circular deps. No dead code. |
| FIX-INFRA-001 | devops | 0208C47 | zod dependency resolve fix. pnpm install + @testcontainers/postgresql. 475 tests, 0 skips. CONSTITUTION §10 restored. |
| EDGE-001 | dev-edge | 0208C48 | AxelChannel interface + 7 channel types in core/types/channel.ts. 24 tests, 354 core tests pass. ADR-009. |
| FIX-INFRA-002 | dev-infra | 0208C48 | 8 bare catch → typed catch, getSummary PG fallback, compress PG fallback. 154 infra tests pass, cache 94.6% stmt. |
| FIX-INFRA-003 | dev-infra | 0208C48 | Global mutable → per-instance, JSON.parse → throws ProviderError, validatePath async symlink. llm 97.32%, mcp 91.42%. |
| DEVOPS-005 | devops | 0208C48 | discord.js + grammy (channels), pino + ws + zod (gateway). 508 tests pass, typecheck+lint clean. |
| EDGE-002 | dev-edge | 0208C49 | CLI Channel AxelChannel impl. readline, streaming, start/stop lifecycle. 21 tests, 95.95% stmt. 529 tests total. |
| FIX-INFRA-004 | dev-infra | 0208C49 | Migrated 24 files relative→@axel/core/* subpath imports. 154 infra tests pass. |
| DEVOPS-006 | devops | 0208C49 | Subpath exports @axel/channels + @axel/gateway. Vitest setup files + coverage config. 508→529 tests. |
| EDGE-003 | dev-edge | 0208C51 | Discord Channel AxelChannel impl. discord.js, 2000 char splitting, streaming message.edit(), reconnection. 29 tests, 92.33% stmt. 558 tests total. |
| QA-017 | quality | 0208C51 | Phase D code review (EDGE-001/002): PASS. 0 CRITICAL, 0 HIGH, 3 MEDIUM, 3 LOW. TDD PASS. §9 PASS. ADR-009 PASS. |
| PLAN-AMEND-001 | coord (CTO) | 0208C51 | ADR-002 PG 16→17, migration-strategy PG 16→17 + sessions user_id + channel_history + idx. AUD-050/058 resolved. CTO override (arch 3 cycles stalled). |
| SYNC-005 | coord (CTO) | 0208C51 | PLAN_SYNC.md Phase D: D.1-D.3 NOT_STARTED→IN_SYNC, D.4-D.6 NOT_STARTED, D.7 AMENDED. CTO override. |
| BOOTSTRAP-001 | dev-edge | 0208C52 | DI container + lifecycle in apps/axel/src/. config.ts (Zod AxelConfigSchema), container.ts (~20 services), lifecycle.ts (4-phase shutdown), main.ts. 33 tests, 591 total. |
| EDGE-004 | dev-edge | 0208C53 | Telegram Channel AxelChannel impl. grammy Bot API, polling, 4096 char splitting, typing indicator, streaming editMessageText. 23 tests, 97.66% stmt. 637 tests total. |
| EDGE-005 | dev-edge | 0208C53 | Gateway HTTP+WS server. Node.js http + ws. /health, /api/v1/chat, /api/v1/chat/stream (SSE), /ws. Security: timing-safe Bearer, CORS, error redaction. 23 tests, 84.34% stmt. 637 tests total. |
| QA-018 | quality | 0208C54 | Phase D code review batch 2: CONDITIONAL PASS. 0H 8M 6L. TDD PASS, §9 PASS, §14 PASS. Coverage: channels 94%>75%, gateway 84%>80%. |
| AUDIT-004 | audit | 0208C54 | Phase D code audit: 3H 6M 5L. TDD PASS. §9 PASS. §14 PASS. HIGH: AUD-065 WS auth pattern, AUD-066 rate limiting, AUD-067 body size limit. |
| FIX-GATEWAY-001 | dev-edge | 0208C55 | 3 HIGH gateway security fixes: (1) WS first-message auth per ADR-019, (2) sliding window rate limiting, (3) 32KB body size limit. 32 tests (+9), 87.01% stmt, 646 total. TDD RED→GREEN→REFACTOR. |
| SYNC-006 | coord (CTO) | 0208C55 | PLAN_SYNC.md Phase D: D.4 Telegram IN_SYNC (23 tests, 97.66% stmt), D.5 Gateway IN_SYNC (32 tests, 87.01% stmt, 4/12 routes + FIX-GATEWAY-001), D.6 Bootstrap IN_SYNC (33 tests, 86.95% stmt). CTO override (arch 2 cycles). |
| INTEG-001 | devops | 0208C57 | tools/migrate/ — DB migration runner, 6 SQL migrations, 10 tests. pgvector extension enabled. ERR-069 discovered (2000d limit). |
| INTEG-002 | dev-core | 0208C57 | packages/core/src/orchestrator/inbound-handler.ts — InboundHandler factory, resolveSession→assemble→reactLoop→send pipeline. 12 tests, 366 total. |
| FIX-MEDIUM-001 | dev-edge | 0208C57 | 8 MEDIUM fixes: splitMessage DRY, classifyError ADR-011, lifecycle startTime, HealthCheckTarget DRY, Telegram guards, container types, CORS Vary. 18 new tests, 664→686 total. |
| INTEG-003 | dev-edge | 0208C58 | Gateway→orchestrator integration via HandleMessage DI. /chat, /chat/stream (SSE), /ws routed to InboundHandler. Extracted types.ts, http-utils.ts, ws-handler.ts. 78 gateway tests. |
| INTEG-004 | dev-edge | 0208C58 | 6 remaining gateway routes: memory/search, memory/stats, session, session/end, tools, tools/execute. route-handlers.ts factory. 78 gateway tests total. |
| INTEG-006 | dev-infra | 0208C58 | PG+Redis integration test: 36 tests across 7 layers. Testcontainers PG17+Redis7. Full memory pipeline verified. Schema drift noted (plan-amendment sent). |
| RES-006 | research | 0208C58 | pgvector dimension limits research. PRIMARY: 1536d Matryoshka truncation (Google official, research-proven). 25 sources. docs/research/RES-006-pgvector-dimension-limits.md. |
| INTEG-005 | dev-edge | 0208C59 | Channel bootstrap wiring: createChannels, wireChannels, createHandleMessage. CLI/Discord/Telegram config-based. main.ts updated. 16 tests, 766 total. bootstrap-channels 98.85% stmt. |
| AUDIT-005 | audit | 0208C59 | Phase E integration security audit: 0C 5H 7M 4L (AUD-079~094). FIX-GATEWAY-001 prior fixes verified. New HIGH: WS msg size, rate limit leak, silent errors, missing timestamp, hardcoded creds. |
| INTEG-007 | dev-edge | 0208C60 | E2E integration test: CLI→InboundHandler→mock LLM→memory→response. 8 tests, 774 total (62 files). Full roundtrip verified. |
| FIX-AUDIT-E-001 | dev-edge | 0208C61 | AUD-079 WS message size limit (64KB), AUD-080 rate limit bucket eviction, AUD-082 missing timestamp. 82 gateway tests, 94.79% stmt. TDD RED→GREEN→REFACTOR. |
| FIX-AUDIT-E-002 | dev-core | 0208C61 | AUD-081 InboundHandler onError callback. ErrorInfo interface. 375 core tests, 9 new. TDD RED→GREEN→REFACTOR. |
| QA-019 | quality | 0208C61 | Phase E integration review: PASS. 0C 0H 3M 4L. 801 tests. All CONSTITUTION gates PASS. Coverage all targets exceeded. |
| FIX-SCHEMA-001 | coord (CTO) | 0208C62 | Sessions table schema drift fixed: channel_history JSONB→TEXT[], last_activity_at TIMESTAMPTZ added, idx_sessions_user updated. migration-strategy.md + 002_episodic_memory.sql aligned with PgSessionStore. ERR-070 resolved. |
| SYNC-007 | coord (CTO) | 0208C62 | PLAN_SYNC Phase E: 7 subsections (E.1~E.7) mapped. Migration runner, InboundHandler, gateway integration, PG+Redis integration, channel bootstrap, E2E roundtrip, schema amendment all IN_SYNC. |
| FIX-AUDIT-E-003 | devops | 0208C63 | AUD-083 hardcoded DB credentials removed from migrate CLI. Env vars enforced (DATABASE_URL or PG*). 5 new tests. 806 tests pass. ERR-075 resolved. |
| FIX-AUDIT-E-004 | dev-edge | 0208C65 | AUD-086 security headers (X-Content-Type-Options, X-Frame-Options) + AUD-090 unsafe cast fix. 111 gateway tests. TDD RED→GREEN. |
| INTEG-008 | dev-edge | 0208C65 | Webhook routes: POST /webhooks/telegram (secret_token verification) + POST /webhooks/discord (Ed25519 signature verification, PING→PONG). 17 webhook tests. 816 total tests, 66 files. |
| QA-020 | quality | 0208C66 | Final Phase E review: PASS. 0C 0H 3M 4L. 831 tests verified. All CONSTITUTION gates PASS. TDD PASS. Coverage all targets exceeded. |
| FIX-HARDEN-001 | dev-infra | 0208C66 | AUD-088 hardcoded fallback credentials removed from pg-redis-integration.test.ts. requireEnv() enforced. 190 infra tests pass. |
| FIX-HARDEN-002 | dev-edge | 0208C66 | AUD-093 ToolRegistry tool definitions wired into InboundHandler. toolDefinitions: ToolDefinition[] in InboundHandlerDeps. 819 tests (64/66 files). |
| HARDEN-003 | dev-edge | 0208C68 | QA-020-M1: TelegramUpdate interface + isTelegramUpdate type guard. 16 tests. Eliminates 4-level Record casting chain. TDD RED→GREEN→REFACTOR. |
| HARDEN-004 | dev-edge | 0208C68 | QA-020-M2: DiscordInteraction interface + isDiscordInteraction type guard. Extracted isValidDiscordData + isValidDiscordMember helpers. 16 tests. TDD RED→GREEN→REFACTOR. |
| HARDEN-005 | dev-edge | 0208C68 | AUD-087: trustedProxies config + getClientIp X-Forwarded-For parsing. Right-to-left walk, skip trusted IPs. 5 tests. TDD RED→GREEN→REFACTOR. |
| FIX-DIMENSION-001 | **Mark (Human direct)** | 0208C68 | **Mark(Human) approved and directly applied** 3072d→1536d Matryoshka truncation. 16 files updated (source, tests, ADRs, plan docs, SQL migration). HNSW index activated. 835 tests pass. ERR-069 resolved. Commits: `6120a90` + `228a146`. |
| CONST-AMEND-001 | **Mark (Human direct)** | 0208C68 | **Mark(Human) approved and directly applied** §9 amendment: infra imports expanded from `core/src/types/` to `@axel/core/{types,memory,orchestrator}`. AUD-046/047 resolved. |
| HARDEN-006 | dev-edge | 0208C70 | QA-020-M3: Discord DEFERRED fire-and-forget pattern. DiscordFollowUp DI callback. discordApplicationId config. 6 tests. TDD RED→GREEN. |
| HARDEN-007 | dev-edge | 0208C70 | QA-020-L3 + AUD-094: SSE security headers (X-Content-Type-Options, X-Frame-Options) + startedAt moved to start() listen callback. 4 tests. TDD RED→GREEN. |
