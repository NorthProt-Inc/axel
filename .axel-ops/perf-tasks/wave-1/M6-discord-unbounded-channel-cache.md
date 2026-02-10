# PERF-M6: discord-channel — channelCache 무제한 증가

## Metadata

| Field | Value |
|-------|-------|
| ID | PERF-M6 |
| Severity | MEDIUM |
| Package | channels |
| File | packages/channels/src/discord/discord-channel.ts |
| Lines | 51, 268 |
| Wave | 1 |
| Depends On | (없음) |
| Blocks | (없음) |
| Test File | packages/channels/tests/discord/discord-channel.test.ts |

## Context

`channelCache`는 Discord 채널 객체를 `Map<string, SendableChannel>`로 캐시한다. 메시지 수신 시 채널 ID를 키로 캐시에 추가하지만, `stop()` 호출 전까지 어떠한 eviction도 없다. 장기 실행 봇에서 수많은 채널에 접근하면 메모리가 무제한 증가한다.

## Current Code

```typescript
// packages/channels/src/discord/discord-channel.ts:51
private readonly channelCache = new Map<string, SendableChannel>();

// line 268 — 메시지 수신 시 캐시 추가
this.channelCache.set(message.channelId, message.channel as SendableChannel);

// line 100 — stop()에서만 정리
// (stop 호출 전까지 캐시는 계속 증가)
```

## Target Optimization

**접근 방식: LRU 캐시 또는 크기 제한**

1. `Map` → LRU 캐시로 교체 (최대 100-500 entries)
2. 또는 `Map`에 크기 상한 + 가장 오래된 entry 제거 로직 추가
3. 또는 TTL 기반 eviction (최근 N분 내 사용된 채널만 유지)

**간단한 구현**: Map 크기가 상한을 초과하면 가장 먼저 추가된 entry를 제거 (FIFO).

**주의**: `SendableChannel` 객체가 Discord.js 내부 상태를 참조하므로 캐시에서 제거해도 Discord.js가 별도 관리하는 채널 참조에는 영향 없음.

## Acceptance Criteria

- [ ] `channelCache` Map에 크기 상한 존재
- [ ] 상한 초과 시 자동 eviction (LRU, FIFO, 또는 TTL)
- [ ] 캐시 히트 동작 유지 (채널 재조회 비용 최소화)
- [ ] 기존 테스트 (`discord-channel.test.ts`) 전체 통과
- [ ] 새 테스트: 캐시 상한 도달 시 eviction 동작 검증

## Estimated Impact

| Metric | Before | After |
|--------|--------|-------|
| Memory (1000 channels) | ~수 MB, 무제한 증가 | 상한 제한 |
| Cache hit ratio | 100% (모든 채널 유지) | ~95% (LRU) |
| Long-running bot memory | 시간에 따라 증가 | 일정 |
