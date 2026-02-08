# ADR-011: ENV-Aware Error Handling (Information Disclosure Prevention)

> Status: ACCEPTED
> Date: 2026-02-07
> Author: Architecture Division

## Context

axnmihn의 에러 처리 문제:

1. **Information Disclosure** (claude_reports #17): `str(exc)`를 사용자 응답에 직접 포함 → 내부 경로, DB 스키마, API 키 일부 노출 가능
2. **Bare Exception Swallowing** (claude_reports #04): 3개 `bare except:` + 25개 silent failure → 에러 추적 불가
3. **에러 핸들링 전략 부재**: 각 핸들러가 독자적 try/catch → 일관성 없음

## Decision

**ENV-aware error handling: production에서는 generic 메시지만, development에서는 상세 정보를 반환한다.**

### 에러 응답 구조

```typescript
// Production 응답
{
  "error": "Internal Server Error",
  "requestId": "req_abc123"
}

// Development 응답
{
  "error": "Internal Server Error",
  "detail": "Connection refused: PostgreSQL at localhost:5432",
  "stack": "Error: ...",
  "requestId": "req_abc123"
}
```

### 핵심 규칙

1. **Production에서 절대 노출 금지**: 에러 메시지, 스택 트레이스, 내부 경로, DB 스키마
2. **requestId 항상 포함**: 로그와 응답을 연결하는 유일한 키
3. **구조화된 로깅**: 상세 에러는 서버 로그에만 기록 (pino JSON)
4. **classifyError()**: 에러를 카테고리(HTTP status)로 분류

### 구현 패턴

```typescript
function handleError(err: unknown, config: AxelConfig): HttpError {
  const classified = classifyError(err);

  if (config.env === "production") {
    return {
      status: classified.status,
      body: { error: classified.publicMessage, requestId: getRequestId() },
    };
  }

  return {
    status: classified.status,
    body: {
      error: classified.publicMessage,
      detail: classified.internalMessage,
      stack: classified.stack,
      requestId: getRequestId(),
    },
  };
}
```

## Alternatives Considered

| Option | Pros | Cons |
|--------|------|------|
| **ENV-aware handler (선택)** | 간결, 환경별 자동 분기 | ENV 설정 오류 시 production에서 상세 노출 위험 |
| Always generic | 가장 안전 | 개발 중 디버깅 어려움 |
| Custom error page | UX 우수 | SPA/API에서 불필요한 복잡도 |
| Error monitoring service (Sentry) | 상세 추적, 알림 | 외부 의존, Phase 0에서 과도 |

### ENV 설정 오류 방어

- `config.env`가 Zod schema에서 검증됨 (ADR-005)
- 기본값이 `"development"` → production 배포 시 명시적 `AXEL_ENV=production` 필수
- Docker image에서 ENV 변수 강제 설정

## Consequences

### Positive
- Production에서 정보 노출 불가 (OWASP A01 대응)
- Development에서 빠른 디버깅 (상세 에러 + 스택 트레이스)
- requestId로 로그↔응답 추적 가능
- claude_reports #17 완전 해소

### Negative
- Production 에러 디버깅 시 requestId로 로그 검색 필요 (추가 단계)
  - Mitigation: pino JSON 로그 + `grep requestId`로 충분
- classifyError() 함수의 에러 분류 정확도에 의존

## References

- Plan v2.0 Section 4 Layer 9: Gateway (Error Handling)
- Plan v2.0 Section 4 Layer 10: Security Architecture
- claude_reports #04 (Bare Exception), #17 (Information Disclosure)
- OWASP A01:2021 Broken Access Control (error-based info disclosure)
- ADR-005: Zod validation (config.env 검증)
