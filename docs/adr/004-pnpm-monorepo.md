# ADR-004: pnpm Monorepo (core/infra/channels/gateway)

> Status: ACCEPTED
> Date: 2026-02-07
> Author: Architecture Division

## Context

Axel은 여러 관심사를 분리해야 한다:
- 순수 비즈니스 로직 (메모리, decay, context assembly)
- I/O 경계 (DB, Redis, LLM API, 파일 시스템)
- 채널 어댑터 (Discord, Telegram, CLI, WebChat)
- HTTP/WS 게이트웨이

이 분리를 프로젝트 구조에 반영해야 한다. axnmihn은 단일 Python 패키지로 모든 것을 포함하여, God Object 5개와 순환 의존이 발생했다.

## Decision

**pnpm workspace monorepo로 4개 패키지 + 2개 앱을 분리한다.**

```
axel/
├── packages/
│   ├── core/       # L0-L4: 순수 로직 (I/O 없음)
│   ├── infra/      # L5: 인프라 어댑터 (I/O 경계)
│   ├── channels/   # L6: 채널 어댑터
│   └── gateway/    # L7: HTTP/WS 서버
├── apps/
│   ├── axel/       # 메인 애플리케이션 (진입점, DI 조립)
│   └── webchat/    # WebChat SPA
└── tools/
    ├── migrate/    # 마이그레이션 도구
    ├── seed/       # 테스트 데이터 시드
    └── bench/      # 벤치마크
```

### 의존성 방향 (단방향)

```
core ← infra ← channels ← gateway ← apps/axel
  (순수)   (I/O)   (채널)    (서버)     (조립)
```

- `core`는 외부 의존 없음 → 순수 함수 테스트 가능
- `infra`는 `core` 인터페이스 구현 → mock 대체 가능
- `channels`는 `core` + `infra` 사용
- `gateway`는 전체 조합
- `apps/axel`은 DI container 조립 + 진입점

## Alternatives Considered

| Option | Pros | Cons |
|--------|------|------|
| **pnpm monorepo (선택)** | 패키지 간 명시적 의존, workspace protocol, OpenClaw 동일 구조 | 초기 설정 비용 |
| Single package | 설정 간단 | 순환 의존 위험, God Object 재발, 테스트 격리 어려움 |
| npm workspaces | npm 기본 제공 | pnpm 대비 디스크 낭비, workspace 기능 열등 |
| yarn workspaces | PnP 모드 빠름 | Plug'n'Play 호환성 이슈, OpenClaw과 불일치 |
| nx monorepo | 캐시, affected graph | 설정 복잡도, 학습 비용, 20개 미만 패키지에 과도 |
| turborepo | 빌드 캐시 | pnpm workspace만으로 충분, 추가 의존성 |

## Consequences

### Positive
- `core` 패키지가 I/O에 의존하지 않음 → 순수 함수로 테스트 가능
- `infra`가 외부 시스템과의 경계를 담당 → mock으로 대체 가능
- `channels`이 독립적 → 새 채널 추가 시 다른 패키지 영향 없음
- OpenClaw의 channel/gateway 분리 패턴과 일치

### Negative
- 패키지 간 import 경로 관리 필요
- 빌드 순서 의존성 (core → infra → channels → gateway)
- 새 개발자에게 구조 학습 비용

## References

- Plan v2.0 Section 3.3: 프로젝트 구조 결정
- OpenClaw의 monorepo 구조 참조
