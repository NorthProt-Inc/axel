# PERF-VERIFY: 통합 검증

## Metadata

| Field | Value |
|-------|-------|
| ID | PERF-VERIFY |
| Severity | — |
| Wave | 3 |
| Depends On | Wave 1 전체, Wave 2 전체 |
| Blocks | (없음) |

## Purpose

Wave 1 + Wave 2의 모든 성능 최적화가 적용된 후, 전체 시스템의 정합성과 성능 개선을 검증한다.

## Verification Checklist

### 1. Build Verification

- [ ] `pnpm build` — 전체 패키지 빌드 성공
- [ ] TypeScript 컴파일 에러 없음
- [ ] 패키지 간 의존성 정합 (no circular deps introduced)

### 2. Test Suite

- [ ] `pnpm test` — 전체 테스트 통과
- [ ] 테스트 패키지별 결과:
  - [ ] `@axel/core` — context, memory, orchestrator 테스트
  - [ ] `@axel/infra` — db, cache, link, memory 테스트
  - [ ] `@axel/gateway` — server, prompt-defense 테스트
  - [ ] `@axel/channels` — discord 테스트
  - [ ] `@axel/ui` — cli output, theme 테스트
- [ ] 새로 추가된 테스트 모두 통과
- [ ] 커버리지 회귀 없음

### 3. Performance Benchmarks

각 최적화에 대한 before/after 벤치마크 실행:

| Task | Benchmark | Expected Improvement |
|------|-----------|---------------------|
| C1 | `truncateToFit` — 4K text, count calls | 15-20 → 2-3 |
| C2 | `assemble()` — 7 layer fetch latency | sum → max (3-5x) |
| C3 | decay cycle — 500 rows, PG queries | N → 2-3 |
| C4 | consolidation — 10 sessions cycle time | 순차 → 병렬 (2-3x) |
| C5 | URL processing — 5 URLs latency | 5x RTT → 1-2x RTT |
| C6 | entity extraction — 10 entities, DB calls | 20-25 → 2-3 |
| H1 | graph traverse — 500 relations | O(R) → O(degree) |
| H2-H3 | flush + pushTurn RTT | N+3 → 1+1 |
| H4-H6 | rate limit bucket memory | 무제한 → 상한 |
| H5 | sanitizeInput — string scans | 4 → 1 |
| M1 | cosineSimilarity — null checks | 제거 확인 |
| M2 | searchByTopic — toLowerCase calls | 감소 확인 |
| M3-M4 | pg-episodic batch — query count | N → 1-2 |
| M5 | WebSocket leak — error handler | 존재 확인 |
| M6 | channel cache — eviction | 동작 확인 |
| M7 | body handling — Buffer based | 확인 |
| M8 | theme singleton — creation count | N → 1 |

### 4. Integration Tests

- [ ] 전체 메시지 처리 파이프라인 (input → context assembly → LLM → memory persist → response)
- [ ] 메모리 계층 일관성 (M0-M5 모두 정상 응답)
- [ ] Gateway HTTP + WebSocket 정상 동작
- [ ] Discord channel 연결 + 메시지 수신/송신
- [ ] Consolidation cycle 완주

### 5. Dependency Consistency

- [ ] README.md의 dependency graph와 각 태스크 파일의 Depends On/Blocks 일치
- [ ] 번들 태스크 (H4-H6-M5-M7, M3-M4, H2-H3) 내 이슈들이 모두 해결됨
- [ ] C1 → C2 시그니처 변경 정상 반영
- [ ] C6 → H1 인터페이스 호환
- [ ] C3 → H2-H3 PG batch 패턴 일관성
- [ ] M1 → C4 임베딩 정규화 반영

### 6. Regression Check

- [ ] 기능 변경 없음 (동일 입력 → 동일 출력)
- [ ] 메모리 사용량 증가 없음 (인덱스 구조 추가 제외)
- [ ] 에러 핸들링 동작 유지

## Execution

```bash
# 1. Full build
pnpm build

# 2. Full test
pnpm test

# 3. Coverage check
pnpm test -- --coverage

# 4. Type check
pnpm exec tsc --noEmit

# 5. Lint
pnpm lint
```

## Sign-off

| Reviewer | Division | Status |
|----------|----------|--------|
| — | dev-core | Pending |
| — | dev-infra | Pending |
| — | dev-edge | Pending |
| — | ui-ux | Pending |
| — | quality | Pending |
