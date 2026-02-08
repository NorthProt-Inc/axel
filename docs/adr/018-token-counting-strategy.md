# ADR-018: Token Counting Strategy — Anthropic SDK countTokens

> Status: PROPOSED
> Date: 2026-02-08
> Author: Architecture Division

## Context

ADR-012에서 "token-based context budgeting"을 확정했으나, 구체적 토크나이저 선택을 보류했다. v2.0 plan은 "tiktoken 기반"이라고 명시했으나, RES-002 리서치에서 tiktoken이 Claude 모델에 부적합하다는 결론이 나왔다 (ERR-012).

핵심 문제: Claude는 자체 토크나이저(BPE 변형)를 사용하며, OpenAI의 tiktoken과 토큰 분할 방식이 다르다. tiktoken으로 추정한 토큰 수와 실제 Claude API billing 토큰 수가 불일치한다.

## Decision

**Anthropic SDK `client.messages.countTokens()`를 primary, 로컬 추정(`text.length / 4`)을 secondary로 사용한다.**

### 2-Tier Strategy

```typescript
// packages/core/src/context/token-counter.ts

interface TokenCounter {
  /** 정밀 카운트 — Anthropic API 호출 (async) */
  count(text: string, model: string): Promise<number>;

  /** 빠른 추정 — 로컬 계산 (sync) */
  estimate(text: string): number;
}

class AnthropicTokenCounter implements TokenCounter {
  private readonly cache = new LRUCache<string, number>({ max: 1000 });

  async count(text: string, model: string): Promise<number> {
    const cacheKey = `${model}:${hashText(text)}`;
    const cached = this.cache.get(cacheKey);
    if (cached !== undefined) return cached;

    const response = await this.client.messages.countTokens({
      model,
      messages: [{ role: "user", content: text }],
    });
    this.cache.set(cacheKey, response.input_tokens);
    return response.input_tokens;
  }

  estimate(text: string): number {
    // Rough estimate: ~4 chars per token for English, ~2 for Korean
    // This is intentionally conservative (overestimates) to avoid budget overflow
    return Math.ceil(text.length / 3);
  }
}
```

### 사용 패턴

| 단계 | 메서드 | 용도 |
|------|--------|------|
| Context assembly 1차 필터 | `estimate()` | 각 메모리 레이어의 대략적 크기 확인 |
| Context assembly 최종 조립 | `count()` | 전체 프롬프트의 정확한 토큰 수 확인 |
| 실시간 대화 중 | `estimate()` | 남은 예산 빠른 확인 |
| 세션 종료 시 | `count()` | 정확한 토큰 사용량 로깅 |

### RES-002 핵심 데이터

| Method | Accuracy | Latency | Cost | Offline |
|--------|----------|---------|------|---------|
| `countTokens()` API | Billing-grade | ~50-200ms | Free | No |
| tiktoken (p50k_base) | ~85-90% for Claude | <1ms | Free | Yes |
| `text.length / 4` | ~70-80% | <0.01ms | Free | Yes |

## Alternatives Considered

| Option | Pros | Cons |
|--------|------|------|
| **Anthropic SDK countTokens + estimate (선택)** | Billing-grade 정확, free API, 캐시로 latency 최소화 | API 의존, async |
| tiktoken only | 로컬, 빠름 | Claude 토크나이저 불일치 (ERR-012) |
| tiktoken primary + countTokens validation | 빠른 로컬 + 가끔 검증 | 불일치 시 대응 복잡 |
| 로컬 추정만 (`length / 4`) | 외부 의존 없음, 즉시 | 30-50% 부정확, 예산 관리 실패 위험 |
| Claude tokenizer reverse-engineering | 로컬, 정확 | 법적/기술적 위험, Anthropic 정책 위반 가능 |

### tiktoken 제외 근거 (ERR-012)

- tiktoken은 OpenAI 모델(GPT-4 등) 전용 BPE 토크나이저
- `p50k_base` 인코딩으로 Claude 텍스트를 토큰화하면:
  - 영어: ~90% 일치 (유사한 BPE)
  - 한국어: ~75% 일치 (토크나이저 vocab 차이)
  - 혼합 텍스트: 예측 불가
- **결론: billing과 불일치하는 토큰 카운팅은 예산 관리에 사용할 수 없다**

## Consequences

### Positive
- Billing-grade 정확도로 200K context window를 최대한 활용
- 한국어/영어 혼용에서도 정확
- `countTokens()` API는 무료 — 비용 부담 없음
- LRU 캐시로 동일 텍스트 재카운팅 방지

### Negative
- `count()` API 호출 latency (~50-200ms)
  - Mitigation: 캐시, 1차 필터는 `estimate()` 사용
- Rate limit: 100-8,000 RPM (tier별)
  - Mitigation: 캐시 + batch counting
- API 키 필요 (오프라인 사용 불가)
  - Mitigation: `estimate()` fallback

## References

- RES-002: TypeScript Token Counting Research
- ADR-012: Token-Based Context Budgeting
- ERR-012: tiktoken wrong for Claude tokenization
- ERR-016: countTokens() sync/async conflation
- [Anthropic Token Counting Documentation](https://platform.claude.com/docs/en/build-with-claude/token-counting)
