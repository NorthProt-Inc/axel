# PERF-M3/M4: pg-episodic-memory — 2개 이슈 번들

## Metadata

| Field | Value |
|-------|-------|
| ID | PERF-M3, PERF-M4 |
| Severity | MEDIUM |
| Package | infra |
| File | packages/infra/src/db/pg-episodic-memory.ts |
| Lines | M3: 42-58, M4: 170-183 |
| Wave | 1 |
| Depends On | (없음) |
| Blocks | (없음) |
| Test File | packages/infra/tests/db/pg-episodic-memory.test.ts |

> **번들 사유**: 2개 이슈가 동일 파일(`pg-episodic-memory.ts`)을 수정하므로 병렬 실행 시 충돌 방지를 위해 단일 태스크로 번들링.

---

## Issue M3: addMessage — 개별 INSERT 쿼리

### Context
메시지 저장 시 각 메시지마다 별도의 `INSERT` 쿼리를 실행한다. 한 세션에서 여러 메시지를 동시에 저장할 때 N개의 개별 왕복이 발생한다.

### Current Code
```typescript
// packages/infra/src/db/pg-episodic-memory.ts:42-58
// addMessage에서 개별 INSERT 후 session update
await this.pool.query(
    'INSERT INTO messages (turn_id, session_id, role, content, channel_id, created_at, token_count) VALUES ($1, $2, $3, $4, $5, $6, $7)',
    [turn.turnId, sessionId, turn.role, turn.content, turn.channelId, turn.timestamp, turn.tokenCount],
);
```

### Target
- 다중 메시지 저장 시 batch INSERT 사용:
  ```sql
  INSERT INTO messages (turn_id, session_id, role, content, channel_id, created_at, token_count)
  VALUES ($1,$2,$3,$4,$5,$6,$7), ($8,$9,$10,$11,$12,$13,$14), ...
  ```
- 또는 `unnest` 기반 batch insert
- 단일 메시지 호출은 기존 로직 유지 (오버헤드 없이)

---

## Issue M4: 엔티티 저장 순차 루프

### Context
pg-episodic-memory에서 엔티티 관련 작업(검색, 저장)이 개별 async 호출로 실행된다. 여러 엔티티를 처리할 때 순차적으로 하나씩 처리하여 불필요한 latency 발생.

### Current Code
```typescript
// packages/infra/src/db/pg-episodic-memory.ts:170-183
// 각 엔티티에 대해 순차적 async 호출
for (const entity of entities) {
    // ... individual async operation per entity
}
```

### Target
- 엔티티 조회를 `WHERE name = ANY($1)` batch 쿼리로 전환
- 엔티티 저장을 batch INSERT로 전환
- `Promise.all`을 활용하여 독립적인 작업을 병렬화

---

## Acceptance Criteria (통합)

- [ ] M3: 다중 메시지 저장 시 batch INSERT 사용
- [ ] M4: 엔티티 처리 루프가 batch 또는 병렬로 전환
- [ ] 단일 항목 처리 시 기존과 동일한 동작 유지
- [ ] 기존 테스트 (`pg-episodic-memory.test.ts`) 전체 통과
- [ ] 새 테스트: 10+ 메시지 batch INSERT 동작 검증
- [ ] 새 테스트: 5+ 엔티티 batch 처리 검증

## Estimated Impact

| Issue | Metric | Before | After |
|-------|--------|--------|-------|
| M3 | PG queries (10 messages) | 10 | 1 |
| M3 | Latency (10 messages) | ~10 RTT | ~1 RTT |
| M4 | PG queries (5 entities) | 5-10 | 1-2 |
| M4 | Latency (5 entities) | ~5 RTT | ~1 RTT |
