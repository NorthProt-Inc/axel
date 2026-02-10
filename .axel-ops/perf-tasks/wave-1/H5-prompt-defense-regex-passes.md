# PERF-H5: prompt-defense sanitizeInput — 다중 regex pass

## Metadata

| Field | Value |
|-------|-------|
| ID | PERF-H5 |
| Severity | HIGH |
| Package | gateway |
| File | packages/gateway/src/prompt-defense.ts |
| Lines | 13-23 |
| Wave | 1 |
| Depends On | (없음) |
| Blocks | (없음) |
| Test File | packages/gateway/tests/prompt-defense.test.ts |

## Context

`sanitizeInput`이 4개의 독립적인 `replace()` 호출을 순차 실행한다. 각 `replace`는 전체 입력 문자열을 한 번씩 순회하므로, 입력이 길 때 (수천 자) 4번의 full scan이 발생한다. 또한 매 `replace`마다 새 string이 생성되어 GC pressure가 증가한다.

## Current Code

```typescript
// packages/gateway/src/prompt-defense.ts:13-23
export function sanitizeInput(input: string): string {
    // Strip null bytes
    let sanitized = input.replace(/\0/g, '');
    // Neutralize markdown-based injection (triple backtick system prompt extraction)
    sanitized = sanitized.replace(/```system/gi, '\\`\\`\\`system');
    // Neutralize "ignore previous instructions" patterns
    sanitized = sanitized.replace(
        /ignore\s+(all\s+)?previous\s+instructions/gi,
        '[FILTERED: instruction override attempt]',
    );
    // Neutralize "you are now" role hijacking
    sanitized = sanitized.replace(/you\s+are\s+now\s+/gi, '[FILTERED: role hijack attempt] ');
    return sanitized;
}
```

## Target Optimization

**접근 방식: 단일 패스 regex 또는 replacer 함수**

1. 4개 패턴을 하나의 regex로 결합 (alternation `|`)
2. 단일 `replace()` 호출 + replacer 함수로 매칭된 패턴에 따라 대체 문자열 결정
3. 전체 문자열을 1회만 순회, string 생성도 1회

```typescript
// 예시 방향 (구현이 아닌 방향성)
const COMBINED = /\0|```system|ignore\s+(all\s+)?previous\s+instructions|you\s+are\s+now\s+/gi;
sanitized = input.replace(COMBINED, (match) => {
    // match에 따라 대체값 반환
});
```

**주의**: null byte(`\0`)는 flag 차이가 있을 수 있으므로 결합 시 테스트 필수.

## Acceptance Criteria

- [ ] `sanitizeInput`에서 `replace()` 호출이 1회로 축소
- [ ] 4개 패턴 모두 기존과 동일하게 필터링
- [ ] 기존 테스트 (`prompt-defense.test.ts`) 전체 통과
- [ ] 새 테스트: 혼합 패턴 입력 (null byte + injection 시도 동시 포함)
- [ ] 새 테스트: 10KB+ 입력에서의 정상 동작 확인
- [ ] regex 결합 시 각 패턴의 case-insensitive 플래그 통일

## Estimated Impact

| Metric | Before | After |
|--------|--------|-------|
| String scans per call | 4 | 1 |
| String allocations | 4 intermediate | 1 final |
| Latency (4KB input) | ~0.2ms | ~0.05ms |
| Per-message overhead | O(4n) | O(n) |
