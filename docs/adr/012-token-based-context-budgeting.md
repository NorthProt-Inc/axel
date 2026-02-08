# ADR-012: Token-Based Context Budgeting

> Status: ACCEPTED
> Date: 2026-02-07
> Author: Architecture Division

## Context

axnmihn의 컨텍스트 관리:
- Character 기반 예산: `1 char ≈ 0.25 tokens` 추정 사용
- 실제 토큰 수와 최대 30-50% 편차 (한국어/영어 혼용 시 특히 부정확)
- 예산 초과 시 LLM API 오류 또는 truncation 발생
- 컨텍스트 품질 저하 → 응답 품질 저하

## Decision

**정확한 토큰 카운팅 기반의 컨텍스트 예산 관리를 적용한다.**

### 토큰 카운팅 전략

RES-002 연구 결과 기반:
- **Anthropic SDK `countTokens()`**: Claude 모델의 billing-grade 정확한 토큰 수 (API 호출, async)
- **빠른 추정**: 로컬 추정기로 1차 필터, 정밀 카운트는 최종 조립 시 API 호출
- ~~tiktoken~~: Claude 토크나이저와 불일치 → 사용하지 않음 (ERR-012)

### Context Budget 구조

```typescript
interface ContextBudget {
  systemPrompt: number;    // 8,000 tokens
  streamBuffer: number;    // 2,000
  workingMemory: number;   // 40,000
  semanticSearch: number;  // 12,000
  graphTraversal: number;  // 4,000
  sessionArchive: number;  // 4,000
  metaMemory: number;      // 2,000
  toolDefinitions: number; // 4,000
  // total budget: 76,000 tokens
  // 200K 모델 기준 generation: ~124,000 tokens
}
```

### 조립 순서 (우선순위)

1. System Prompt + Persona (불변, 최우선)
2. Working Memory (현재 대화 — 가장 중요)
3. Stream Buffer (실시간 이벤트)
4. Semantic Search (쿼리 관련 장기 기억)
5. Graph Traversal (엔티티 관계)
6. Session Archive (이전 세션 요약)
7. Meta Memory (선제 로딩)
8. Tool Definitions (사용 가능한 도구)

각 섹션이 예산을 초과하면 truncate (앞부분 유지, 뒷부분 절삭).

### 토큰 카운팅 구현

```typescript
interface TokenCounter {
  count(text: string): Promise<number>;      // 정확한 카운트 (API)
  estimate(text: string): number;            // 빠른 추정 (로컬)
}
```

- `estimate()`: `text.length / 4` 수준의 빠른 추정, 1차 필터용
- `count()`: Anthropic SDK `countTokens()` 호출, 최종 조립 시 정밀 카운트
- 캐시: 동일 텍스트의 토큰 수를 in-memory 캐시 (LRU, 1000 entries)

## Alternatives Considered

| Option | Pros | Cons |
|--------|------|------|
| **Anthropic SDK countTokens (선택)** | Billing-grade 정확, 멀티모달 지원 | API 호출 비용 (비동기, 네트워크) |
| tiktoken | 로컬, 빠름 | **Claude 토크나이저와 불일치** (ERR-012) |
| Character estimation (axnmihn) | 즉시 계산 | 30-50% 부정확, 한국어에서 특히 나쁨 |
| gpt-tokenizer | npm 패키지, 로컬 | GPT 토크나이저, Claude와 불일치 |
| Fixed character ratio | 간단 | 언어별 편차 무시 |

### tiktoken 사용하지 않는 이유 (ERR-012)

- tiktoken은 OpenAI 모델(GPT-4 등)의 토크나이저
- Claude는 자체 토크나이저 사용 → tiktoken 결과와 실제 billing이 불일치
- Anthropic SDK `countTokens()`가 유일하게 정확한 방법

## Consequences

### Positive
- 토큰 예산이 정확하게 관리되어 API 오류 방지
- 한국어/영어 혼용 환경에서도 정확한 예산 분배
- 각 메모리 레이어의 토큰 사용량을 추적 가능 (budgetUtilization)
- 200K context window를 최대한 효율적으로 활용

### Negative
- `countTokens()` API 호출 비용 (latency ~50-100ms)
  - Mitigation: 캐시 + 추정치 1차 필터로 API 호출 최소화
- Anthropic SDK 의존 (토큰 카운팅이 Anthropic API에 종속)
  - Mitigation: `estimate()` fallback으로 API 미사용 시에도 동작
- 토큰 예산이 하드코딩 → 모델 변경 시 조정 필요
  - Mitigation: config에서 예산 조정 가능 (MemoryConfigSchema.budgets)

## References

- Plan v2.0 Section 4 Layer 3: Context Assembly
- RES-002: TypeScript Token Counting Research
- claude_reports #14 (magic numbers)
- ERR-012: tiktoken wrong for Claude tokenization
- ERR-016: countTokens() sync/async conflation (FIX-MED)
