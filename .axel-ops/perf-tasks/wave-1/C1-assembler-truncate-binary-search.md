# PERF-C1: assembler truncateToFit — binary search가 매 반복마다 토큰 카운트 호출

## Metadata

| Field | Value |
|-------|-------|
| ID | PERF-C1 |
| Severity | CRITICAL |
| Package | core |
| File | packages/core/src/context/assembler.ts |
| Lines | 185-216 |
| Wave | 1 |
| Depends On | (없음) |
| Blocks | PERF-C2 |
| Test File | packages/core/tests/context/assembler.test.ts |

## Context

`truncateToFit`는 텍스트를 토큰 예산에 맞게 잘라내는 함수다. 현재 binary search로 적절한 잘라내기 지점을 찾는데, 매 반복마다 `counter.count()`를 호출한다. 이는 tiktoken/tokenizer 호출로 O(n) 비용이며, binary search의 O(log n) 반복과 합쳐 O(n log n) 복잡도가 된다. 대형 시스템 프롬프트(수천 토큰)에서 매 어셈블 호출마다 실행되므로 latency 영향이 크다.

## Current Code

```typescript
// packages/core/src/context/assembler.ts:185-216
private async truncateToFit(text: string, maxTokens: number): Promise<string> {
    if (text.length === 0) {
        return '';
    }

    const estimated = this.counter.estimate(text);
    if (estimated <= maxTokens) {
        const actual = await this.counter.count(text);
        if (actual <= maxTokens) {
            return text;
        }
    }

    let low = 0;
    let high = text.length;
    let result = '';

    while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const candidate = text.slice(0, mid);
        const tokens = await this.counter.count(candidate);  // O(n) 매 반복

        if (tokens <= maxTokens) {
            result = candidate;
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }

    return result;
}
```

## Target Optimization

**접근 방식: 추정 기반 단일 패스 + 검증**

1. `estimate()` 결과로 chars-per-token 비율 계산
2. 비율 기반으로 대략적인 cut point 산출
3. 한 번만 `count()` 호출하여 검증
4. 필요시 소량 조정 (±10% 범위에서 linear search)

Binary search 전체를 대체하여 `count()` 호출을 최대 2-3회로 제한.

**대안**: `counter`에 incremental tokenization API가 있다면 활용 (prefix 기반으로 이전 결과 재사용).

## Acceptance Criteria

- [ ] `truncateToFit`에서 `counter.count()` 호출 횟수가 최대 3회 이하
- [ ] 기존 테스트 (`assembler.test.ts`) 전체 통과
- [ ] truncation 결과가 기존과 동일한 정확도 유지 (토큰 수 ≤ maxTokens 보장)
- [ ] 새 테스트: 대형 텍스트(10K+ chars)에서의 truncation 정확성 + 호출 횟수 검증
- [ ] `truncateToFit` 시그니처 변경 시 C2 태스크와 조율 필요

## Estimated Impact

| Metric | Before | After |
|--------|--------|-------|
| `count()` calls per truncate | O(log n) ≈ 15-20회 | 2-3회 |
| Latency (4K token text) | ~30ms | ~5ms |
| Per-assemble overhead | 높음 (매 호출) | 최소 |
