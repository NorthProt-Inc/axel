# PERF-C5: link-content-pipeline — URL 순차 처리

## Metadata

| Field | Value |
|-------|-------|
| ID | PERF-C5 |
| Severity | CRITICAL |
| Package | infra |
| File | packages/infra/src/link/link-content-pipeline.ts |
| Lines | 155-165 |
| Wave | 1 |
| Depends On | (없음) |
| Blocks | (없음) |
| Test File | packages/infra/tests/link/link-content-pipeline.test.ts |

## Context

메시지에서 추출된 URL들을 하나씩 순차적으로 fetch + 처리한다. 각 URL의 네트워크 왕복은 독립적이므로 병렬화가 가능하지만 현재 `for...of` + `await`로 직렬 실행된다. 메시지에 3-5개 URL이 포함될 때 총 latency가 선형으로 증가한다.

## Current Code

```typescript
// packages/infra/src/link/link-content-pipeline.ts:155-165
for (const url of urls) {
    const existing = seen.get(url);
    if (existing !== undefined) {
        results.push(existing);
        continue;
    }

    const result = await this.processUrl(url, channelId, sessionId);
    seen.set(url, result);
    results.push(result);
}
```

## Target Optimization

**접근 방식: 제한된 병렬 실행 (Promise.allSettled + concurrency limiter)**

1. `seen` 캐시 히트는 즉시 반환 (기존 유지)
2. 캐시 미스 URL들을 수집하여 `Promise.allSettled`로 병렬 처리
3. 동시 요청 수 제한 (예: 3-5개) — 대상 서버 과부하 방지
4. 결과를 원래 순서로 정렬하여 반환

**주의사항**: `processUrl` 내부에서 rate limit이나 외부 API 제한이 있다면 concurrency 제한 필수.

## Acceptance Criteria

- [ ] 캐시 미스 URL들이 병렬로 처리됨
- [ ] 동시 실행 수에 상한선 존재 (configurable 또는 상수)
- [ ] `seen` 캐시 로직 유지 (중복 URL 재처리 방지)
- [ ] 결과 순서가 입력 URL 순서와 동일
- [ ] 개별 URL 실패가 다른 URL에 영향 없음 (격리)
- [ ] 기존 테스트 (`link-content-pipeline.test.ts`) 전체 통과
- [ ] 새 테스트: 5개 URL 병렬 처리 시 총 소요 시간이 직렬 대비 감소 검증

## Estimated Impact

| Metric | Before | After |
|--------|--------|-------|
| 5 URL 처리 시간 | ~5 × RTT (직렬) | ~1-2 × RTT (병렬) |
| Latency (avg 200ms/URL) | ~1000ms | ~200-400ms |
| Throughput | 1 URL/time | 3-5 URL/time |
