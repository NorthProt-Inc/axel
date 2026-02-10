# PERF-C3: pg-semantic-memory decay — N+1 UPDATE/DELETE 쿼리

## Metadata

| Field | Value |
|-------|-------|
| ID | PERF-C3 |
| Severity | CRITICAL |
| Package | infra |
| File | packages/infra/src/db/pg-semantic-memory.ts |
| Lines | 147-164 |
| Wave | 1 |
| Depends On | (없음) |
| Blocks | PERF-H2-H3 (pattern) |
| Test File | packages/infra/tests/db/pg-semantic-memory.test.ts |

## Context

시맨틱 메모리 decay 프로세스가 모든 메모리 행을 개별적으로 UPDATE/DELETE한다. 메모리가 수백~수천 건일 때 각 행마다 별도의 PG 쿼리를 실행하여 N+1 문제가 발생한다. 네트워크 왕복 비용이 행 수에 비례하여 증가하며, decay 주기가 짧을수록 DB 부하가 심해진다.

## Current Code

```typescript
// packages/infra/src/db/pg-semantic-memory.ts:147-164
for (let i = 0; i < rows.length; i++) {
    const newImportance = decayed[i]!;
    const row = rows[i]!;

    if (newImportance < config.threshold) {
        await this.pool.query('DELETE FROM memories WHERE uuid = $1', [row.uuid]);
        deleted++;
    } else {
        await this.pool.query(
            `UPDATE memories SET importance = $1, decayed_importance = $1, last_decayed_at = NOW()
             WHERE uuid = $2`,
            [newImportance, row.uuid],
        );
        if (newImportance < min) min = newImportance;
        if (newImportance > max) max = newImportance;
        total += newImportance;
    }
}
```

## Target Optimization

**접근 방식: Batch SQL 작업**

1. DELETE 대상 UUID를 모아서 단일 `DELETE FROM memories WHERE uuid = ANY($1)` 실행
2. UPDATE 대상을 모아서 `unnest` 기반 batch UPDATE 실행:
   ```sql
   UPDATE memories AS m
   SET importance = v.importance, decayed_importance = v.importance, last_decayed_at = NOW()
   FROM (SELECT unnest($1::uuid[]) AS uuid, unnest($2::float8[]) AS importance) AS v
   WHERE m.uuid = v.uuid
   ```
3. N개의 개별 쿼리 → 2개의 batch 쿼리로 축소

이 패턴은 PERF-H2-H3 (Redis batch)에서도 참조할 PG batch 패턴의 기준이 된다.

## Acceptance Criteria

- [ ] decay 루프에서 개별 `pool.query()` 호출 제거
- [ ] DELETE: 단일 `WHERE uuid = ANY($1)` 쿼리 사용
- [ ] UPDATE: batch unnest 또는 동등한 단일 쿼리 사용
- [ ] 기존 테스트 (`pg-semantic-memory.test.ts`) 전체 통과
- [ ] 새 테스트: 100+ 행 decay 시 쿼리 호출 횟수 ≤ 3 검증
- [ ] min/max/total 통계 계산은 JS 측에서 유지 (DB 왕복 없이)

## Estimated Impact

| Metric | Before | After |
|--------|--------|-------|
| PG queries per decay cycle | N (행 수) | 2-3 |
| Latency (500 rows) | ~500ms (N RTT) | ~10ms (2 RTT) |
| DB connection pool pressure | 높음 | 최소 |
