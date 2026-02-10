# PERF-M2: episodic-memory searchByTopic — 반복 toLowerCase 호출

## Metadata

| Field | Value |
|-------|-------|
| ID | PERF-M2 |
| Severity | MEDIUM |
| Package | core |
| File | packages/core/src/memory/episodic-memory.ts |
| Lines | 69-79 |
| Wave | 1 |
| Depends On | (없음) |
| Blocks | (없음) |
| Test File | packages/core/tests/memory/episodic-memory.test.ts |

## Context

`searchByTopic`이 모든 세션의 모든 메시지에 대해 `.content.toLowerCase()`를 호출한다. 동일 세션이 반복 검색될 때마다 같은 문자열에 대해 `toLowerCase`가 재실행된다. 세션 수 × 메시지 수에 비례하여 불필요한 string 생성 발생.

## Current Code

```typescript
// packages/core/src/memory/episodic-memory.ts:69-79
async searchByTopic(topic: string, limit: number): Promise<readonly SessionSummary[]> {
    const lowerTopic = topic.toLowerCase();
    return [...this.sessions.values()]
        .filter(
            (s) =>
                s.endedAt !== null &&
                (s.summary?.toLowerCase().includes(lowerTopic) ||
                    s.messages.some((m) => m.content.toLowerCase().includes(lowerTopic))),
        )
        .slice(0, limit)
        .map((s) => this.toSessionSummary(s));
}
```

## Target Optimization

**접근 방식: case-insensitive 검색으로 전환**

1. `toLowerCase` + `includes` 대신 case-insensitive regex 또는 `localeCompare` 사용
2. 또는 메시지 저장 시 미리 lowercase 버전을 캐시 (normalized content 필드)
3. 최소 변경: `s.summary?.toLowerCase()` 결과를 변수에 캐시하여 중복 호출 방지

**추가 개선**: `filter` → `slice` 순서 변경 불가 (전체 필터링 후 limit 적용이 정확). 그러나 early return 패턴으로 필터 내 불필요한 메시지 순회 최소화 가능.

## Acceptance Criteria

- [ ] `toLowerCase()` 반복 호출 제거 (캐시 또는 case-insensitive 검색)
- [ ] 검색 결과가 기존과 동일 (case-insensitive 매칭 유지)
- [ ] 기존 테스트 (`episodic-memory.test.ts`) 전체 통과
- [ ] 새 테스트: 대량 세션(100+)에서 검색 성능 회귀 없음 확인

## Estimated Impact

| Metric | Before | After |
|--------|--------|-------|
| toLowerCase calls | 세션수 × (1 + 메시지수) | 0 (regex) 또는 캐시 |
| String allocations | O(n × m) | O(1) or O(n) cached |
| 100 sessions, avg 20 msgs | ~2100 toLowerCase | ~100 (summary only) 또는 0 |
