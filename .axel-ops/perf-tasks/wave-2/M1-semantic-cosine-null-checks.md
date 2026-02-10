# PERF-M1: semantic-memory cosineSimilarity — 불필요한 null 체크

## Metadata

| Field | Value |
|-------|-------|
| ID | PERF-M1 |
| Severity | MEDIUM |
| Package | core |
| File | packages/core/src/memory/semantic-memory.ts |
| Lines | 125-148 |
| Wave | 2 |
| Depends On | Wave 1 완료 |
| Blocks | PERF-C4 (임베딩 정규화 패턴) |
| Test File | packages/core/tests/memory/semantic-memory.test.ts |

## Context

`cosineSimilarity` 함수가 `Float32Array` 요소에 `?? 0` null coalescing을 적용한다. `Float32Array`는 typed array로 요소가 항상 `number`이며 `undefined`나 `null`이 될 수 없다. 따라서 `a[i] ?? 0`은 불필요한 체크다. 핫 루프(임베딩 차원 768-1536)에서 매 반복마다 실행되므로 누적 오버헤드가 있다.

또한 `textSimilarity`의 단순 word matching은 정확도가 낮아 임베딩 기반 검색 품질에 영향을 줄 수 있다. 이 패턴이 `consolidation-service`의 deduplication 품질에 영향을 미친다.

## Current Code

```typescript
// packages/core/src/memory/semantic-memory.ts:125-148
private textSimilarity(content: string, query: string): number {
    const lower = content.toLowerCase();
    const lowerQuery = query.toLowerCase();
    if (lower.includes(lowerQuery)) return 1.0;
    const words = lowerQuery.split(/\s+/);
    const matches = words.filter((w) => lower.includes(w)).length;
    return words.length > 0 ? matches / words.length : 0;
}

private cosineSimilarity(a: Float32Array, b: Float32Array): number {
    if (a.length !== b.length || a.length === 0) return 0;
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
        const ai = a[i] ?? 0;    // Float32Array → 항상 number, ?? 0 불필요
        const bi = b[i] ?? 0;    // Float32Array → 항상 number, ?? 0 불필요
        dot += ai * bi;
        normA += ai * ai;
        normB += bi * bi;
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom > 0 ? dot / denom : 0;
}
```

## Target Optimization

**접근 방식 1: null check 제거 + 직접 인덱싱**

```typescript
// 방향성
for (let i = 0; i < a.length; i++) {
    const ai = a[i]!;  // 또는 a[i] as number (typed array 보장)
    const bi = b[i]!;
    dot += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
}
```

**접근 방식 2: 임베딩 정규화 (pre-normalized vectors)**

- 임베딩 저장 시 L2 정규화하여 `||a|| = 1` 보장
- cosine similarity가 `dot(a, b)`로 단순화 (`normA`, `normB` 계산 불필요)
- 이 패턴이 확립되면 C4 (consolidation)의 검색 품질도 개선

**접근 방식 3: SIMD 또는 WebAssembly (과도할 수 있음)**

현실적으로 접근 방식 1 + 2 조합이 최적.

## Acceptance Criteria

- [ ] `cosineSimilarity`에서 `?? 0` null check 제거
- [ ] (선택) 임베딩 정규화 적용 시 cosine = dot product로 단순화
- [ ] 기존 테스트 (`semantic-memory.test.ts`) 전체 통과
- [ ] 새 테스트: 정규화된 벡터와 비정규화 벡터 모두에서 올바른 결과 확인
- [ ] (선택) 임베딩 정규화 패턴을 `EmbeddingService`에 적용하여 C4에서 활용 가능하게

## Estimated Impact

| Metric | Before | After |
|--------|--------|-------|
| null check per dimension | 2 (a, b) | 0 |
| 768-dim vector pair | 1536 불필요한 체크 | 0 |
| 검색 1회 (100 memories × 768 dim) | 153,600 null checks | 0 |
| (정규화 적용 시) 연산 | 3 mul + 2 add/dim | 1 mul + 1 add/dim |
