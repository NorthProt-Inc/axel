# PERF-M8: cli output/theme — createCliTheme() 매 호출 시 새 인스턴스 생성

## Metadata

| Field | Value |
|-------|-------|
| ID | PERF-M8 |
| Severity | MEDIUM |
| Package | ui |
| File | packages/ui/src/cli/output.ts, packages/ui/src/cli/theme.ts |
| Lines | output.ts:16,22,35,43,53 / theme.ts:30-43 |
| Wave | 1 |
| Depends On | (없음) |
| Blocks | (없음) |
| Test File | packages/ui/tests/cli-output.test.ts, packages/ui/tests/cli-theme.test.ts |

## Context

`output.ts`의 여러 함수가 `createCliTheme()`를 호출하여 테마 객체를 생성한다. `createCliTheme()`은 매번 새 객체를 반환하는데, 테마는 런타임 중 변경되지 않으므로 불필요한 객체 생성이다. CLI 출력이 빈번한 경우 (디버그 모드, verbose 로깅) GC pressure가 증가한다.

## Current Code

```typescript
// packages/ui/src/cli/theme.ts:30-43
export function createCliTheme(): CliTheme {
    // 매 호출마다 새 객체 생성
    return {
        // ... theme properties
    };
}

// packages/ui/src/cli/output.ts — 여러 곳에서 반복 호출
// line 16: const theme = createCliTheme();
// line 22: const theme = createCliTheme();
// line 35: const theme = createCliTheme();
// line 43: const theme = createCliTheme();
// line 53: const theme = createCliTheme();
```

## Target Optimization

**접근 방식: 모듈 레벨 싱글톤**

1. `theme.ts`에서 `createCliTheme()`을 memoize하거나, 모듈 레벨 상수로 export
2. `output.ts`에서 함수마다 `createCliTheme()` 호출 대신 import된 싱글톤 사용
3. 테마가 변경 가능해야 한다면 `getCliTheme()` 형태의 lazy singleton

```typescript
// 방향성 예시
let cached: CliTheme | null = null;
export function getCliTheme(): CliTheme {
    if (!cached) cached = createCliTheme();
    return cached;
}
```

## Acceptance Criteria

- [ ] `createCliTheme()`이 런타임 중 최대 1회만 실행
- [ ] `output.ts`의 모든 테마 참조가 싱글톤 사용
- [ ] 기존 테스트 (`cli-output.test.ts`, `cli-theme.test.ts`) 전체 통과
- [ ] 테마 객체가 immutable이면 `Object.freeze` 적용 고려
- [ ] 테스트 간 격리가 필요하면 reset 메커니즘 제공

## Estimated Impact

| Metric | Before | After |
|--------|--------|-------|
| Theme object creations | 출력 함수 호출 수 × 1 | 1 (전체 런타임) |
| GC pressure | 빈번한 출력 시 증가 | 최소 |
| 메모리 사용 | 미미하나 불필요 | 최적 |
