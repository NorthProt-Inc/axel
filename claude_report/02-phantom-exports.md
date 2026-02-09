# Phase 2: 패키지 Export 유령 경로 검사

**검증 일시**: 2026-02-08
**검증 기준**: package.json에 선언된 모든 export path에 실제 파일이 매핑되는가?

---

## 패키지별 검사 결과

### 1. @axel/gateway — FAIL (유령 export 3개)

| Export Path | 선언 파일 | 실제 파일 존재 | 판정 |
|-------------|----------|--------------|------|
| `.` | `./src/index.ts` | **존재** | PASS |
| `./routes` | `./src/routes/index.ts` | **미존재** | **FAIL** |
| `./middleware` | `./src/middleware/index.ts` | **미존재** | **FAIL** |
| `./websocket` | `./src/websocket/index.ts` | **미존재** | **FAIL** |

**사용 현황**: `apps/axel/src/main.ts`에서 root export(`.`)만 사용. 유령 경로 3개는 어디서도 import되지 않음.

**심각도**: **고** — package.json에 존재하지 않는 파일을 가리키는 export 선언. 다만 실제 사용 중인 코드에는 영향 없음 (미사용 export).

---

### 2. @axel/channels — FAIL (root export 누락)

| Export Path | 선언 파일 | 실제 파일 존재 | 판정 |
|-------------|----------|--------------|------|
| `.` | `./src/index.ts` | **미존재** | **FAIL** |
| `./cli` | `./src/cli/index.ts` | **존재** | PASS |
| `./discord` | `./src/discord/index.ts` | **존재** | PASS |
| `./telegram` | `./src/telegram/index.ts` | **존재** | PASS |

**사용 현황**: `@axel/channels/cli`, `@axel/channels/discord`, `@axel/channels/telegram` — subpath만 사용됨.

**심각도**: **중** — root export 유령이지만, 실제 코드에서는 subpath만 사용.

---

### 3. @axel/core — PASS (모든 export 정상)

| Export Path | 선언 파일 | 실제 파일 존재 | 판정 |
|-------------|----------|--------------|------|
| `./types` | `./src/types/index.ts` | **존재** | PASS |
| `./memory` | `./src/memory/index.ts` | **존재** | PASS |
| `./decay` | `./src/decay/index.ts` | **존재** | PASS |
| `./context` | `./src/context/index.ts` | **존재** | PASS |
| `./persona` | `./src/persona/index.ts` | **존재** | PASS |
| `./orchestrator` | `./src/orchestrator/index.ts` | **존재** | PASS |

**사용 현황**: 41개 파일에서 75개 import — 가장 활발하게 사용되는 패키지.

---

### 4. @axel/infra — PASS

| Export Path | 선언 파일 | 실제 파일 존재 | 판정 |
|-------------|----------|--------------|------|
| `.` | `./src/index.ts` | **존재** | PASS |

**비고**: root index.ts에서 모든 내부 모듈을 re-export. AxelPgPool, Pg*Memory, Redis*, LLM providers, MCP 등 12+ export를 단일 진입점으로 노출.

---

### 5. @axel/ui — PASS (선언된 export 기준)

| Export Path | 선언 파일 | 실제 파일 존재 | 판정 |
|-------------|----------|--------------|------|
| `./tokens` | `./src/tokens/index.ts` | **존재** | PASS |
| `./cli` | `./src/cli/index.ts` | **존재** | PASS |

**비고**: root export (`.`)는 미선언이나 `src/index.ts`는 존재. 의도적 미노출로 판단.

---

### 6. Apps & Tools — 해당 없음

| 패키지 | exports 필드 | 비고 |
|--------|-------------|------|
| apps/axel | 없음 | 메인 애플리케이션 (진입점만 존재) |
| apps/webchat | 없음 | Svelte SPA |
| tools/migrate | bin 엔트리포인트만 | CLI 도구 |
| tools/migrate-axnmihn | bin 엔트리포인트만 | CLI 도구 |

---

## README 대조

README `Package Structure` 표의 Exports 컬럼:

| 패키지 | README Exports 주장 | 실제 | 판정 |
|--------|-------------------|------|------|
| @axel/core | `types`, `memory`, `decay`, `context`, `persona`, `orchestrator` | 모두 존재 | **PASS** |
| @axel/infra | Default export | 존재 | **PASS** |
| @axel/channels | `cli`, `discord`, `telegram` | subpath 모두 존재 (root만 누락) | **PARTIAL** |
| @axel/gateway | `routes`, `middleware`, `websocket` | **3개 모두 미존재** | **FAIL** |
| @axel/ui | `cli`, `tokens` | 모두 존재 | **PASS** |

---

## 종합 판정

| 항목 | 판정 | 심각도 |
|------|------|--------|
| @axel/gateway 유령 export 3개 | **FAIL** | 고 |
| @axel/channels root export 누락 | **FAIL** | 중 |
| 기타 패키지 | **PASS** | — |

### 유령 Export 총 4개

1. `@axel/gateway` → `./routes` (src/routes/index.ts 미존재)
2. `@axel/gateway` → `./middleware` (src/middleware/index.ts 미존재)
3. `@axel/gateway` → `./websocket` (src/websocket/index.ts 미존재)
4. `@axel/channels` → `.` (src/index.ts 미존재)

### 경감 요인

- 유령 export 4개 모두 실제 코드에서 import되지 않음
- 빌드·타입체크·테스트 모두 통과 (유령 export가 실질적 빌드 실패를 유발하지 않음)
- 미래 개발 시 혼란 유발 가능성 존재
