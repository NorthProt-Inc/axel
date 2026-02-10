# PERF-H2/H3: redis-working-memory — flush N+1 + multi-command 미사용

## Metadata

| Field | Value |
|-------|-------|
| ID | PERF-H2, PERF-H3 |
| Severity | HIGH |
| Package | infra |
| File | packages/infra/src/cache/redis-working-memory.ts |
| Lines | H2: 183-225 (flush), H3: 49-76 (pushTurn multi-command) |
| Wave | 2 |
| Depends On | PERF-C3 (PG batch 패턴 참조) |
| Blocks | (없음) |
| Test File | packages/infra/tests/cache/redis-working-memory.test.ts |

> **번들 사유**: 2개 이슈가 동일 파일(`redis-working-memory.ts`)을 수정하므로 단일 태스크로 번들링.

---

## Issue H2: flush() — 개별 PG INSERT 루프

### Context
`flush()`가 Redis 캐시의 모든 turn을 PG에 동기화할 때 각 turn마다 개별 `INSERT ... ON CONFLICT DO NOTHING`을 실행한다. PG-first 패턴이므로 대부분 이미 존재하지만, Redis에만 있는 turn이 있을 수 있어 full sync가 필요. C3에서 확립한 PG batch 패턴을 적용해야 한다.

### Current Code
```typescript
// packages/infra/src/cache/redis-working-memory.ts:183-210
async flush(userId: string): Promise<void> {
    const turnsKey = `axel:working:${userId}:turns`;
    const summaryKey = `axel:working:${userId}:summary`;

    try {
        const cached = await this.redisCircuit.execute(async () => {
            return await this.redis.lrange(turnsKey, 0, -1);
        });

        if (cached.length > 0) {
            for (const serialized of cached) {
                const turn = JSON.parse(serialized) as Turn;
                await this.pg.query(                          // N+1 INSERT
                    'INSERT INTO messages (...) VALUES ($1,...,$7) ON CONFLICT DO NOTHING',
                    [turn.turnId, userId, turn.role, turn.content, turn.channelId, turn.timestamp, turn.tokenCount],
                );
            }
        }
    } catch { /* ... */ }

    try {
        await this.redisCircuit.execute(async () => {
            await this.redis.del(turnsKey);                   // 2개 del도 pipeline 가능
            await this.redis.del(summaryKey);
        });
    } catch { /* ... */ }
}
```

### Target
- C3에서 확립한 `unnest` 기반 batch INSERT 패턴 적용:
  ```sql
  INSERT INTO messages (turn_id, session_id, role, content, channel_id, created_at, token_count)
  SELECT * FROM unnest($1::int[], $2::text[], $3::text[], $4::text[], $5::text[], $6::timestamptz[], $7::int[])
  ON CONFLICT DO NOTHING
  ```
- N개 개별 쿼리 → 1개 batch 쿼리

---

## Issue H3: pushTurn() — Redis 3 명령어 개별 실행

### Context
`pushTurn`에서 Redis에 `rpush` → `ltrim` → `expire` 3개 명령어를 순차 실행한다. Redis pipeline (또는 MULTI/EXEC)으로 1 RTT에 처리 가능.

### Current Code
```typescript
// packages/infra/src/cache/redis-working-memory.ts:64-71
await this.redisCircuit.execute(async () => {
    const key = `axel:working:${userId}:turns`;
    await this.redis.rpush(key, JSON.stringify(turn));     // RTT 1
    await this.redis.ltrim(key, -MAX_TURNS, -1);           // RTT 2
    await this.redis.expire(key, TTL_SECONDS);             // RTT 3
});
```

### Target
- Redis pipeline 사용으로 3 RTT → 1 RTT
- `RedisClient` 인터페이스에 `pipeline()` 메서드가 없다면 추가 필요
- 또는 Lua 스크립트로 3 명령을 원자적 실행

---

## Acceptance Criteria (통합)

- [ ] H2: `flush()`에서 batch INSERT 사용 (C3 패턴 참조)
- [ ] H2: 개별 `pg.query()` 루프 제거
- [ ] H3: `pushTurn`의 Redis 명령이 pipeline 또는 단일 RTT로 실행
- [ ] H3: `clear()`의 2개 `del`도 pipeline 적용
- [ ] `RedisClient` 인터페이스 변경 시 기존 구현체와 호환
- [ ] 기존 테스트 (`redis-working-memory.test.ts`) 전체 통과
- [ ] 새 테스트: flush batch INSERT 동작 검증
- [ ] 새 테스트: pushTurn pipeline 동작 검증

## Estimated Impact

| Issue | Metric | Before | After |
|-------|--------|--------|-------|
| H2 | PG queries per flush (20 turns) | 20 | 1 |
| H2 | Flush latency | ~20 RTT | ~1 RTT |
| H3 | Redis RTT per pushTurn | 3 | 1 |
| H3 | pushTurn latency | ~3ms | ~1ms |
