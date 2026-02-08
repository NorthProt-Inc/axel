# ADR-008: vitest + testcontainers (Testing Strategy)

> Status: ACCEPTED
> Date: 2026-02-07
> Author: Architecture Division

## Context

axnmihn의 테스트 현황:
- 244 tests, 26% 모듈 커버리지 (claude_reports #19)
- Core pipeline 테스트 커버리지: **0%**
- God Object가 테스트 불가, 전역 상태가 테스트 격리 파괴

Axel은 80%+ 커버리지를 목표로 하며, 특히 `core` 패키지는 90%+ 목표이다. 테스트 프레임워크와 통합 테스트 전략을 결정해야 한다.

## Decision

**vitest를 테스트 프레임워크로, testcontainers를 통합 테스트에 사용한다.**

### 테스트 피라미드

```
                  ╱╲         E2E Tests (5%)
                 ╱  ╲        Docker Compose 전체 스택
                ╱ E2E╲
               ╱──────╲
              ╱        ╲     Integration Tests (25%)
             ╱Integration╲   실제 DB (testcontainers), mock LLM
            ╱────────────╲
           ╱              ╲  Unit Tests (70%)
          ╱   Unit Tests   ╲ 순수 함수, mock 주입
         ╱──────────────────╲
```

### 패키지별 커버리지 목표

| 패키지 | 테스트 유형 | Mock 대상 | 커버리지 |
|--------|-----------|-----------|---------|
| `core` | Unit (순수 함수) | 없음 (I/O 없음) | **90%+** |
| `infra` | Integration | PostgreSQL, Redis (testcontainers) | **80%+** |
| `channels` | Unit + Integration | LLM, 외부 API | **75%+** |
| `gateway` | Integration | DB, LLM | **80%+** |
| `app` | E2E | 없음 (전체 스택) | **60%+** |

### vitest 설정

```typescript
export default defineConfig({
  test: {
    pool: "forks",           // 프로세스 격리 (OpenClaw 패턴)
    testTimeout: 30_000,
    hookTimeout: 30_000,
    coverage: {
      provider: "v8",
      thresholds: { branches: 70, functions: 80, lines: 80, statements: 80 },
    },
  },
});
```

## Alternatives Considered

| Option | Pros | Cons |
|--------|------|------|
| **vitest (선택)** | ESM 네이티브, 빠름, Vite 생태계, OpenClaw 동일 | Jest 대비 플러그인 적음 |
| Jest | 가장 성숙, 풍부한 플러그인 | ESM 지원 불안정, 느림, 설정 복잡 |
| node:test | Node.js 내장, 외부 의존 없음 | 기능 부족, watch 모드 열등 |
| ava | 동시 실행, 간결 API | 커뮤니티 축소, 생태계 작음 |

### testcontainers 선택 근거

- PostgreSQL + Redis 통합 테스트에 실제 DB 인스턴스 필요
- GitHub Actions에서는 service containers로 대체 가능 (Phase 0)
- 로컬 개발에서 testcontainers가 Docker 컨테이너를 자동 관리
- 테스트 격리: 각 테스트 스위트가 독립 컨테이너 사용

## Consequences

### Positive
- `pool: "forks"`로 테스트 간 완전한 프로세스 격리
- v8 coverage provider로 정확한 커버리지 측정
- testcontainers로 실제 PostgreSQL/Redis 환경에서 통합 테스트
- watch 모드로 빠른 TDD 사이클

### Negative
- testcontainers는 Docker 의존 → Docker 없는 환경에서 통합 테스트 불가
  - Mitigation: CI에서 service containers로 fallback
- 통합 테스트 실행 시간 증가 (컨테이너 시작 ~5-10초)

## References

- Plan v2.0 Section 6: 테스트 전략
- Plan v2.0 Section 6.4: 핵심 테스트 케이스
- claude_reports #19 (0% core test coverage)
- OpenClaw의 vitest + pool: "forks" 패턴
