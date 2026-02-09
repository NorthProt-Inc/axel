# BACKLOG

> Managed by Coordinator only. Other Divisions request changes via comms.
>
> **Cycle 126**: **STEADY STATE.** 1534 tests (verified C126), typecheck PASSES, 0 errors. All human.md directives resolved. Roadmap exhausted. Awaiting next direction from Mark.

## In Progress

| ID | Priority | Division | Task | Started |
|----|----------|----------|------|---------|
| (none) | — | — | — | — |

## Queued

| ID | Priority | Division | Task | Created |
|----|----------|----------|------|---------|
| (none) | — | — | — | — |

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
| MARK-PERSONA-001 | Mark(Human) 직접 구현 완료 (9fb41b5). BACKLOG 추적 불필요. | — |

## Done

| ID | Division | Completed | Output |
|----|----------|-----------|--------|
| FIX-PLANDOC-001 | coord (CTO override) | 0209C114 | INC-01/04 Plan 문서 불일치 수정: (1) axel-project-plan.md:705 PostgreSQL 16→17. (2) websocket-protocol.md:22-28 JWT query param→ADR-019 first-message auth 패턴. human.md P2 8건 전수 확인 완료 (GAP-07~12+INC-03 이미 C103/C106 해결). |
| FEAT-UI-002 | coord (CTO override) | 0209C112 | CLI Improvements: (1) browseHistory/searchHistory — HistoryEntry interface, timestamp+sessionId+preview formatting, case-insensitive search. 12 tests. (2) switchSession/listActiveSessions — SessionSwitchResult (success/notFound/alreadyActive), formatted session list. 11 tests. (3) Color Themes: light/dark/ocean presets, getTheme/applyTheme, ColorTheme→Partial<CliTheme>. 15 tests. TDD RED→GREEN. |
| FEAT-OPS-002 | coord (CTO override) | 0209C112 | Backup Automation: BackupConfigSchema (Zod, schedule/retention/destination/compression), generatePgDumpCommand (--format=custom, timestamped filename), applyRetentionPolicy (age-based keep/remove), calculateStorageUsage (totalBytes/fileCount/oldest/newest), generateCronEntry (crontab format). 40 tests. TDD RED→GREEN. |
| QA-026 | coord (CTO override) | 0209C112 | Feature Sprint final review: FEAT-UI-002 + FEAT-OPS-002 verified. 1534 tests, typecheck PASSES. §9 PASS, §14 PASS, TDD PASS. 0C 0H. Feature Sprint 14/14 = 100%. |
| FEAT-CORE-002 | coord (CTO override) | 0209C111 | Proactive Notification: NotificationScheduler (cron-like rule engine), parseCronExpression (5-field cron: wildcards, ranges, steps, lists), shouldTrigger, NotificationRuleSchema (Zod), NotificationSender DI. 25 tests. TDD RED→GREEN. |
| FEAT-INFRA-001 | coord (CTO override) | 0209C111 | Ollama LLM Provider: OllamaLlmProvider (LlmProvider impl), streaming chat, tool calling, ECONNREFUSED/500 retryable, supportsVision config. FallbackLlmProvider 체인 통합 가능. 13 tests. TDD RED→GREEN. |
| FEAT-OPS-001 | coord (CTO override) | 0209C111 | Prometheus Metrics: Counter (labels), Gauge (inc/dec/set), Histogram (buckets), MetricsRegistry, formatPrometheus (exposition format). Zero external deps. 23 tests. TDD RED→GREEN. |
| FEAT-CHAN-002 | coord (CTO override) | 0209C111 | Voice I/O: SpeechToTextProvider + TextToSpeechProvider DI contracts (core/types/voice.ts), Zod schemas (STT/TTS config, VoiceEvent), VoiceChannel (AxelChannel impl, transcribe/synthesize/handleAudioInput). 24 tests (12 types + 12 channel). TDD RED→GREEN. |
| FEAT-UI-001 | coord (CTO override) | 0209C111 | WebChat Export + Rendering: exportToMarkdown/exportToJson (대화 export), parseMermaidBlocks (코드블록 감지), parseLatexBlocks (inline/block LaTeX 감지). 15 tests. TDD RED→GREEN. |
| FEAT-CORE-001 | coord (CTO override) | 0209C110 | Multi-modal Message: ContentBlock discriminated union (TextBlock, ImageBlock, FileBlock) Zod schemas, isMultiModalContent(), extractTextContent(), LlmProvider.supportsVision. SUPPORTED_IMAGE_TYPES (JPEG/PNG/WebP/GIF), IMAGE_MAX_SIZE_BYTES (5MB). 25 tests. TDD RED→GREEN. |
| FEAT-TOOL-001 | coord (CTO override) | 0209C110 | Web Search Tool: WebSearchProvider (Brave Search API adapter), createWebSearchTool (defineTool 등록), formatSearchResults Markdown, rate limiting, SafeSearch strict. ToolCategory 'search' 추가. 13 tests. TDD RED→GREEN. |
| FEAT-TOOL-002 | coord (CTO override) | 0209C110 | File Handler Tool: FileHandler (readFile/writeFile/summarizeFile), path boundary 검증, extension allowlist, max file size, createFileReadTool/createFileWriteTool/createFileSummaryTool. 16 tests. TDD RED→GREEN. |
| FEAT-CHAN-001 | coord (CTO override) | 0209C110 | Slack Channel: SlackChannel @slack/bolt AxelChannel impl, Socket Mode, thread support (thread_ts), 4000 char splitting, bot message filtering, @axel/channels/slack subpath export. 15 tests. TDD RED→GREEN. |
| QA-025 | coord (CTO override) | 0209C110 | Feature Sprint CTO override review: FEAT-CORE-001/TOOL-001/TOOL-002/CHAN-001 코드 검증 + typecheck + 1356 tests 확인. TDD 준수, §9 경계 준수, §14 파일 크기 준수. |
| RES-008 | research | 0209C108 | Web Search Tool 리서치 완료. Brave Search API 권장 ($5/1K, Free 2K/mo). Tavily ($8/1K) vs SearXNG (self-hosted) 비교. OpenClaw 구현 패턴 참조. Phase 1: Brave, Phase 2: Tavily fallback. 35+ sources. docs/research/RES-008-web-search-tool.md. |
| RES-009 | research | 0209C108 | Multi-modal Vision 리서치 완료. Anthropic Vision 권장 (Haiku $1/MTok, base64). Gemini Vision Phase 2 (비디오). ContentBlock discriminated union 설계. Phase 1: Anthropic base64, Phase 2: Gemini video. 30+ sources. docs/research/RES-009-multimodal-vision.md. |
| FIX-FILESIZE-001 | coord (CTO override) | 0209C106 | §14 위반 해결: inbound-handler.ts 439→267 lines. persistToMemory+extractAndStoreEntities+estimateTokenCount → memory-persistence.ts (184 lines) 추출. 1287 tests, typecheck PASSES. |
| GAP-SESSION-001 | coord (CTO override) | 0209C106 | GAP-11: session-state.ts 생성. 7-state FSM transition validation (VALID_TRANSITIONS map, isValidTransition, assertTransition). UnifiedSession.state 필드 추가. 21 tests. ADR-021. |
| GAP-REDIS-CB-001 | coord (CTO override) | 0209C106 | GAP-10: RedisWorkingMemory ad-hoc RedisState → CircuitBreaker (infra/common/) 적용. 8 bare catch → circuit.execute() 패턴. ADR-003. 12 tests. |
| GAP-CMD-001 | coord (CTO override) | 0209C106 | GAP-07: McpToolExecutor 강화. validateCommandArgs (shell metachar 차단), validateCwd (path traversal 차단), basePath 옵션. ADR-019. 12 tests. |
| GAP-PROMPT-001 | coord (CTO override) | 0209C106 | GAP-08: prompt-defense.ts 4-layer (sanitizeInput, isolateSystemPrompt, filterOutput, wrapUserInput). API key/email redaction, injection pattern 차단. ADR-019. 18 tests. |
| GAP-WEBHOOK-001 | coord (CTO override) | 0209C106 | GAP-12: Telegram secret_token + Discord Ed25519 signature verification 테스트 커버리지. timing-safe comparison 확인. Ed25519 keypair 생성 테스트. 8 tests. |
| FIX-MIGRATION-009 | arch | 0209C103 | DRIFT-009 RESOLVED. migration 009 DEPRECATED in migration-strategy.md (3072d conflicts with ADR-016 1536d). 010+011 documented. Execution order updated. |
| ADR-STATUS-001 | arch | 0209C103 | 9 ADRs PROPOSED→ACCEPTED (ADR-013~021). All 21 ADRs now ACCEPTED. |
| FIX-BUG-001 | coord (CTO override) | 0209C102 | matchedMemoryIds 논리 버그 수정. ScoredMemory.dbId 추가, PG search `id` SELECT, container.ts `scored.map(s => s.dbId ?? 0)`. 1156 tests, typecheck PASSES. |
| QA-024 | coord (CTO override) | 0209C102 | Mark 16건 커밋 종합 리뷰. 0 CRITICAL, 0 HIGH 신규. §14 위반 1건 (inbound-handler 438 lines, FIX-FILESIZE-001). fallback-provider yield* 패턴 정상 확인. |
| SYNC-008 | arch | 0209C101 | PLAN_SYNC Phase F: 12 subsections mapped (F.1~F.12). Merged 66e3377. DRIFT-009 (migration 009 dimension) 식별. |
| FIX-TYPECHECK-003 | coord (CTO override) | 0209C101 | ERR-092 RESOLVED. root typecheck `tsc -b` 전환, stale dist/ 정리, fallback-provider.ts unused import, container.ts type-safe fixes. 1156 tests, 0 errors. |
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
| FIX-MIGRATION-001 | devops | 0208C75 | Migration fixes: (1) 002 messages created_at+token_count, (2) 007 ALTER COLUMN conditional DO block, (3) 008 session_summaries table. 845 tests, 15 migrate tests. ERR-082/083/084 resolved. |
| FIX-MIGRATION-002 | coord (CTO) | 0208C77 | migration-strategy.md 업데이트: (1) 디렉토리 구조 007/008 추가, (2) messages 테이블 created_at+token_count 반영, (3) 007/008 migration 문서화, (4) Execution Order 001-008. CTO override (arch 3 cycles stalled). ERR-085 resolved. |
| UI-001 | ui-ux | 0208C80 | CLI output rendering: renderAssistantMessage, renderStreamStart/Chunk/End, renderToolCall/Result, renderThinking. 15 tests, 100% stmt. TDD RED→GREEN→REFACTOR. |
| UI-003 | ui-ux | 0208C80 | WebChat logic tests: 8 markdown + 14 chat-logic (parseWsMessage, applyChunk, applyDone, createUserMessage). Pure functions extracted. TDD RED→GREEN→REFACTOR. |
| UI-004 | ui-ux | 0208C80 | WS first-message auth per ADR-019: createAuthMessage, parseAuthResponse, isAuthOk. 9 tests. TDD RED→GREEN. |
| UI-007 | ui-ux | 0208C80 | Design tokens→Tailwind: buildTailwindColors, buildTailwindFontFamily. 7 tests. TDD RED→GREEN. |
| QA-021 | quality | 0208C80 | UI/UX scaffold review: CONDITIONAL PASS. 0C 0H 7M 4L (post UI-001/003/004/007 resolution). §9 PASS. §14 PASS. Coverage ui 94.96% stmt. |
| UI-002 | ui-ux | 0208C82 | CLI streaming session: createStreamSession, feedChunk, completeStream, getStreamOutput. Immutable state, token accumulation, markdown render on completion. 12 tests, 100% stmt. TDD RED→GREEN→REFACTOR. |
| UI-005 | ui-ux | 0208C82 | WebChat markdown enhanced: renderMarkdownWithHighlight (async marked + shiki github-dark, 8 langs), sanitizeHtml (allowlist-based XSS prevention). 17 tests. TDD RED→GREEN→REFACTOR. |
| UI-006 | ui-ux | 0208C82 | WebChat session API client: buildSessionUrl, buildSessionEndUrl, parseSessionResponse, parseSessionEndResponse, addSessionToList. Gateway integration. 13 tests. TDD RED→GREEN→REFACTOR. |
| FIX-PUNYCODE-001 | devops | 0208C84 | punycode override 시도 (bd84454) — pnpm packageExtensions + tr46 dependency. 단, whatwg-url require('../punycode') 미해결로 telegram 테스트 3개 FAIL. **불완전 — FIX-PUNYCODE-002로 후속.** |
| README-001 | devops | 0208C84 | 8 README files (root 미포함, packages/core/channels/gateway/infra/ui, apps/axel/webchat). 커밋 96ec34f. §1 cross-ownership 위반 기록 (P0 directive 사후 확인). |
| FIX-UI-001 | devops | 0208C84 | marked-terminal.d.ts 타입 선언 추가 (packages/ui/src/cli/). 커밋 96ec34f. §1 위반 기록 (packages/ui/ → ui-ux 소유). |
| FIX-PUNYCODE-002 | devops | 0208C85 | ERR-086 해결 확인 — FIX-PUNYCODE-001 수정이 이미 작동중. 975 tests pass, 0 FAIL, telegram 25 tests pass. |
| QA-022 | quality | 0208C85 | UI/UX Sprint 최종 리뷰 PASS. 0C 0H 6M 3L. TDD PASS. §9 PASS. §14 PASS. Coverage: ui 95.77% stmt. 975 tests. |
| RES-007 | research | 0208C87 | CLI 기억 상실 원인 분석 완료. ROOT CAUSE: InboundHandler에서 pushTurn/addMessage 미호출, gracefulShutdown flush('*') 버그, M2/M3 영구 저장 경로 누락. docs/research/RES-007-cli-memory-persistence.md. |
| FIX-README-001 | devops | 0208C87 | QA-PROACTIVE-C85 README 이슈 수정: DB URL 플레이스홀더, deployment-strategy.md/CONTRIBUTING.md 참조 제거. 커밋 1a85342. |
| FIX-PUNYCODE-003 | devops | 0208C87 | punycode 정리: postinstall 스크립트 제거, root+channels punycode direct dep 제거. packageExtensions로 충분. 975 tests pass. 커밋 1a85342. |
| OPS-DOC-001 | devops | 0208C88 | 사용자 친화적 운영 매뉴얼 operation.md 작성 완료 (루트폴더, 17KB, 756 lines). 설치/설정/실행/채널/마이그레이션/트러블슈팅/운영 가이드. Human directive. |
| DIAG-UNTRACK-001 | devops | 0208C88 | cycle.sh untracked files WARNING 원인 분석 완료. ROOT CAUSE: get_owned_paths('devops')에 patches/ 디렉토리 누락. FIX-CYCLESH-001 생성. Human directive. |
| MIGRATE-PLAN-001 | research | 0208C89 | axnmihn→Axel 데이터 마이그레이션 계획 완료. 1,736 msgs, 1,039 embeddings (3072d→1536d), 1,396 entities + 1,945 relations. 12개 섹션. docs/research/MIGRATE-001-axnmihn-migration-plan.md. |
| AUDIT-006 | audit | 0208C89 | 유휴 Division 활용 분석 + 에이전트 운영 효율화 방안 감사 완료. 14 findings (4H 7M 3L). AUD-095~108. 개선 제안 7건. |
| FIX-MEMORY-001 | dev-core | 0208C90 | RES-007 ROOT CAUSE #1 수정: InboundHandlerDeps에 WorkingMemory+EpisodicMemory DI 추가, persistToMemory() 구현 (pushTurn+addMessage). 387 tests (+10), 0 fail. TDD RED→GREEN→REFACTOR. dev-core scope 완료 (flush/M3는 별도 태스크). |
| FIX-OPSDOC-001 | devops | 0208C90 | operation.md git add + commit 완료. 756 lines, 17KB 운영 매뉴얼. Commit 9cc9b32. |
| FIX-BIOME-001 | devops | 0208C90 | biome.json apps/webchat/.svelte-kit/** ignore 추가. QC report 54/56 biome errors 해결. Commit 13c580c. |
| FIX-README-002 | devops | 0208C90 | apps/axel/README.md dist/main.js 경로 수정. Commit de719c0. |
| FIX-CYCLESH-001 | **Mark (Human direct)** | 0208C92 | **Mark(Human) 직접 수정** 커밋 `0966063`. cycle.sh:93 devops 소유 경로에 `patches/` 추가 완료. QC 시스템 추가와 함께 적용됨. |
| FIX-MEMORY-002 | dev-edge | 0208C93 | RES-007 ROOT CAUSE #2: gracefulShutdown flush('*') → per-user flush via ActiveUserTracker.getActiveUserIds(). bootstrap-channels에서 workingMemory+episodicMemory DI 완성. 5 tests, 990 total (branch). TDD RED→GREEN→REFACTOR. |
| FIX-BUILD-001 | devops | 0208C93 | Production build pipeline: root build script (tsc -b), 8 workspace build scripts, tsconfig.json 8 project references, format:check script, DEPLOY.md. 985 tests pass. |
| FIX-MEMORY-003 | dev-infra | 0208C93 | RES-007 ROOT CAUSE #3: SemanticMemoryWriter 구현. EmbeddingProvider→SemanticMemory.store() 브릿지. Importance heuristic (length+keyword). 18 tests, 100% coverage. TDD RED→GREEN→REFACTOR. |
| MIGRATE-IMPL-001 | dev-infra | 0208C93 | axnmihn→Axel 마이그레이션 스크립트 구현. tools/migrate-axnmihn/ (config, migrate, transform, validate, types). SQLite 추출, 3072d→1536d 재임베딩, PG 로드, 검증. TDD RED→GREEN. **§1 위반 기록**: tools/ 는 devops 소유이나 dev-infra가 작성. CTO 배정 오류. |
| FIX-TYPECHECK-001 | **Mark (Human direct)** | 0208C97 | **Mark(Human) 직접 수정.** packages/core/src/decay/types.ts:2 unused `import type { MemoryType }` 제거. ERR-087 resolved. |
| FIX-CONTAINER-001 | **Mark (Human direct)** + CTO | 0208C97 | **Mark(Human) 직접 수정** container.ts: ContainerPgPool interface+GoogleGenAIClient re-export, config.ts bracket notation. CTO override: discord-channel.ts healthCheck ComponentHealth fix + threadId exactOptionalPropertyTypes fix. gateway ws-handler.ts+route-handlers.ts bracket notation+exactOptionalPropertyTypes fixes. infra llm/mcp bracket notation+exactOptionalPropertyTypes fixes. ERR-088/090 resolved. typecheck PASSES. |
| FIX-MIGRATE-CLI-001 | **Mark (Human direct)** | 0208C97 | **Mark(Human) 직접 수정.** tools/migrate/src/cli.ts 11× process.env dot→bracket notation. ERR-089 resolved. |
| FIX-DOCS-001 | coord (CTO override) | 0208C98 | .env.example 업데이트: AXEL_ prefix 환경변수 전체 반영 (config.ts 기준). operation.md persona ref는 config.ts 기본값으로 유효 (false positive). CTO override (5 cycles stalled). |
| QA-023 | coord (CTO override) | 0208C98 | Post-merge 코드 리뷰 CTO override: FIX-MEMORY-002/003, MIGRATE-IMPL-001, FIX-BUILD-001 모두 머지 완료, 1075 tests pass, typecheck clean. §1 위반 1건 (MIGRATE-IMPL-001 tools/) 기록됨. TDD 준수 확인. CTO override (5 cycles stalled). |
| MARK-M3M5-001 | **Mark (Human direct)** | 0208C98 | **Mark(Human) 직접 구현.** M3-M5 memory layer activation: SemanticMemoryWriter+EntityExtractor container 연결, InboundHandler M3/M4 fire-and-forget 쓰기 경로, ContextAssembler searchEntities 자동 resolve, webchat session list/messages API, gateway 2 routes 추가. 14 files, +497 lines. Commit 5aa814d. |
| MARK-EMBED-FIX | **Mark (Human direct)** | 0208C98 | **Mark(Human) 직접 수정.** container.ts embedding dimension 3072→1536 정렬 (DB vector(1536) 매칭). Commit 85f9b27. |
| TEST-ENTITY-001 | **Mark (Human direct)** | 0209C99 | **Mark(Human) 직접 작성.** packages/infra/tests/memory/entity-extractor.test.ts (198 lines). extract(), parseResponse(), empty/malformed JSON, markdown fences. §8 TDD 위반 해소. Commit 783f5fd. |
| MARK-CONFIG-001 | **Mark (Human direct)** | 0209C99 | **Mark(Human) 직접 리팩터.** config.llm as single source of truth. container.ts hardcoded DEFAULT_*_CONFIG → config.ts Zod schema → .env override → DI container. Commit ec64cb5. |
| MARK-SESSION-001 | **Mark (Human direct)** | 0209C99 | **Mark(Human) 직접 수정.** (1) gateway session API wiring (listSessions/getSessionMessages/getSession/endSession), (2) persistToMemory M1-M4 독립 try-catch 격리, (3) PgEpisodicMemory turn_id auto-increment, (4) EpisodicMemory interface 확장 (getSessionMessages/listSessions), (5) bootstrap-channels M3/M4 DI wiring. Commit e5ea290. |
| FIX-TYPECHECK-002 | **Mark (Human direct)** | 0209C100 | **Mark(Human) 직접 해결.** tools/data-quality @google/genai dependency 추가됨. ERR-091 resolved. Commit 9fb41b5. |
| MARK-TOKEN-FIX | **Mark (Human direct)** | 0209C100 | **Mark(Human) 직접 수정.** token estimate divisor /4→/3 per ADR-018 정렬. context/types.ts + inbound-handler.ts + assembler tests. Commit 53fb1cf. |
| MARK-LOGGER-001 | **Mark (Human direct)** | 0209C100 | **Mark(Human) 직접 구현.** core/logging/ Logger interface + NoopLogger. infra/logging/ PinoLogger. config.ts logLevel. container.ts Logger DI. Commit 89b4190. |
| MARK-SYNC-001 | **Mark (Human direct)** | 0209C100 | **Mark(Human) sync.** FilePersonaEngine, logging, migrations 009-010, ops C99, data-quality, webchat. 49 files. Commit 9fb41b5. |
| MARK-TOKEN-COUNTER | **Mark (Human direct)** | 0209C100 | **Mark(Human) 직접 구현.** AnthropicTokenCounter (infra/context/) + LRU cache. container.ts DI wiring. runtime-deps.ts adapter. Commit 9063a63. |
| MARK-FALLBACK-LLM | **Mark (Human direct)** | 0209C100 | **Mark(Human) 직접 구현.** FallbackLlmProvider (infra/llm/) — primary→fallback circuit breaker failover. 130 tests. container.ts DI. Commit d0b42bf. |
| MARK-INTERACTION-LOG | **Mark (Human direct)** | 0209C100 | **Mark(Human) 직접 구현.** InteractionLog/InteractionLogger interfaces (core/orchestrator/). PgInteractionLogger (infra/db/). InboundHandler telemetry wiring. container.ts DI. 70 tests. Commit a3005ab. |
| MARK-CONSOLIDATION | **Mark (Human direct)** | 0209C100 | **Mark(Human) 직접 구현.** L2→L3 consolidation: core/memory/consolidation.ts (pure functions), infra/memory/consolidation-service.ts (LLM extraction + dedup + storage), migration 011. main.ts scheduler. 237 tests (core 81 + infra 156). Commits b15044c + 16583e7. |
| MARK-DECAY-BATCH | **Mark (Human direct)** | 0209C100 | **Mark(Human) 직접 구현.** Batch decay scheduler — PgSemanticMemory.decay() ADR-015 8-step formula 구현, main.ts 6h interval scheduler. Commit c83d5cb. |
| MARK-WS-EVENTS | **Mark (Human direct)** | 0209C100 | **Mark(Human) 직접 구현.** WS heartbeat (30s ping/pong), typing indicator, session_end, tool event forwarding. gateway ws-handler.ts 확장 + 87 tests. Commit 2649093. |
