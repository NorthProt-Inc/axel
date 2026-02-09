# Phase 3: README 수치·문서 정확성 검사

**검증 일시**: 2026-02-08
**검증 기준**: README에 명시된 수치, 환경변수, Quick Start 절차가 실제와 일치하는가?

---

## 1. 테스트 수

| 항목 | README 주장 | 실제 | 판정 |
|------|-----------|------|------|
| 테스트 수 | 975 tests | 1,111 total (1,075 passed + 36 skipped) | **FAIL** (미갱신) |
| 테스트 파일 수 | 84 files | 90 files | **FAIL** (미갱신) |

**상세**:
- `it()` 호출: ~1,096개
- `test()` 호출: ~15개
- `describe()` 블록: 425개
- skipped tests: 36개 (pg-redis-integration — 외부 인프라 필요)

**판정 근거**: README 수치가 실제보다 **적은** 방향. 과대 주장이 아닌 미갱신 문제.

---

## 2. ADR 수

| 항목 | README 주장 | 실제 | 판정 |
|------|-----------|------|------|
| ADR 수 | 23 ADRs | **21 ADRs** (ADR-001 ~ ADR-021) | **FAIL** (과대 주장) |

**심각도**: 저 — 2개 차이. 삭제된 ADR이 있거나 카운팅 오류.

---

## 3. .env.example 환경변수

### README 환경변수 섹션 vs 실제 .env.example

| README 변수명 | 실제 .env.example 변수명 | 일치 여부 |
|--------------|----------------------|----------|
| `DATABASE_URL` | `AXEL_DB_URL` | **FAIL** (변수명 불일치) |
| `ANTHROPIC_API_KEY` | `AXEL_ANTHROPIC_API_KEY` | **FAIL** (AXEL_ 접두사 누락) |
| `GOOGLE_API_KEY` | `AXEL_GOOGLE_API_KEY` | **FAIL** (AXEL_ 접두사 누락) |
| `REDIS_URL` | `AXEL_REDIS_URL` | **FAIL** (AXEL_ 접두사 누락) |
| `DISCORD_BOT_TOKEN` | `AXEL_DISCORD_BOT_TOKEN` | **FAIL** (AXEL_ 접두사 누락) |
| `TELEGRAM_BOT_TOKEN` | `AXEL_TELEGRAM_BOT_TOKEN` | **FAIL** (AXEL_ 접두사 누락) |
| `GATEWAY_PORT` | `AXEL_PORT` | **FAIL** (변수명 불일치) |
| `GATEWAY_AUTH_TOKEN` | `AXEL_GATEWAY_AUTH_TOKEN` | **FAIL** (GATEWAY → AXEL_GATEWAY) |

### 실제 .env.example에만 있는 변수 (README 미언급)

- `AXEL_ENV` — 환경 설정
- `AXEL_HOST` — 호스트 바인딩
- `AXEL_ANTHROPIC_MODEL` — 모델 선택
- `AXEL_ANTHROPIC_MAX_TOKENS` — 최대 토큰 수
- `AXEL_GOOGLE_FLASH_MODEL` — Google Flash 모델
- `AXEL_GOOGLE_EMBEDDING_MODEL` — 임베딩 모델
- `AXEL_GOOGLE_EMBEDDING_DIMENSION` — 임베딩 차원
- `AXEL_PERSONA_PATH` — 페르소나 경로
- `AXEL_MAX_REQUESTS_PER_MINUTE` — Rate limit
- `AXEL_GATEWAY_CORS_ORIGINS` — CORS 설정

**심각도**: **고** — README의 환경변수 섹션이 완전히 잘못됨. 모든 변수가 `AXEL_` 접두사를 사용하는 실제 규칙과 불일치. 이 섹션을 따라하면 앱이 구성을 인식하지 못함.

---

## 4. Package Structure 표 검증

| 패키지 | README Description | 실제 | 판정 |
|--------|-------------------|------|------|
| @axel/core | "Domain logic" | 맞음 (memory, orchestrator, persona, context, decay) | **PASS** |
| @axel/infra | "Infrastructure" | 맞음 (PostgreSQL, Redis, LLM, embedding, MCP) | **PASS** |
| @axel/channels | "Channel impls" | 맞음 (CLI, Discord, Telegram) | **PASS** |
| @axel/gateway | "HTTP/WS server" | 맞음 (server.ts, ws-handler.ts, route-handlers.ts) | **PASS** |
| @axel/ui | "UI components" | 맞음 (CLI rendering, tokens) | **PASS** |

| 패키지 | README Coverage | 실제 Coverage | 판정 |
|--------|----------------|--------------|------|
| @axel/core | 90%+ | context 97%, decay 96%, memory 99%, orchestrator 90%, persona 96% | **PASS** |
| @axel/infra | 80%+ | cache 95%, db 92%, embedding 99%, llm 97%, mcp 91%, **memory 63%** | **PARTIAL** |
| @axel/channels | 75%+ | cli 96%, discord 91%, telegram 93% | **PASS** |
| @axel/gateway | 80%+ | 전체 93% | **PASS** |
| @axel/ui | 80%+ | cli 96%, tokens 100% | **PASS** |

| 패키지 | README Exports | 실제 Exports | 판정 |
|--------|---------------|-------------|------|
| @axel/core | `types`, `memory`, `decay`, `context`, `persona`, `orchestrator` | 모두 존재 | **PASS** |
| @axel/infra | Default export | 존재 | **PASS** |
| @axel/channels | `cli`, `discord`, `telegram` | subpath 존재, **root(.) 누락** | **PARTIAL** |
| @axel/gateway | `routes`, `middleware`, `websocket` | **3개 모두 미존재** | **FAIL** |
| @axel/ui | `cli`, `tokens` | 존재 | **PASS** |

---

## 5. Quick Start 절차 검증

| 단계 | README 명령어 | 실행 가능 여부 | 판정 |
|------|-------------|-------------|------|
| 1 | `pnpm install` | 성공 | **PASS** |
| 2 | `docker compose -f docker/docker-compose.dev.yml up -d` | 파일 존재 (832 bytes) | **PASS** (파일 존재 확인) |
| 3 | `export DATABASE_URL=...` → `node tools/migrate/dist/cli.js up` | 파일 존재 (3.8 KB). 단 변수명 `DATABASE_URL` vs 실제 `AXEL_DB_URL` | **PARTIAL** |
| 4 | `cp .env.example .env` | 파일 존재 | **PASS** |
| 5 | `pnpm --filter axel dev` | dev 스크립트 존재 여부 미확인 | **미확인** |

### Quick Start 주요 문제점

1. **`DATABASE_URL` 변수명**: README는 `DATABASE_URL` 사용, 실제 migrate CLI도 `DATABASE_URL`을 읽는지 vs `AXEL_DB_URL`을 읽는지 확인 필요
2. **.env 변수명**: README 환경변수 섹션 전체가 `AXEL_` 접두사 없이 기재 → 이대로 설정하면 동작 안 함

---

## 6. Production 배포

| 항목 | README 경로 | 실제 | 판정 |
|------|-----------|------|------|
| 빌드 결과물 | `apps/axel/dist/main.js` | **존재** (4.5 KB) | **PASS** |
| Migration CLI | `tools/migrate/dist/cli.js` | **존재** (3.8 KB) | **PASS** |

---

## 종합 판정

| 항목 | 판정 | 심각도 |
|------|------|--------|
| 테스트 수 ("975 tests, 84 files") | **FAIL** — 미갱신 (실제 1111 tests, 90 files) | 중 |
| ADR 수 ("23 ADRs") | **FAIL** — 과대 주장 (실제 21개) | 저 |
| 환경변수 섹션 | **FAIL** — 모든 변수명 불일치 (AXEL_ 접두사 누락) | **고** |
| Package Structure 표 | **PARTIAL** — gateway Exports 허위 | 고 |
| Quick Start 절차 | **PARTIAL** — 환경변수명 문제로 완주 불가능할 수 있음 | 고 |
| Production 배포 경로 | **PASS** | — |
