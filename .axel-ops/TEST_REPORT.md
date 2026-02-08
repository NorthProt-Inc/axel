# TEST REPORT

> Maintained by Quality Division. Updated after each code review cycle.
> Last Updated: 2026-02-08C65 (QA-020 Final Phase E review)

## Summary

| Metric | Value |
|--------|-------|
| Total Tests | 831 (div/quality worktree: 831/831 pass, 66 test files) |
| Passing | 831 (QA-020 independently verified) |
| Failing | 0 |
| Coverage (core) | 99.69% stmts / 95.2% branch / 100% funcs / 99.69% lines |
| Coverage (infra, reported) | 95%+ stmts (cache 94.6%, common 100%, db 95.5%, embedding 99.2%, llm 97.32%, mcp 91.42%) |
| Coverage (channels, reported) | 94%+ stmts (target 75%) |
| Coverage (gateway, verified) | 95.28% stmts / 82.69% branch / 97.82% funcs / 95.28% lines (111 tests) |
| Coverage (apps/axel, reported) | 85%+ stmts (bootstrap-channels 98.85%, config 100%, lifecycle 98.63%, container 85.48%) |
| Phase | E: INTEGRATION — FINAL QA COMPLETE (all executable work done) |

## Per-Package Status

| Package | Tests | Pass | Fail | Coverage | Target | Gate |
|---------|-------|------|------|----------|--------|------|
| `packages/core/` | 375 | 375 | 0 | 99.69% stmts, 95.2% branch | 90% | **PASS** |
| `packages/infra/` | 190 | 190 | 0 | 95%+ stmts (reported) | 80% | **PASS** (+36 integration tests) |
| `packages/channels/` | 73 | 73 | 0 | 94%+ stmts (reported) | 75% | **PASS** |
| `packages/gateway/` | 111 | 111 | 0 | 95.28% stmts, 82.69% branch | 80% | **PASS** (verified independently by QA-020) |
| `apps/axel/` | 60 | 60 | 0 | 85%+ stmts | — | **PASS** |
| `tools/migrate/` | 15 | 15 | 0 | — | — | **PASS** |

### Infra Package Coverage Breakdown (dev-infra reported C44)

| Module | % Stmts | % Branch | % Funcs | Notes |
|--------|---------|----------|---------|-------|
| cache/redis-working-memory.ts | 91.44 | 72.72 | 94.44 | PG-first + Redis cache-aside |
| cache/redis-stream-buffer.ts | 91.44 | — | — | Redis Streams XADD/XRANGE |
| common/circuit-breaker.ts | 100 | 94.44 | 100 | ADR-021 state machine |
| db/pg-pool.ts | 95.5 | — | — | Pool wrapper + health check |
| db/pg-episodic-memory.ts | 95.5 | 75.89 | 96.66 | Session + message persistence |
| db/pg-semantic-memory.ts | 95.5 | 75.89 | 96.66 | pgvector hybrid search |
| db/pg-conceptual-memory.ts | 95.5 | 75.89 | 96.66 | Recursive CTE BFS |
| db/pg-meta-memory.ts | 95.5 | 75.89 | 96.66 | MV refresh + access patterns |
| db/pg-session-store.ts | 95.5 | 75.89 | 96.66 | ADR-014 session resolution |
| embedding/index.ts | 99.18 | 91.11 | 100 | Gemini 3072d + retry + CB |
| llm/anthropic-provider.ts | 95.89 | 78.2 | 95 | Streaming + tool calling |
| llm/google-provider.ts | 95.89 | 78.2 | 95 | generateContentStream |
| mcp/tool-registry.ts | 92.12 | 85.71 | 86.66 | defineTool + ToolRegistry + validatePath |
| **Overall** | **95%+** | **80%+** | **95%+** | ALL modules exceed 80% target |

> Coverage independently unverifiable by QA due to zod dependency resolve failure (16 MCP tests blocked). Values are from dev-infra test-result C44.

### Core Package Coverage Breakdown

| Module | % Stmts | % Branch | % Funcs | % Lines | Notes |
|--------|---------|----------|---------|---------|-------|
| decay/batch.ts | 100 | 100 | 100 | 100 | |
| decay/calculator.ts | 100 | 75 | 100 | 100 | L26: ?? fallback untested (defensive) |
| decay/types.ts | 100 | 100 | 100 | 100 | |
| persona/channel-adaptations.ts | 100 | 100 | 100 | 100 | |
| persona/engine.ts | 100 | 100 | 100 | 100 | |
| persona/schema.ts | 100 | 100 | 100 | 100 | |
| memory/stream-buffer.ts | 100 | 100 | 100 | 100 | |
| memory/working-memory.ts | 100 | 100 | 100 | 100 | |
| memory/episodic-memory.ts | 100 | 100 | 100 | 100 | |
| memory/semantic-memory.ts | 100 | 95+ | 100 | 100 | Cosine/text sim edge cases covered |
| memory/conceptual-memory.ts | 100 | 95+ | 100 | 100 | BFS cycle detection tested |
| memory/meta-memory.ts | 100 | 100 | 100 | 100 | |
| context/types.ts | 100 | 100 | 100 | 100 | Zod schema + interfaces |
| context/assembler.ts | 100 | 100 | 100 | 100 | Priority assembly + binary-search truncation |
| orchestrator/types.ts | 100 | 100 | 100 | 100 | Zod schema + DI interfaces |
| orchestrator/react-loop.ts | 98.67 | 92.85 | 100 | — | AsyncGenerator + error recovery |
| orchestrator/session-router.ts | 100 | 100 | 100 | 100 | Thin DI wrapper |
| **Overall** | **99.69** | **95.2** | **100** | **99.69** | types/ and index.ts excluded per config |

> Coverage excludes `src/types/` (pure interfaces, no runtime code) and `src/**/index.ts` (barrel exports) per `vitest.config.ts`.
> Orchestrator module coverage reported by dev-core: 98.67% stmt, 92.85% branch. Verified by QA-015-PROACTIVE via 330 test pass.

## TDD Compliance

| Cycle | Task | Division | RED Commit | GREEN Commit | Delta | Compliant |
|-------|------|----------|------------|--------------|-------|-----------|
| 33 | CORE-001 | dev-core | `15a52e61` (02:50:48) | `08529c7e` (02:52:07) | +1m 19s | **YES** |
| 34 | CORE-002 | dev-core | `ecb10461` (03:01:50) | `97e6b29f` (03:03:37) | +1m 47s | **YES** |
| 34 | CORE-005 | dev-core | `7ae9276d` (03:05:25) | `abf08200` (03:06:25) | +1m 00s | **YES** |
| 36 | CORE-003 | dev-core | `c719a22` (03:31:05) | `abd5878` (03:33:08) | +2m 03s | **YES** |
| 38 | CORE-004 | dev-core | `05daa1d` (03:45:04) | `a0f498f` (03:46:36) | +1m 32s | **YES** |
| 39 | CORE-006 | dev-core | `588db3d` (03:56:13) | `dd7b8b4` (03:57:41) | +1m 28s | **YES** |

All 6 completed CORE tasks follow TDD protocol: test commits (RED) precede source commits (GREEN).

| Cycle | Task | Division | RED Commit | GREEN Commit | Delta | Compliant |
|-------|------|----------|------------|--------------|-------|-----------|
| 43 | INFRA-001+004+CB | dev-infra | `f68f730` (04:41:21) | `79e6cac` (04:47:07) | +5m 46s | **YES** |
| 44 | INFRA-002+003+005 | dev-infra | `080fc27` (05:40:16) | `4295e4f` (05:45:29) | +5m 13s | **YES** |

All INFRA tasks follow TDD protocol: test commits (RED) precede source commits (GREEN). Batch commits (multiple tasks per commit) retain correct order.

| Cycle | Task | Division | RED Commit | GREEN Commit | Delta | Compliant |
|-------|------|----------|------------|--------------|-------|-----------|
| 48 | EDGE-001 | dev-edge | `01afaad` (07:18:37) | `08feb6a` (07:18:47) | +10s | **YES** |
| 49 | EDGE-002 | dev-edge | `0ac817f` (07:30:31) | `32d2ba0` (07:31:07) | +36s | **YES** |
| 51 | EDGE-003 | dev-edge | `e2b7f00` (08:24:xx) | `ee1bb57` (08:24:xx) | RED→GREEN | **YES** |
| 52 | BOOTSTRAP-001 | dev-edge | `8b93e58` (08:36:xx) | `16b0131` (08:36:xx) | RED→GREEN | **YES** |
| 53 | EDGE-004 | dev-edge | `95efb00` (08:53:xx) | `149a144` (08:53:xx) | RED→GREEN | **YES** |
| 53 | EDGE-005 | dev-edge | `78240ed` (08:53:xx) | `d168703` (08:53:xx) | RED→GREEN | **YES** |

All Phase D EDGE tasks follow TDD protocol: test commits (RED) precede source commits (GREEN). EDGE-002 has additional REFACTOR commits (f398d9a, 3aa50a6, 62a34ab) after GREEN — correct TDD cycle. EDGE-003 has REFACTOR commits (48909bf). BOOTSTRAP-001 has REFACTOR commit (451e41b).

## CONSTITUTION Compliance (QA-018: Phase D EDGE-003/004/005 + BOOTSTRAP-001)

| Rule | Check | Result |
|------|-------|--------|
| Rule 8 (TDD) | Test commit ≤ src commit timestamp | **PASS** (all 4 tasks: RED commit precedes GREEN commit in git log) |
| Rule 9 (Package Boundary) | channels→core/types only; gateway→core/types only; apps/axel→core/*+infra (allowed) | **PASS** — channels imports only `@axel/core/types`. gateway imports only `@axel/core/types`. apps/axel imports `@axel/core/{types,context,memory,orchestrator}` + `@axel/infra` (permitted per §9 for apps/*). |
| Rule 10 (Test Gate) | All tests pass, coverage targets met, Biome clean, tsc clean | **CONDITIONAL PASS** — 637 tests pass on main (CTO verified). Worktree has dep resolve issues (grammy/discord.js/ws/zod). Biome: 0 errors, 117 warnings (all `any` in test mocks). tsc: clean (0 errors). Coverage: channels 94%>75%, gateway 84%>80%. |
| Rule 14 (File Size) | No src file > 400 lines | **PASS** (max: server.ts 364 lines, discord-channel.ts 302 lines. All under 400.) |

## CONSTITUTION Compliance (QA-017: Phase D EDGE-001/002)

| Rule | Check | Result |
|------|-------|--------|
| Rule 8 (TDD) | Test commit ≤ src commit timestamp | **PASS** (01afaad→08feb6a +10s, 0ac817f→32d2ba0 +36s) |
| Rule 9 (Package Boundary) | channels imports only from core/types | **PASS** — `@axel/core/types` only. channel.ts imports `./health.js` (same package). |
| Rule 10 (Test Gate) | All tests pass, coverage ≥ 75%, Biome clean, tsc clean | **PASS** — 45 EDGE tests all pass. Coverage 95.95% > 75%. Biome: 0 errors on EDGE files. tsc: clean. (zod failure is pre-existing infra issue, not EDGE-related) |
| Rule 14 (File Size) | No src file > 400 lines | **PASS** (channel.ts: 98 lines, cli-channel.ts: 133 lines) |

## CONSTITUTION Compliance (QA-016: Phase C INFRA)

| Rule | Check | Result |
|------|-------|--------|
| Rule 8 (TDD) | Test commit ≤ src commit timestamp | **PASS** (f68f730→79e6cac, 080fc27→4295e4f) |
| Rule 9 (Package Boundary) | Infra imports only from core/src/types/ | **CONDITIONAL PASS** — also imports core/memory/types.js and core/orchestrator/types.js. Approved in PLAN_SYNC B.7 but CONSTITUTION §9 text says "types/ only". Recommend §9 update. |
| Rule 10 (Test Gate) | All tests pass, coverage ≥ 80%, Biome clean, tsc clean | **CONDITIONAL PASS** — 459/475 tests pass (16 MCP tests blocked by zod resolve). Biome: 0 errors (114 warnings). tsc: clean. Coverage: 95%+ (reported). |
| Rule 14 (File Size) | No src file > 400 lines | **PASS** (max: 256 lines, mcp/tool-registry.ts) |

## CONSTITUTION Compliance (QA-015-PROACTIVE: CORE-006)

| Rule | Check | Result |
|------|-------|--------|
| Rule 8 (TDD) | Test commit ≤ src commit timestamp | **PASS** (588db3d → dd7b8b4, +1m28s) |
| Rule 9 (Package Boundary) | No cross-package imports in orchestrator/ | **PASS** (only relative paths within core/ + zod) |
| Rule 10 (Test Gate) | 330 tests pass, coverage ≥ 90%, Biome clean, tsc clean | **PASS** |
| Rule 14 (File Size) | No src file > 400 lines | **PASS** (max: 269 lines, react-loop.ts) |

## QA-020 Code Review Findings (Final Phase E: INTEG-008 webhooks + FIX-AUDIT-E-004 security)

### Scope
- **FIX-AUDIT-E-004**: AUD-086 security headers (X-Content-Type-Options, X-Frame-Options) + AUD-090 unsafe cast fix
- **INTEG-008**: Webhook routes — POST /webhooks/telegram (secret_token) + POST /webhooks/discord (Ed25519)

### Issues Found: 0 CRITICAL, 0 HIGH, 3 MEDIUM, 4 LOW

| # | Sev | Perspective | Location | Description | Fix |
|---|-----|-------------|----------|-------------|-----|
| 1 | MEDIUM | P2: Complexity | webhook-handlers.ts:89-115 | extractTelegramMessage uses 4 levels of nested `as Record<string,unknown>` type assertion chains (update→msg→from→chat). Repetitive narrowing hurts readability. | Define lightweight TelegramUpdate interface and validate with type guard. |
| 2 | MEDIUM | P2: Complexity | webhook-handlers.ts:222-261 | extractDiscordInteraction similarly uses nested type assertions across 4 helper functions. Each relies on `as Record<string,unknown>` chains. | Define minimal Discord interaction interface and validate at entry point. |
| 3 | MEDIUM | P1: Design | webhook-handlers.ts:193-213 | handleDiscordCommand awaits handleMessage() before returning DEFERRED response (type=5). Discord expects DEFERRED immediately with follow-up via webhook edit. Current impl blocks response until processing completes, defeating DEFERRED purpose. | Send DEFERRED immediately, fire-and-forget handleMessage, follow-up via PATCH to interaction callback URL. |
| 4 | LOW | P2: Readability | webhook-handlers.ts:119-125 | Discord interaction type constants use named numbers but only handle PING(1) and APPLICATION_COMMAND(2). Other types (3,4,5) silently get 200 OK. | Add comment noting passthrough behavior. Acceptable for Phase E. |
| 5 | LOW | P3: Security | webhook-handlers.ts:175-190 | verifyDiscordSignature catch swallows all errors (malformed hex, DER encoding, crypto) without logging. Hinders security debugging. | Log error details in development mode per ADR-011 before returning false. |
| 6 | LOW | P1: Design | server.ts:316-320 | SSE stream (handleChatStream) uses res.writeHead directly without security headers (X-Content-Type-Options, X-Frame-Options). FIX-AUDIT-E-004 only covers sendJson(). | Add security headers to SSE writeHead. Not a vulnerability but inconsistent with AUD-086 intent. |
| 7 | LOW | P7: DRY | webhook-handlers.test.ts:52-80 | makeRequest() helper duplicated identically in webhook-handlers.test.ts and security-headers.test.ts. | Extract to shared test helper module. Non-blocking. |

### 7-Perspective Summary

| Perspective | Finding |
|-------------|---------|
| 1. Design Quality | **Good.** Clean separation: createWebhookHandlers factory with config+deps DI. Telegram/Discord handlers properly isolated. Route registration in server.ts with requiresAuth:false correctly bypasses Bearer auth. handleDiscordCommand DEFERRED response is semantically incorrect but functionally acceptable for Phase E single-user. |
| 2. Complexity & Readability | **Good with 2 MEDIUM items.** Telegram/Discord message extraction relies on cascading type assertions — readable but fragile. Well-compensated by helper extraction (6 functions). All files within 400 lines (max: webhook-handlers.ts 263). |
| 3. Security | **Very Good.** Telegram: timing-safe secret token comparison. Discord: Ed25519 signature verification via crypto.verify. Both bypass Bearer auth (security: [] per OpenAPI). No injection vectors. Silent error swallowing in crypto verification is LOW concern. |
| 4. Bugs & Reliability | **No bugs found.** Bot message filtering, empty text filtering, missing userId handling all correct. Error paths return appropriate HTTP status codes. handleMessage dependency check prevents 503 when not configured. |
| 5. Changeability | **Good.** Adding new webhook channels follows established pattern (createXxxHandler). GatewayConfig extensible for new webhook secrets. |
| 6. Dead Code | **None found.** All exports used. No commented-out code. |
| 7. DRY | **1 LOW.** Test helper duplication across 2 test files. Source code has no DRY violations. |

### CONSTITUTION Compliance (QA-020: Final Phase E)

| Rule | Check | Result |
|------|-------|--------|
| Rule 8 (TDD) | Test commit ≤ src commit timestamp | **PASS** — FIX-AUDIT-E-004: `bbd9880` (RED 11:38:01) → `4141898` (GREEN 11:38:07). INTEG-008: `31e28c6` (RED 11:42:50) → `bb1f3e6` (GREEN 11:42:59). |
| Rule 9 (Package Boundary) | gateway imports only from core/types | **PASS** — Only `@axel/core/types` (HealthStatus in types.ts). No cross-package violations. |
| Rule 10 (Test Gate) | All tests pass, coverage targets met, Biome clean, tsc clean | **PASS** — 831 tests all pass (QA independently verified). Gateway 95.28% > 80% target. Biome: 0 errors. tsc: clean. |
| Rule 14 (File Size) | No src file > 400 lines | **PASS** — max: server.ts 354 lines, webhook-handlers.ts 263 lines. All under 400. |

### TDD Compliance (QA-020 new entries)

| Cycle | Task | Division | RED Commit | GREEN Commit | Delta | Compliant |
|-------|------|----------|------------|--------------|-------|-----------|
| 65 | FIX-AUDIT-E-004 | dev-edge | `bbd9880` (11:38:01) | `4141898` (11:38:07) | +6s | **YES** |
| 65 | INTEG-008 | dev-edge | `31e28c6` (11:42:50) | `bb1f3e6` (11:42:59) | +9s | **YES** |

### Gateway Per-File Coverage (QA-020 independently verified)

| File | % Stmts | % Branch | % Funcs | % Lines |
|------|---------|----------|---------|---------|
| classify-error.ts | 100 | 77.77 | 100 | 100 |
| http-utils.ts | 97.67 | 95.45 | 100 | 97.67 |
| route-handlers.ts | 97.58 | 90.47 | 100 | 97.58 |
| server.ts | 95.03 | 81.39 | 100 | 95.03 |
| webhook-handlers.ts | 96.80 | 71.21 | 100 | 96.80 |
| ws-handler.ts | 92.53 | 93.93 | 100 | 92.53 |
| **Overall** | **95.28** | **82.69** | **97.82** | **95.28** |

## Recent Test Runs

| Cycle | Division | Package | Result | Duration | Notes |
|-------|----------|---------|--------|----------|-------|
| 65 | quality (QA-020) | all | 831 pass, 0 fail | 5.48s | div/quality worktree (post pnpm install). 66 test files. Gateway 111 tests independently verified. Coverage: gateway 95.28% stmt. Biome: 0 errors/118 warn. tsc: clean. |
| 60 | CTO (C60) | all | 774 pass, 0 fail | — | Main branch verified. 62 test files. INTEG-007 E2E added. |
| 58 | dev-infra (INTEG-006) | infra | 190 pass, 0 fail | — | +36 PG+Redis integration tests. Testcontainers PG17+Redis7. |
| 58 | dev-edge (INTEG-003/004) | gateway | 78 pass, 0 fail | — | +46 tests (12 integration + 26 remaining-routes + 8 rework). 94.53% stmt. |
| 59 | dev-edge (INTEG-005) | apps/axel | 52 pass, 0 fail | — | +16 bootstrap-channels tests. 98.85% stmt for bootstrap-channels. |
| 54 | quality (QA-018) | all | 525 pass, 7 suites fail (dep resolve) | 1.26s | div/quality worktree. grammy/discord.js/ws/zod dep resolve failures. Main branch: 637/637 pass (CTO verified). Biome: 0 errors/117 warn. tsc: clean. |
| 51 | quality (proactive) | all | 512 pass, 17 fail (1 suite) | 1.13s | div/quality worktree. FIX-INFRA-004 verified: 0 relative core imports remain. zod resolve same. |
| 50 | quality (QA-017) | all | 512 pass, 17 fail (1 suite) | 1.06s | div/quality worktree. zod resolve failure (infra/mcp). EDGE files: 45 tests PASS. Biome: 0 errors on EDGE files. tsc: clean. |
| 46 | quality (QA-016 verify) | core+infra | 459 pass, 16 fail (1 suite) | 1.03s | Independent re-verification on div/quality. Same result as C44. tsc: clean. Biome: 0 errors/114 warn. |
| 44 | quality (QA-016) | core+infra | 459 pass, 16 fail (1 suite) | 1.03s | tool-registry.test.ts: zod resolve failure. Biome: 0 errors/114 warn. tsc: clean. |
| 41 | quality (QA-013 final) | core | 330 pass, 0 fail | 724ms | main branch smoke (post-CORE-004+006 merge): typecheck+lint+test ALL PASS |
| 39 | quality (smoke test) | core | 241 pass, 0 fail | 624ms | main branch smoke: typecheck+lint+test PASS |
| 39 | quality (QA-015-PROACTIVE) | core | 330 pass, 0 fail | — | CORE-006 proactive review (div/dev-core) |
| 38 | quality (QA-014-PROACTIVE) | core | 289 pass, 0 fail | — | CORE-004 proactive review |
| 36 | quality (QA-013) | core | 241 pass, 0 fail | 583ms | Biome: 0 warnings. tsc: clean. |
| 35 | quality (QA-012) | core | 121 pass, 0 fail | 483ms | Biome: 0 warnings. tsc: clean. |
| 34 | dev-core (CORE-002+005) | core | 121 pass, 0 fail | — | Reported by dev-core |
| 33 | dev-core (CORE-001) | core | 55 pass, 0 fail | — | Domain types first pass |

## QA-019 Code Review Findings (Phase E integration: INTEG-003/004/005/006/007)

### Scope
- **INTEG-003**: Gateway→Orchestrator integration via HandleMessage DI
- **INTEG-004**: 6 remaining gateway routes (memory, session, tools)
- **INTEG-005**: Channel bootstrap wiring (createChannels, wireChannels, createHandleMessage)
- **INTEG-006**: PG+Redis integration test (36 tests, Testcontainers)
- **INTEG-007**: E2E message roundtrip test (8 tests)

### Issues Found: 0 CRITICAL, 0 HIGH, 8 MEDIUM, 4 LOW

| # | Sev | Perspective | Location | Description | Fix |
|---|-----|-------------|----------|-------------|-----|
| 1 | MEDIUM | P4: Reliability | core/orchestrator/inbound-handler.ts:97 | InboundHandler catch discards error without logging (_err). No observability into failures. ERR-073/AUD-081 overlap. FIX-AUDIT-E-002 in progress. | Log error with structured logger before sending fallback. |
| 2 | MEDIUM | P1: Design | core/orchestrator/inbound-handler.ts:82 | reactLoop receives hardcoded empty tools array. No tool definitions passed to LLM — tool_call events never generated. | Inject tools from container.toolRegistry.listAll() or document as deferred. |
| 3 | MEDIUM | P1: Design | core/orchestrator/inbound-handler.ts:127-134 | buildMessages creates Message with empty sessionId='', turnId=0/1, emotionalContext=''. Placeholder values may confuse downstream logging. | Use resolved session's sessionId; generate meaningful turnIds. |
| 4 | MEDIUM | P1: Design | apps/axel/bootstrap-channels.ts:94-96 | createHandleMessage sendCapture only captures last msg.content. Also, sessionRouter.resolveSession called twice (createHandleMessage:99 + inside createInboundHandler). | (1) Accumulate all sent content. (2) Accept double resolution or pass pre-resolved session. |
| 5 | MEDIUM | P3: Security | gateway/server.ts:253, ws-handler.ts:121 | Hardcoded userId='gateway-user' for all HTTP/WS requests. All web clients share single identity — session/memory/context shared. | Extract userId from auth token or require in request body. Acceptable Phase 0 (single-user). |
| 6 | MEDIUM | P4: Reliability | gateway/route-handlers.ts:80 | Unsafe cast `(session as Record<string,unknown>).sessionId` — no validation, runtime crash risk if shape changes. | Define SessionInfo type in GatewayDeps or validate before cast. |
| 7 | MEDIUM | P4: Reliability | gateway/server.ts:23 | rateLimitBuckets Map never pruned for disconnected IPs. ERR-072/AUD-080 overlap. FIX-AUDIT-E-001 in progress. | Add periodic cleanup or TTL-based cache. |
| 8 | MEDIUM | P5: Changeability | apps/axel/container.ts:162-178 | MemoryContextDataProvider has 3 stub methods (searchSemantic, traverseGraph, getStreamBuffer). Context assembly produces incomplete context. | Track as known gap for Phase F wiring. |
| 9 | LOW | P7: DRY | apps/axel/bootstrap-channels.ts:12-13 | GATEWAY_ERROR_MESSAGE duplicates ERROR_MESSAGE from inbound-handler.ts (identical Korean string). | Export from core/orchestrator and reuse. |
| 10 | LOW | P6: Dead Code | apps/axel/main.ts:56 | _handleMessage assigned but never used — not passed to gateway server. | Wire into createGatewayServer when gateway integration completes. |
| 11 | LOW | P2: Readability | gateway/types.ts:16-17 | MessageEvent indexed signature `[key: string]: unknown` undermines type safety. | Define discriminated union for known event types. |
| 12 | LOW | P5: Changeability | apps/axel/container.ts:195 | DEFAULT_PG_CONFIG has empty password string. Security smell — could connect without auth in dev. | Set to undefined, require explicit env config. |

### 7-Perspective Summary

| Perspective | Finding |
|-------------|---------|
| 1. Design Quality | **Good.** Clean DI wiring: channels → InboundHandler → LLM → send pipeline. createHandleMessage bridges gateway interface elegantly. Gateway extraction (types/http-utils/ws-handler/route-handlers) reduced server.ts from 391→322 lines. Double session resolution in createHandleMessage is a minor design debt. Empty tools array in reactLoop is an integration gap. |
| 2. Complexity & Readability | **Very Good.** All files well within 400 lines (max 322: server.ts). Route handler factory pattern in route-handlers.ts is clean. E2E test is comprehensive (8 scenarios covering happy path, errors, edge cases). Code is self-documenting with clear function names. |
| 3. Security | **1 MEDIUM.** Hardcoded userId='gateway-user' — all web clients share identity. Acceptable for Phase 0 single-user but critical to address before multi-user. No new injection vectors. Auth flow (first-message WS, Bearer HTTP) correct. |
| 4. Bugs & Reliability | **3 MEDIUM.** (1) Silent error discard in InboundHandler (ERR-073 overlap). (2) Unsafe type cast in route-handlers. (3) Rate limit bucket memory leak (ERR-072 overlap). No crash bugs. Error handling patterns are otherwise solid. |
| 5. Changeability | **Good.** Integration test patterns (INTEG-006 Testcontainers, INTEG-007 mock-based E2E) establish clear testing patterns for future integration work. 3 stub methods in ContextDataProvider are tracked for later wiring. |
| 6. Dead Code | **1 LOW.** _handleMessage in main.ts unused. |
| 7. DRY | **1 LOW.** Error message string duplicated between bootstrap-channels.ts and inbound-handler.ts. |

### CONSTITUTION Compliance (QA-019: Phase E Integration)

| Rule | Check | Result |
|------|-------|--------|
| Rule 8 (TDD) | Test commit ≤ src commit timestamp | **PASS** — INTEG-003: `0ab35f8` (RED) → `17fe283` (GREEN). INTEG-005: `1d5b5e2` (RED) → `2aff182` (GREEN). INTEG-007: test-only commit `19e51f5`. |
| Rule 9 (Package Boundary) | Cross-package imports within allowed | **KNOWN ISSUE** — infra→core/orchestrator+memory (12 files). CONST-AMEND-001 pending human approval. channels/gateway→core/types only (PASS). apps/axel→core/*+infra (permitted). |
| Rule 10 (Test Gate) | All tests pass, coverage targets met, Biome clean, tsc clean | **PASS** — 774 tests all pass. Coverage: core 99.69%>90%, infra 95%+>80%, channels 94%>75%, gateway 94.53%>80%. CTO C60 smoke verified. |
| Rule 14 (File Size) | No src file > 400 lines | **PASS** (max 321 lines: gateway/server.ts. All 71 src files under 400.) |

### TDD Compliance (Phase E new entries)

| Cycle | Task | Division | RED Commit | GREEN Commit | Compliant |
|-------|------|----------|------------|--------------|-----------|
| 58 | INTEG-003 | dev-edge | `0ab35f8` (integration.test.ts) | `17fe283` (server.ts wiring) | **YES** |
| 58 | INTEG-004 | dev-edge | `29c3160` (remaining-routes.test.ts) | `73636a8` (route impl) | **YES** |
| 59 | INTEG-005 | dev-edge | `1d5b5e2` (bootstrap-channels.test.ts) | `2aff182` (bootstrap-channels.ts) | **YES** |
| 58 | INTEG-006 | dev-infra | `9cf999b` (pg-redis-integration.test.ts) | N/A (test-only) | **YES** |
| 60 | INTEG-007 | dev-edge | `19e51f5` (e2e-message-roundtrip.test.ts) | N/A (test-only) | **YES** |

## QA-018 Code Review Findings (Phase D batch 2: EDGE-003 Discord + EDGE-004 Telegram + EDGE-005 Gateway + BOOTSTRAP-001 DI)

### Issues Found: 0 CRITICAL, 0 HIGH, 8 MEDIUM, 6 LOW

| # | Sev | Perspective | Location | Description | Fix |
|---|-----|-------------|----------|-------------|-----|
| 1 | MEDIUM | P7: DRY | channels/src/discord+telegram | splitMessage() duplicated identically in discord-channel.ts:290 and telegram-channel.ts:216. StreamingState types also near-identical. | Extract to channels/src/common/utils.ts |
| 2 | MEDIUM | P3: Security | gateway/src/server.ts:359-363 | timingSafeEqual() short-circuits on length mismatch — reveals token length via timing. | Hash both inputs (SHA-256) before comparison, or pad shorter string. |
| 3 | MEDIUM | P3: Security | gateway/src/server.ts:186 | WS auth token in query param (/ws?token=XXX) — logged in access logs, proxy logs. | Document as Phase 0 limitation per ADR-019. Phase 2: first-message auth or Sec-WebSocket-Protocol header. |
| 4 | MEDIUM | P4: Reliability | gateway/src/server.ts:104-106 | HTTP body collection has no size limit — OOM risk from malicious unbounded POST. | Add MAX_BODY_SIZE (e.g., 1MB), abort with 413 if exceeded. |
| 5 | MEDIUM | P1: Design | gateway/src/server.ts:12 | rateLimitPerMinute defined in config but never implemented. No rate limiting logic exists. | Implement per-IP sliding window rate limiter, or remove field and document as Phase 2. |
| 6 | MEDIUM | P1: Design | apps/axel/src/container.ts:109-117 | EstimateTokenCounter ceil(text.length/4) underestimates non-ASCII (Korean/CJK) tokens by ~2.6x. | Add locale-aware heuristic or document English-only limitation. |
| 7 | MEDIUM | P1: Design | apps/axel/src/container.ts:126-164 | MemoryContextDataProvider has 4 stub methods returning empty arrays. Context assembly produces incomplete context (4/8 slots empty). | Document stubs; create follow-up task for full adapter logic. Already noted in code comment — acceptable for Phase D. |
| 8 | MEDIUM | P1: Design | apps/axel/src/lifecycle.ts:23 | Module-level startTime captures time at import, not at server start. Uptime inflated in test scenarios. | Accept startTime as parameter to aggregateHealth(). |
| 9 | LOW | P6: Dead Code | channels/src/discord/discord-channel.ts:207-215 | addReaction() is a stub that voids its params. | Add @todo TSDoc annotation. |
| 10 | LOW | P1: Design | channels/src/discord/discord-channel.ts:69 | Default onError is silent no-op (same pattern as CLI, QA-017 #3). Consistent DI design — caller provides handler. | Document in AxelChannel interface contract. |
| 11 | LOW | P4: Reliability | channels/src/telegram/telegram-channel.ts:150 | userId defaults to '' when ctx.from is undefined. Empty userId may cause downstream issues (session router). | Guard: if ctx.from undefined, skip message. |
| 12 | LOW | P1: Design | apps/axel/src/container.ts:217 | Unsafe cast 'as Parameters<typeof ...>' for Anthropic client. Type mismatch between ContainerDeps and actual SDK. | Define minimal AnthropicClient interface in ContainerDeps. |
| 13 | LOW | P1: Design | apps/axel/src/main.ts:48 | gracefulShutdown() receives channels: [] — no channels stopped during shutdown. | Pass active channels once channel start() is wired in bootstrap(). |
| 14 | LOW | P7: DRY | apps/axel/src/container.ts:31+lifecycle.ts:4 | HealthCheckTarget interface duplicated identically in both files. | Define in lifecycle.ts and import from container.ts. |

### 7-Perspective Summary

| Perspective | Finding |
|-------------|---------|
| 1. Design Quality | **Very Good.** Discord/Telegram channels follow clean AxelChannel pattern — DI-friendly constructors, streaming via message edit, reconnection tracking (Discord). Gateway uses functional factory pattern (createGatewayServer) with closure — clean separation of config/deps/routes. DI container correctly wires ~20 services with no DI framework. 2 design debt items: EstimateTokenCounter locale-awareness and stub ContextDataProvider methods. |
| 2. Complexity & Readability | **Very Good.** All files well within 400-line limit (max: server.ts 364 lines). Streaming logic extracted into helper functions (handleOverflow, throttledEdit, finalizeStream). Gateway routes table is clean and declarative. Config schema (Zod) is well-structured with clear defaults. No deep nesting (max 3 levels). |
| 3. Security | **2 MEDIUM issues found.** (1) timingSafeEqual length leak — low practical risk for static Bearer tokens but should be fixed. (2) WS query param token exposure — acceptable Phase 0 per ADR-019 but must be upgraded in Phase 2. CORS properly validated. Error redaction correctly ENV-aware (dev vs production). |
| 4. Bugs & Reliability | **1 MEDIUM + 1 LOW.** (1) No HTTP body size limit — real OOM risk. (2) Telegram userId empty string on undefined ctx.from. No crash bugs. Graceful shutdown correctly follows 4-phase ADR-021 pattern with error recovery at each phase. |
| 5. Changeability | **Very Good.** Adding new channels follows established pattern. Adding new gateway routes requires only adding to routes table. DI container is extensible — add new service, add health check target. Config schema is additive (new fields with defaults). |
| 6. Dead Code | **1 LOW.** addReaction() stub in Discord channel. All other exports used. No commented-out code. |
| 7. DRY | **2 issues.** (1) splitMessage() duplicated across Discord+Telegram. (2) HealthCheckTarget duplicated in container.ts+lifecycle.ts. Both easily fixable. |

### ADR Compliance

| ADR | Check | Result |
|-----|-------|--------|
| ADR-009 (Channel Architecture) | AxelChannel interface compliance for Discord/Telegram | **PASS** — both implement full interface with capabilities, lifecycle, streaming. |
| ADR-011 (Error Handling) | Error redaction in gateway responses | **PASS** — sendError() uses generic message in production, detail in development. |
| ADR-019 (Auth Strategy) | Static Bearer token Phase 0 | **PASS** — timing-safe comparison, WS query param auth (Phase 0 documented limitation). |
| ADR-021 (Resilience) | Graceful shutdown, reconnection | **PASS** — 4-phase shutdown in lifecycle.ts, Discord reconnection tracking with degraded health state. |

## QA-017 Code Review Findings (Phase D: EDGE-001 channel types + EDGE-002 CLI channel)

### Issues Found: 0 CRITICAL, 0 HIGH, 3 MEDIUM, 3 LOW

| # | Sev | Location | Description | Fix |
|---|-----|----------|-------------|-----|
| 1 | MEDIUM | channels/tests/setup.ts:25-43 | 3 unused stub functions (mockReadline, mockDiscord, mockTelegram) with TODO comments. EDGE-002 implements its own createMockReadline() instead. Dead code. | Remove stubs; each EDGE task implements its own mocks. |
| 2 | MEDIUM | channels/src/cli/cli-channel.ts:76-80 | Handler errors caught with .catch() fire-and-forget pattern. No await — errors may be lost if process crashes between .catch() registration and rejection. Multiple handlers run sequentially in for...of but catch independently. | Document fire-and-forget semantics. Consider Promise.allSettled() for Discord/Telegram channels. Acceptable for CLI. |
| 3 | MEDIUM | channels/src/cli/cli-channel.ts:51 | Default onError is no-op (() => {}). Handler errors silently swallowed in production. | Default to console.error or accept Logger interface. Document that explicit onError required for production observability. |
| 4 | LOW | core/tests/types/channel.test.ts:1-513 | Test file 513 lines. 8 mock channel objects with near-identical structure — high repetition. | Extract createBaseMockChannel() factory. Not blocking (Rule 14 applies to src only). |
| 5 | LOW | channels/src/cli/cli-channel.ts:83-85 | readline 'close' handler sets started=false but doesn't null this.rl. Subsequent stop() calls this.rl.close() again (double-close). Harmless for Node.js readline. | Set this.rl = null in close handler. |
| 6 | LOW | channels/src/cli/cli-channel.ts:14-22 | CLI_CAPABILITIES is shared module-level const. Multiple CliChannel instances share same reference. Safe due to readonly but unusual pattern. | No fix needed — readonly prevents mutation. |

### 7-Perspective Summary

| Perspective | Finding |
|-------------|---------|
| 1. Design Quality | **Excellent.** Clean AxelChannel interface: deep module (7 capabilities, 4 required methods, 5 optional). CLI implementation is minimal but complete. Constructor injection for I/O dependencies (createReadline, write, onError). Single Responsibility maintained. No God objects. |
| 2. Complexity & Readability | **Excellent.** channel.ts: 98 lines, pure interfaces. cli-channel.ts: 133 lines, no deep nesting, clear lifecycle (start→message→stop). Methods are 5-15 lines each. Naming is clear and self-documenting. |
| 3. Security | **No issues.** CLI channel has no external network input. readline operates on trusted local stdin. No command execution, no file I/O, no path handling. |
| 4. Bugs & Reliability | **No bugs found.** Double-start throws. Stop before start is safe (no-op). Close event correctly transitions health. Handler errors caught without crashing channel. Empty/whitespace input filtered. |
| 5. Changeability | **Excellent.** Adding new channel adapters follows clear pattern: implement AxelChannel, declare capabilities, handle lifecycle. CLI channel provides a reference implementation template. |
| 6. Dead Code | **1 issue.** setup.ts contains 3 unused stub functions. |
| 7. DRY | **Good.** Minor duplication in test file (8 nearly identical mock channels). Source code has no DRY violations. |

### ADR Compliance

| ADR | Check | Result |
|-----|-------|--------|
| ADR-009 (Channel Architecture) | AxelChannel interface matches plan L8 | **PASS** — all 7 interface members, lifecycle methods, optional methods per plan. |
| ADR-011 (Error Handling) | Error redaction in channel responses | **N/A** — CLI channel doesn't handle external errors; delegated to orchestrator. |
| ADR-014 (Session Router) | channelId for cross-channel sessions | **PASS** — InboundMessage.channelId = 'cli'. |
| ADR-020 (Error Taxonomy) | Typed errors | **PASS** — handler errors caught as unknown, forwarded to onError callback. |
| ADR-021 (Resilience) | Circuit breaker for reconnection | **N/A** — CLI has no reconnection (local stdin). Reconnection lifecycle hooks defined in interface for Discord/Telegram. |

## QA-016 Code Review Findings (Phase C: INFRA — db, cache, embedding, llm, mcp, common)

### Issues Found: 0 CRITICAL, 2 HIGH, 7 MEDIUM, 4 LOW

| # | Sev | Location | Description | Fix |
|---|-----|----------|-------------|-----|
| 1 | HIGH | infra/tests/mcp/tool-registry.test.ts:2 | zod package not resolvable at test runtime — 16 MCP tests fail. CONSTITUTION §10 violation: "All tests pass" not met. | Run `pnpm install` to resolve zod in infra workspace |
| 2 | HIGH | infra/src/cache/redis-working-memory.ts:73,89,123,137,148,178,185,195 | 8 bare `catch` blocks silently swallow Redis errors — no logging, no metrics, no observability. Debugging Redis degradation impossible without external tooling. | Add structured logging to each catch block; expose circuit state via public getter |
| 3 | MEDIUM | infra/src/llm/google-provider.ts:51 | Module-level `let toolCallCounter = 0` — global mutable state across all instances, never reset, grows unbounded. | Move to instance field or use crypto.randomUUID() for callId |
| 4 | MEDIUM | infra/src/cache/redis-working-memory.ts:26-30,232-237 | Hand-rolled circuit breaker duplicates common/circuit-breaker.ts. Missing: cooldown recovery, half_open probing. Once open, never closes. | Replace with CircuitBreaker from common/ |
| 5 | MEDIUM | infra/src/db/pg-semantic-memory.ts:92-123 | decay() loads ALL memory importances into JS before deleting. For 100K+ rows, wasteful memory usage. | Combine into single SQL WITH deleted/stats CTE |
| 6 | MEDIUM | infra/src/embedding/index.ts | GeminiEmbeddingService implementation in index.ts instead of dedicated file. Inconsistent with other modules (db, cache, llm, mcp use separate files + barrel). | Move to embedding/gemini-embedding.ts, make index.ts a barrel |
| 7 | MEDIUM | CONSTITUTION §9 | Infra imports from core/memory/types.js and core/orchestrator/types.js — not strictly within core/src/types/. Approved in PLAN_SYNC B.7 but §9 text not updated. | Architect update §9 import table |
| 8 | MEDIUM | infra/src/mcp/tool-registry.ts:239-244 | validatePath() does not resolve symlinks — symlink inside basePath pointing outside bypasses check. | Add fs.realpathSync() after path.resolve() |
| 9 | MEDIUM | infra/src/db/pg-episodic-memory.ts:83 | searchByTopic() ILIKE with user input — SQL wildcard chars (%, _) in topic parameter cause unexpected matching. | Escape LIKE special chars or use ts_query |
| 10 | LOW | infra/src/mcp/tool-registry.ts:37-69 | zodToJsonSchema() simplified — only handles basic types. Nested objects, unions, literals not supported. | Replace with zod-to-json-schema library or document limitation |
| 11 | LOW | infra/src/cache/redis-working-memory.ts:130-151 | compress() is simple string concatenation — placeholder, not real compression/summarization. | Document as TODO for LLM-based summarization |
| 12 | LOW | infra/src/db/pg-session-store.ts:100-125 | getStats() query overly complex, returns mostly hardcoded values (avgResponseTimeMs=0, toolsUsed=[]). | Simplify to basic turn_count + channel_breakdown |
| 13 | LOW | infra/src/**/*.ts | All imports use relative paths (../../../core/src/) instead of @axel/core/* subpath exports configured by DEVOPS-004. | Migrate to @axel/core/{types,memory,orchestrator} |

### 7-Perspective Summary

| Perspective | Finding |
|-------------|---------|
| 1. Design Quality | **Very Good.** Clean DI architecture: all adapters implement core interfaces via constructor injection. PgPoolDriver/RedisClient/GeminiEmbeddingClient are minimal interface contracts — deep modules with simple surfaces. Consistent pattern across all 6 DB adapters. One duplication issue: redis-working-memory hand-rolls circuit breaker instead of reusing common/. |
| 2. Complexity & Readability | **Very Good.** Largest file is mcp/tool-registry.ts at 256 lines (well within 400 limit). SQL queries are well-formatted with clear parameterization. pg-session-store getStats() query is unnecessarily complex (LATERAL + jsonb_object_agg for mostly static data). pg-semantic-memory search() builds dynamic WHERE clause cleanly. |
| 3. Security | **2 issues found.** (1) validatePath() does not resolve symlinks — path traversal via symlink possible. (2) searchByTopic() ILIKE with unescaped user input allows SQL wildcard injection. Both are MEDIUM severity — exploitable but require specific conditions. |
| 4. Bugs & Reliability | **1 issue found.** google-provider.ts module-level mutable counter is a latent concurrency/determinism issue. No crash bugs found. PG-first write pattern in redis-working-memory correctly ensures data durability. Circuit breaker in common/ is well-implemented with clean state transitions. |
| 5. Changeability | **Good.** Adding new PG adapters follows clear template (constructor→pool, implement interface, toEntity mapper). Adding new LLM providers follows the same pattern (client interface → wrapError → processStream). Embedding service could support new providers by implementing the same interface. |
| 6. Dead Code | **None found.** All exports used. No commented-out code. Every module has corresponding tests. |
| 7. DRY | **Good with 1 exception.** healthCheck() pattern repeated across 6 DB adapters + 2 cache modules — identical try/catch structure. Could extract to utility, but volume is acceptable. The CircuitBreaker duplication in redis-working-memory is the main DRY violation. |

## QA-015-PROACTIVE Code Review Findings (CORE-006: Orchestrator)

### Issues Found: 0 CRITICAL, 0 HIGH, 4 MEDIUM, 3 LOW

| # | Sev | Location | Description | Fix |
|---|-----|----------|-------------|-----|
| 1 | MEDIUM | orchestrator/types.ts:79-92 | Plan §4.6 LlmProvider specifies 4 members (id, chat, countTokens, healthCheck) and ChatParams has 7 fields. Implementation narrows to chat-only with 2-field LlmChatParams. Deliberate DI simplification — full LlmProvider belongs in infra. | Architect add PLAN_SYNC drift entry |
| 2 | MEDIUM | orchestrator/types.ts:40 | Plan and ADR-014 UnifiedSession omit turnCount; implementation adds it. Field is useful and tested. | Architect update ADR-014 to include turnCount |
| 3 | MEDIUM | orchestrator/types.ts:44-48 | Plan's SessionRouter interface (3 methods: resolveSession, switchChannel, endSession) replaced by SessionStore DI interface (5 methods). switchChannel() absorbed into resolve(). SessionRouter is now a thin wrapper class. Design improvement over plan. | Architect update PLAN_SYNC — document redesign rationale |
| 4 | MEDIUM | react-loop.ts:70-77 | makeToolMessage/makeToolErrorMessage use empty sessionId ('') and turnId (0). Functionally acceptable for LLM context but downstream filtering could miscategorize. | Consider accepting sessionId from ReActLoopParams |
| 5 | LOW | react-loop.ts:49-57 | chunkToEvent() accepts `{type: string, content: unknown}` instead of `LlmChatChunk` — loses type safety from discriminated union. | Change parameter type to LlmChatChunk |
| 6 | LOW | react-loop.ts:233 | exponentialBackoff constants (100ms base, 5s cap) are reasonable but implicit. doneEvent() token usage hardcoded to zeros — production must aggregate from LLM. | Document for infra implementation |
| 7 | LOW | session-router.ts:1-78 | Thin delegation wrapper — 6 methods are 1-line delegates except getChannelContext (10 lines). Justified for DI boundary and stable API surface. | No fix needed |

### 7-Perspective Summary

| Perspective | Finding |
|-------------|---------|
| 1. Design Quality | **Excellent.** Clean separation: ReActLoop (pure generator, no DI container awareness), SessionRouter (thin wrapper over SessionStore DI contract), types (Zod + interfaces). Constructor injection pattern consistent with project conventions. LlmProvider/ToolExecutor/SessionStore are deep modules — simple interface, rich behavior delegated to infra. Justified deviations from plan (narrowed DI contracts, SessionStore extraction). |
| 2. Complexity & Readability | **Very Good.** react-loop.ts at 269 lines is the largest file but well-structured: helper functions extracted (chunkToEvent, executeToolCall, runIteration, runIterationSafe), clear separation between iteration logic and error handling. refactor commit `e697bd4` split reactLoop for Biome complexity compliance. |
| 3. Security | **No issues.** No external input handling. Tool execution delegates to ToolExecutor (timeout-protected). Error messages use toErrorInfo() — no stack traces exposed. |
| 4. Bugs & Reliability | **No bugs found.** Error recovery correctly handles: retryable ProviderError (backoff + retry), permanent ProviderError (stop), ToolError (error message to LLM for alternative action), total timeout, max iterations. AsyncGenerator cleanup is implicit (break exits for-await). |
| 5. Changeability | **Good.** Adding new error types requires only extending toErrorInfo(). Adding new DI contracts follows established pattern. react-loop.ts could accept additional config (backoff params, retry limits) without structural changes. |
| 6. Dead Code | **None found.** All exports used. All helper functions called. No commented-out code. |
| 7. DRY | **Good.** makeToolMessage/makeToolErrorMessage share message construction pattern — could theoretically share a base, but differences (error field, content structure) justify separate functions. toErrorInfo() centralizes error conversion. |

## QA-014-PROACTIVE Code Review Findings (CORE-004: Context Assembly)

### Issues Found: 0 CRITICAL, 0 HIGH, 2 MEDIUM, 1 LOW

| # | Sev | Location | Description | Fix |
|---|-----|----------|-------------|-----|
| 1 | MEDIUM | context/types.ts:72 | Plan §3.3 defines `getMetaMemory()` return type as `PrefetchedMemory[]` but implementation uses `HotMemory[]`. Arch interface-contract also specifies `PrefetchedMemory`. | Architect update plan §3.3 to use HotMemory, or create PrefetchedMemory type alias |
| 2 | MEDIUM | context/assembler.ts:165-181 | `truncateToFit()` binary search performs O(log n) async `counter.count()` calls. For 200K char text, ~17 API calls × 50-100ms = 0.85-1.7s. ADR-012 LRU cache won't help (unique substrings). | For production: add estimate-based range narrowing before binary search to reduce count() calls |
| 3 | LOW | context/assembler.ts:160-180 | 7 inline formatter functions. Currently manageable at 242 lines; extract to formatters.ts if file approaches 300+ lines. | No action needed now |

### 7-Perspective Summary

| Perspective | Finding |
|-------------|---------|
| 1. Design Quality | **Excellent.** Clean DI architecture: ContextDataProvider (7 methods) + TokenCounter (count/estimate) injected via constructor. ContextAssembler has single responsibility (assembly), no I/O. Plan §3.3 interface compliance with one justified drift (HotMemory vs PrefetchedMemory). |
| 2. Complexity & Readability | **Excellent.** assembler.ts at 242 lines is well-structured. Priority-ordered assembly is clear with section comments. DEFAULTS constant eliminates magic numbers. Binary-search truncation is elegant. |
| 3. Security | **No issues.** No external input handling. Internal data processing only. |
| 4. Bugs & Reliability | **No bugs found.** Empty content/systemPrompt edge cases handled. Budget overflow triggers truncation correctly. Binary search correctness verified by tests (front-preserving truncation). |
| 5. Changeability | **Good.** Adding new context sections requires only: (1) add budget slot, (2) add provider method, (3) add formatter, (4) add assembly step. Formatters could be extracted if they grow. |
| 6. Dead Code | **None found.** All exports and functions used. |
| 7. DRY | **Excellent.** `addSection()` private method abstracts the repeated pattern of format→truncate→count→push. 7 assembly steps share this pattern cleanly. |

## QA-013 Code Review Findings (CORE-003: Memory Layers M0-M5)

### Issues Found: 0 CRITICAL, 0 HIGH, 3 MEDIUM, 3 LOW

| # | Sev | Location | Description | Fix |
|---|-----|----------|-------------|-----|
| 1 | MEDIUM | memory/types.ts:141 | ADR-013 SemanticMemory.decay() param named `DecayConfig` but implementation uses `DecayRunConfig` — minor name drift from ADR spec | Architect update PLAN_SYNC or ADR-013 to align |
| 2 | MEDIUM | memory/episodic-memory.ts:43-44 | Type assertion workaround: `(session as { summary: ... }).summary = summary` to mutate readonly fields. Internally safe but breaks readonly contract. | Consider making StoredSession fields mutable internally (drop readonly on summary/endedAt) |
| 3 | MEDIUM | PLAN_SYNC.md:103-108 | B.3 Memory Layers status is NOT_STARTED — needs update to IN_SYNC post-CORE-003. Already tracked as SYNC-003 in BACKLOG. | SYNC-003 will resolve |
| 4 | LOW | memory/stream-buffer.ts:16-21 | `consume()` reads events but does not remove them from buffer — semantically more of a `peek`. Redis Streams `XREADGROUP` would consume (acknowledge). In-memory stub behavior acceptable. | No action for stub; document for infra implementation |
| 5 | LOW | memory/meta-memory.ts:62-64 | `pruneOldPatterns()` always returns 0 — no timestamp tracking in stub. Acceptable for stub but test only verifies `typeof pruned === 'number'`, not actual pruning behavior. | Optional: add timestamp to patterns for more realistic stub |
| 6 | LOW | memory/semantic-memory.ts:57 | Search applies limit via `slice(0, limit)` BEFORE scoring, meaning highest-scoring results may be excluded. Production pgvector impl should ORDER BY similarity THEN limit. | No fix for stub; infra implementation must score-then-limit |

### 7-Perspective Summary

| Perspective | Finding |
|-------------|---------|
| 1. Design Quality | **Excellent.** Clean 6-layer architecture faithfully implements ADR-013. Each layer has single responsibility with clear interface contracts. Deep modules (rich behavior behind simple interface). `layerName` discriminant enables runtime identification. |
| 2. Complexity & Readability | **Excellent.** Largest file is types.ts at 238 lines (well within 400 limit). BFS traversal in conceptual-memory is clear and handles cycles. No deep nesting. Consistent patterns across all 6 layers. |
| 3. Security | **No issues.** No external input handling. In-memory stubs have no I/O. `healthCheck()` on all layers returns static healthy — safe for stubs. |
| 4. Bugs & Reliability | **No bugs found.** Cosine similarity handles zero-norm and mismatched lengths correctly. Episodic search correctly filters by session end state. BFS cycle detection via visited set. |
| 5. Changeability | **Good.** Interfaces in types.ts cleanly separate from implementations. Swapping InMemory* stubs with real implementations (Redis/PG) requires only implementing the interface. Hybrid search weights (0.7/0.3) are hardcoded but acceptable for stubs. |
| 6. Dead Code | **None found.** All exports used. No commented-out code. Every interface method has a corresponding implementation and test. |
| 7. DRY | **Good.** `healthCheck()` pattern is identical across all 6 layers — could be extracted to a base mixin, but not worth the abstraction for stubs that will be replaced. `makeEmbedding()` and `makeNewMemory()` test helpers avoid test duplication. |

## QA-012 Code Review Findings (CORE-001+002+005)

### Issues Found: 0 CRITICAL, 0 HIGH, 2 MEDIUM, 3 LOW

| # | Sev | Location | Description | Fix |
|---|-----|----------|-------------|-----|
| 1 | MEDIUM | react.ts:24 | Plan-code drift: ReActEvent error uses AxelErrorInfo (serializable) instead of plan's AxelError (class) | Update plan §3.5 or PLAN_SYNC drift entry |
| 2 | MEDIUM | tool.ts:18 | Plan-code drift: ToolDefinition.inputSchema=unknown, handler omitted (Rule 9 compliance) | Update plan §3.5 to reflect infra-layer Zod decision |
| 3 | LOW | calculator.ts:26 | Nullish coalescing ?? fallback untested (branch 75%) | Optional: test with config missing a key |
| 4 | LOW | decay/types.ts:30 | typeMultipliers schema accepts any string key, not just MemoryType | Consider z.enum for type safety |
| 5 | LOW | engine.ts:41 | Bracket access on Record<string,T> — works but may need adjustment if noUncheckedIndexedAccess enabled | No action needed currently |

## Plan Quality Gate Status (carried from QA-011)

### CONSTITUTION §3 Quality Gates

| Gate | Status |
|------|--------|
| 1. Consistency | **PASS** (3 MEDIUM remnants resolved by FIX-PRE-IMPL) |
| 2. Completeness | **PASS** |
| 3. Traceability | **PASS** |
| 4. Feasibility | **PASS** |
| 5. Sources | **PASS** |

**PLAN CLOSURE: APPROVED** (QA-009/QA-011)

## Quality Review History

| Task | Cycle | Scope | Issues | Result |
|------|-------|-------|--------|--------|
| QA-001 | 1-2 | Plan internal consistency | 3H 5M 1L | Initial review |
| QA-002 | 1-2 | claude_reports mapping | 3M gaps | 20/23 mapped |
| QA-003 | 3 | Feasibility (npm, versions, claims) | 5H 4M 1L | Redis drift, deprecated model |
| QA-004 | 4 | Cross-reference integrity | 2H 2M 1L | Type ownership, migration direction |
| QA-005 | 5 | Security design | 3H 4M 3L | Auth gaps, WS auth, command injection |
| QA-006 | 6 | Implementability | 8H 4M 1L | DI, error taxonomy, lifecycle gaps |
| QA-007 | 7 | Comprehensive synthesis | 2C + RC analysis | 45 issues → 7 WPs |
| QA-008 | 11 | Quality gate re-verification | 2H 5M 2L | 3 PASS, 2 CONDITIONAL |
| QA-009 | 13 | Final sign-off | 0 new | ALL 5 GATES PASS |
| QA-010 | 17 | 768d→3072d impact analysis | 2H 3M | Proactive, drift PASS |
| QA-011 | 19 | FIX-AUDIT verification | 3M new | 4 PASS, 1 CONDITIONAL |
| QA-012 | 35 | Phase B code review (CORE-001+002+005) | 2M 3L | ALL CONSTITUTION gates PASS |
| QA-013 | 36 | Phase B code review (CORE-003 memory M0-M5) | 3M 3L | ALL CONSTITUTION gates PASS |
| QA-014-PROACTIVE | 38 | Phase B code review (CORE-004 context assembly) | 2M 1L | ALL CONSTITUTION gates PASS |
| QA-015-PROACTIVE | 39 | Phase B code review (CORE-006 orchestrator) | 4M 3L | ALL CONSTITUTION gates PASS |
| **QA-013 FINAL** | **41** | **Phase B complete — 330 tests smoke test on merged main** | **11M 10L total** | **ALL CONSTITUTION gates PASS, READY FOR PHASE B CLOSURE** |
| **QA-016** | **44** | **Phase C INFRA code review — db, cache, embedding, llm, mcp, common (18 src, 14 test files)** | **2H 7M 4L** | **CONDITIONAL PASS** (zod dep fix needed for full PASS) |
| **QA-017** | **50** | **Phase D EDGE code review — EDGE-001 (channel types) + EDGE-002 (CLI channel) (2 src, 2 test files)** | **0H 3M 3L** | **PASS** — TDD, §9, §10, §14 all PASS. Excellent design quality. |
| **QA-018** | **54** | **Phase D code review batch 2 — EDGE-003 (Discord) + EDGE-004 (Telegram) + EDGE-005 (Gateway) + BOOTSTRAP-001 (DI) (7 src, 7 test files)** | **0H 8M 6L** | **CONDITIONAL PASS** — TDD PASS, §9 PASS, §10 CONDITIONAL (worktree dep sync), §14 PASS. 2 security items (timing-safe length leak, WS token in query param). Coverage: channels 94%>75%, gateway 84%>80%. |
| **QA-019** | **61** | **Phase E integration review — INTEG-003/004/005/006/007 (gateway→orchestrator, bootstrap, PG+Redis, E2E roundtrip)** | **0H 8M 4L** | **PASS** — TDD PASS, §9 KNOWN ISSUE (CONST-AMEND-001), §10 PASS (774 tests), §14 PASS (max 321). Coverage: all targets exceeded. 3 MEDIUM overlap with ERR-071~075 (in progress). Good integration quality. |
| **QA-020** | **65** | **Final Phase E review — INTEG-008 (webhook Telegram+Discord) + FIX-AUDIT-E-004 (security headers+unsafe cast)** | **0H 3M 4L** | **PASS** — ALL CONSTITUTION gates PASS. TDD PASS (RED→GREEN verified). §9 PASS. §10 PASS (831 tests). §14 PASS (max 354). Coverage: gateway 95.28%>80%. Phase E executable work verified complete. |
