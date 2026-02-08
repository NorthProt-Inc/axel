# ADR-007: Biome (Replaces ESLint + Prettier)

> Status: ACCEPTED
> Date: 2026-02-07
> Author: Architecture Division

## Context

코드 품질 도구 선택이 필요하다. axnmihn은 Python 기반으로 Black + ruff를 사용했으나, TypeScript 전환 (ADR-001)에 따라 새 도구 선택이 필요하다.

전통적인 TypeScript 프로젝트는 ESLint (린팅) + Prettier (포맷팅) 조합을 사용하나, 이중 설정 + 플러그인 관리의 복잡도가 있다.

## Decision

**Biome을 lint + format 단일 도구로 사용한다.**

### 설정

```json
{
  "formatter": { "indentStyle": "space", "indentWidth": 2 },
  "linter": { "enabled": true, "rules": { "recommended": true } },
  "organizeImports": { "enabled": true }
}
```

## Alternatives Considered

| Option | Pros | Cons |
|--------|------|------|
| **Biome (선택)** | 단일 도구 (lint+format), Rust 기반 빠름, 설정 최소화 | ESLint 대비 규칙 수 적음, 플러그인 생태계 작음 |
| ESLint + Prettier | 가장 성숙, 풍부한 플러그인 | 2개 도구 설정, 충돌 가능, 느림 |
| deno lint | 빠름, 제로 설정 | Node.js 생태계와 불일치, 규칙 제한적 |
| oxlint | Rust 기반, 매우 빠름 | 아직 미성숙, 포맷터 없음 |

### Biome 선택 근거

- OpenClaw과 동일한 도구 → 패턴 일관성
- 단일 설정 파일 (`biome.json`) → ESLint + Prettier 2개 대비 간결
- Rust 기반으로 ESLint 대비 10-100x 빠름
- import 정렬 내장
- ESLint 규칙 커버리지가 Axel 규모에 충분

## Consequences

### Positive
- lint + format + import 정렬이 하나의 도구로 통합
- CI에서 `biome check --write`로 자동 수정 가능
- 설정 파일 1개 (biome.json)
- 빠른 실행 → 개발 중 저장 시 즉시 포맷팅

### Negative
- ESLint 특정 규칙/플러그인 미지원 (예: eslint-plugin-react-hooks)
  - Mitigation: WebChat (React) 한정으로 ESLint 보조 사용 검토 가능
- Biome 커뮤니티가 ESLint 대비 작음 → 문제 해결 리소스 제한적

## References

- Plan v2.0 Section 4 Layer 0: Runtime & Build System
- OpenClaw의 Biome 설정 참조
