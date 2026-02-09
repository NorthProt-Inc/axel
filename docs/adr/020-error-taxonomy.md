# ADR-020: Error Taxonomy and Classification

> Status: ACCEPTED
> Date: 2026-02-08
> Accepted: 2026-02-09 (CORE-006 error recovery paths + FIX-AUDIT-E-002 ErrorInfo implementation verified)
> Author: Architecture Division

## Context

axnmihn의 에러 처리:
- 3개 `bare except:` + 25개 silent failure (claude_reports #04)
- 에러 타입 체계 없음 → 모든 에러가 generic `Exception`
- ReAct Loop에 try/catch 없음 → 도구 실패 시 전체 루프 중단
- 에러 분류 기준 없음 → 재시도 가능 여부, 사용자 통보 여부 판단 불가

ERR-036, ERR-037에서 지적된 구조적 문제이다.

## Decision

**AxelError 기반 에러 타입 계층을 정의하고, 에러 분류에 따라 ReAct Loop, Circuit Breaker, Gateway가 각각 적절히 대응한다.**

### Error Hierarchy

```typescript
// packages/core/src/types/error.ts

/** 모든 Axel 에러의 기본 클래스 */
abstract class AxelError extends Error {
  abstract readonly code: string;
  abstract readonly isRetryable: boolean;
  abstract readonly httpStatus: number;
  readonly timestamp: Date = new Date();
  readonly requestId?: string;

  constructor(message: string, options?: { cause?: Error; requestId?: string }) {
    super(message, { cause: options?.cause });
    this.name = this.constructor.name;
    this.requestId = options?.requestId;
  }
}

/** 일시적 오류 — 재시도 가능 */
class TransientError extends AxelError {
  readonly code = "TRANSIENT";
  readonly isRetryable = true;
  readonly httpStatus = 503;
}

/** 영구적 오류 — 재시도 무의미 */
class PermanentError extends AxelError {
  readonly code = "PERMANENT";
  readonly isRetryable = false;
  readonly httpStatus = 500;
}

/** 입력 검증 오류 */
class ValidationError extends AxelError {
  readonly code = "VALIDATION";
  readonly isRetryable = false;
  readonly httpStatus = 400;
  readonly fields: Record<string, string>;

  constructor(message: string, fields: Record<string, string>) {
    super(message);
    this.fields = fields;
  }
}

/** 인증/인가 오류 */
class AuthError extends AxelError {
  readonly code = "AUTH";
  readonly isRetryable = false;
  readonly httpStatus: number;

  constructor(message: string, status: 401 | 403 = 401) {
    super(message);
    this.httpStatus = status;
  }
}

/** LLM Provider 오류 */
class ProviderError extends AxelError {
  readonly code = "PROVIDER";
  readonly isRetryable: boolean;
  readonly httpStatus = 502;
  readonly provider: string;

  constructor(message: string, provider: string, isRetryable: boolean, options?: { cause?: Error }) {
    super(message, options);
    this.provider = provider;
    this.isRetryable = isRetryable;
  }
}

/** 도구 실행 오류 */
class ToolError extends AxelError {
  readonly code = "TOOL";
  readonly isRetryable: boolean;
  readonly httpStatus = 500;
  readonly toolName: string;

  constructor(message: string, toolName: string, isRetryable: boolean = false) {
    super(message);
    this.toolName = toolName;
    this.isRetryable = isRetryable;
  }
}

/** 타임아웃 오류 */
class TimeoutError extends AxelError {
  readonly code = "TIMEOUT";
  readonly isRetryable = true;
  readonly httpStatus = 504;
  readonly timeoutMs: number;

  constructor(message: string, timeoutMs: number) {
    super(message);
    this.timeoutMs = timeoutMs;
  }
}
```

### Error Classification Matrix

| Error Type | Retry? | Circuit Breaker? | User Message | Log Level |
|-----------|--------|-----------------|-------------|-----------|
| TransientError | Yes (max 3) | Count toward threshold | "잠시 후 다시 시도해주세요" | WARN |
| PermanentError | No | No | "처리할 수 없는 요청입니다" | ERROR |
| ValidationError | No | No | Field-specific messages | INFO |
| AuthError | No | No | "인증이 필요합니다" | WARN |
| ProviderError (rate_limit) | Yes (backoff) | Yes | "AI 서비스가 바쁩니다" | WARN |
| ProviderError (server) | Yes | Yes | "AI 서비스에 문제가 있습니다" | ERROR |
| ToolError (transient) | Yes (1 retry) | No | Tool-specific message | WARN |
| ToolError (permanent) | No | No | Tool-specific message | ERROR |
| TimeoutError | Yes (1 retry) | Yes | "응답 시간이 초과되었습니다" | WARN |

### ReAct Loop Error Handling (ERR-036 해소)

```typescript
async function* reactLoop(params: ReActParams): AsyncGenerator<ReActEvent> {
  const totalTimeout = AbortSignal.timeout(params.config.totalTimeoutMs);
  let iteration = 0;

  while (iteration < params.config.maxIterations) {
    if (totalTimeout.aborted) {
      yield { type: "error", error: new TimeoutError("ReAct loop total timeout", params.config.totalTimeoutMs) };
      return;
    }

    try {
      for await (const chunk of params.llmProvider.chat({ ... })) {
        if (chunk.type === "tool_call") {
          yield { type: "tool_call", tool: chunk.content };

          try {
            const result = await executeToolWithTimeout(
              chunk.content, params.tools, params.config.toolTimeoutMs
            );
            yield { type: "tool_result", result };
            params.messages.push(/* tool result */);
          } catch (err) {
            if (err instanceof ToolError && err.isRetryable) {
              // 도구 재시도 1회
              yield { type: "error", error: err };
              params.messages.push(toolErrorMessage(err));
              // LLM에게 에러를 전달하여 대안 행동 결정
            } else {
              // 영구 에러 → LLM에게 알리고 계속 진행
              yield { type: "error", error: asAxelError(err) };
              params.messages.push(toolErrorMessage(err));
            }
          }
        }
        // ... text, thinking 처리
      }
    } catch (err) {
      if (err instanceof ProviderError && err.isRetryable) {
        // LLM 재시도 (backoff)
        await delay(exponentialBackoff(iteration));
        continue;
      }
      // 영구 LLM 에러 → 루프 종료
      yield { type: "error", error: asAxelError(err) };
      return;
    }

    if (noToolCallInLastResponse) break;
    iteration++;
  }

  if (iteration >= params.config.maxIterations) {
    yield { type: "error", error: new PermanentError("ReAct loop max iterations exceeded") };
  }
}
```

## Alternatives Considered

| Option | Pros | Cons |
|--------|------|------|
| **AxelError 계층 (선택)** | 타입 안전, 분류 기반 대응, instanceof 패턴 | 에러 클래스 수 관리 필요 |
| Union type (discriminated) | 함수형 스타일, 패턴 매칭 | class 기반 에코시스템(try/catch)과 불일치 |
| Error code enum only | 간결 | 구조화된 데이터 (fields, provider 등) 포함 어려움 |
| neverthrow (Result type) | 명시적 에러 흐름 | 전체 코드베이스 변경 필요, 학습 비용 |

## Consequences

### Positive
- 모든 에러가 분류되어 재시도, 사용자 메시지, 로그 레벨이 자동 결정
- ReAct Loop이 도구 실패에서 복구 가능 (LLM에게 에러를 전달하여 대안 행동)
- Circuit Breaker가 `isRetryable + ProviderError`만 카운트
- Gateway가 `httpStatus`와 `env`에 따라 응답 자동 생성

### Negative
- 에러 클래스 수 증가 (7개 + 향후 확장)
- 기존 코드에서 throw하는 모든 곳에서 AxelError 사용 강제
- `cause` 체인이 깊어지면 디버깅 복잡도 증가

## References

- Plan v2.0 Section 4 Layer 7: Orchestration Engine (ReAct Loop)
- ADR-011: ENV-Aware Error Handling
- claude_reports #04 (Bare Exception Swallowing)
- ERR-036: ReAct loop zero error handling
- ERR-037: No error type hierarchy
- OpenClaw의 FailoverError 패턴 참조
