# Phase 1: 빌드·타입체크·테스트 실행 검증

**검증 일시**: 2026-02-08
**검증 기준**: README에 "바로 실행 가능"이라 암시하는 명령어들이 실제로 돌아가는가?

---

## 1. pnpm install

| 항목 | 결과 |
|------|------|
| 실행 결과 | **PASS** |
| 소요 시간 | 525ms |
| 비고 | Lockfile up to date, 추가 설치 없음 |

---

## 2. pnpm build (tsc -b)

| 항목 | 결과 |
|------|------|
| 실행 결과 | **PASS** |
| 에러 | 없음 |
| 비고 | 전체 빌드 성공 (TypeScript project references) |

---

## 3. pnpm typecheck

| 항목 | 결과 |
|------|------|
| 실행 결과 | **PASS** |
| 패키지 수 | 9개 (모두 통과) |

통과한 패키지 목록:
- @axel/core
- @axel/ui
- @axel/migrate
- @axel/migrate-axnmihn
- webchat (svelte-check: 0 errors, 0 warnings)
- @axel/channels
- @axel/gateway
- @axel/infra
- axel (app)

---

## 4. pnpm test

| 항목 | 결과 |
|------|------|
| 실행 결과 | **PASS** (조건부) |
| Test Files | 89 passed, 1 skipped (90 total) |
| Tests | **1075 passed**, 36 skipped (1111 total) |
| Skipped | `pg-redis-integration.test.ts` (36 tests) — 외부 인프라 필요 |
| 소요 시간 | 5.40s |

### README 주장 vs 실제

| README 주장 | 실제 | 판정 |
|------------|------|------|
| 975 tests | 1075 passed + 36 skipped = 1111 total | **FAIL** — README가 오래된 수치. 실제는 더 많음 |
| 84 files | 90 test files | **FAIL** — README가 오래된 수치. 실제는 더 많음 |

> **참고**: README 수치가 실제보다 **적은** 방향으로 틀림 (과대 주장이 아닌 미갱신).

---

## 5. pnpm test:coverage

| 항목 | 결과 |
|------|------|
| 실행 결과 | **PASS** |
| 전체 커버리지 | Stmts 79.42%, Branch 87.67%, Funcs 87.35%, Lines 79.42% |

### 패키지별 커버리지 vs README 주장

| 패키지 | README 주장 | 실제 (Stmts) | 판정 |
|--------|-----------|-------------|------|
| @axel/core | 90%+ | context 97.4%, decay 95.9%, memory 98.6%, orchestrator 89.8%, persona 96%, types 100% | **PASS** — 대부분 90%+ 달성 (orchestrator 89.8%는 근접) |
| @axel/infra | 80%+ | cache 94.6%, db 92%, embedding 99.2%, llm 97.3%, mcp 91.4%, memory 62.8% | **PARTIAL** — memory 모듈 62.8%로 미달 |
| @axel/channels | 75%+ | cli 96%, discord 91.1%, telegram 93.2% | **PASS** — 모두 75%+ 달성 |
| @axel/gateway | 80%+ | 전체 92.84% | **PASS** — 80%+ 달성 |
| @axel/ui | 80%+ | cli 95.8%, tokens 100% (단, src/index.ts 0%) | **PASS** — 실질 코드 기준 80%+ 달성 |

---

## 6. pnpm lint

| 항목 | 결과 |
|------|------|
| 실행 결과 | **FAIL** |
| 에러 수 | 107 errors |
| 경고 수 | 136 warnings |
| 주요 에러 유형 | organizeImports (import 정렬), noExplicitAny, useConst |

---

## 7. pnpm format:check

| 항목 | 결과 |
|------|------|
| 실행 결과 | **FAIL** |
| 에러 수 | 4 errors |
| 비고 | 포맷 불일치 파일 4개 존재 |

---

## 종합 판정

| 항목 | 판정 | 심각도 |
|------|------|--------|
| 빌드 (pnpm build) | **PASS** | — |
| 타입체크 (pnpm typecheck) | **PASS** | — |
| 테스트 (pnpm test) | **PASS** (수치 불일치) | 중 |
| 커버리지 (pnpm test:coverage) | **PARTIAL** (infra/memory 미달) | 중 |
| Lint (pnpm lint) | **FAIL** (107 errors) | 고 |
| Format (pnpm format:check) | **FAIL** (4 errors) | 중 |

### 핵심 발견

1. **빌드·타입체크는 정상 통과** — README 신뢰성 확인
2. **테스트 수치 미갱신** — README "975 tests, 84 files" → 실제 1111 tests, 90 files
3. **커버리지 목표 대부분 달성**, 단 infra/memory 모듈(62.8%)이 80% 미달
4. **Lint 에러 107개** — "바로 실행 가능" 이미지에 부합하지 않음
5. **Format 에러 4개** — CI에서 실패할 수준
