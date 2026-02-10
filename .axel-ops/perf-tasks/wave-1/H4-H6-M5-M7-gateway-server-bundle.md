# PERF-H4/H6/M5/M7: gateway server.ts — 4개 이슈 번들

## Metadata

| Field | Value |
|-------|-------|
| ID | PERF-H4, PERF-H6, PERF-M5, PERF-M7 |
| Severity | HIGH (H4, H6), MEDIUM (M5, M7) |
| Package | gateway |
| File | packages/gateway/src/server.ts |
| Lines | 28-29, 141-154, 196-204 |
| Wave | 1 |
| Depends On | (없음) |
| Blocks | (없음) |
| Test File | packages/gateway/tests/server.test.ts |

> **번들 사유**: 4개 이슈가 동일 파일(`server.ts`)을 수정하므로 병렬 실행 시 충돌 방지를 위해 단일 태스크로 번들링.

---

## Issue H4: rateLimitBuckets 무제한 증가

### Context
`rateLimitBuckets` Map이 IP별로 타임스탬프 배열을 저장한다. 고유 IP가 많아질 때 (DDoS, bot traffic) Map 크기가 무제한 증가하여 메모리 누수 발생.

### Current Code
```typescript
// packages/gateway/src/server.ts:29
const rateLimitBuckets = new Map<string, number[]>();
```

### Target
- Map 크기 상한선 설정 (예: 10,000 entries)
- 상한 도달 시 가장 오래된 bucket 일괄 제거 또는 LRU 정책 적용
- 또는 WeakRef 기반이 아닌, 주기적 eviction interval 설정

---

## Issue H6: evictStaleBuckets가 현재 IP를 제외하고만 정리

### Context
`evictStaleBuckets`는 매 요청마다 호출되어 stale bucket을 정리하지만, `excludeIp` 파라미터로 현재 요청 IP를 제외한다. 문제는 eviction이 요청 기반이라 트래픽이 없으면 stale bucket이 영원히 남고, 많은 IP가 동시에 접근 시 O(n) 순회 비용이 매 요청에 발생한다.

### Current Code
```typescript
// packages/gateway/src/server.ts:196-204
function evictStaleBuckets(now: number, excludeIp: string): void {
    const staleThreshold = now - RATE_LIMIT_WINDOW_MS * 2;
    for (const [ip, ts] of rateLimitBuckets) {
        if (ip === excludeIp) continue;
        const latest = ts[ts.length - 1];
        if (latest === undefined || latest < staleThreshold) {
            rateLimitBuckets.delete(ip);
        }
    }
}
```

### Target
- 매 요청이 아닌 주기적 interval (예: 30초)로 eviction 실행
- 또는 eviction을 샘플링 방식으로 변경 (매 요청에서 랜덤 N개만 검사)
- `excludeIp` 로직 제거 (stale이면 현재 IP여도 정리 가능, 새 타임스탬프는 이후에 추가됨)

---

## Issue M5: WebSocket connections Set 무제한 증가

### Context
`connections` Set이 연결 시 add, 종료 시 delete한다. 정상 동작이지만 비정상 종료(클라이언트 크래시, 네트워크 끊김) 시 `close` 이벤트가 발생하지 않아 Set에 남을 수 있다.

### Current Code
```typescript
// packages/gateway/src/server.ts:28, 99-107
const connections = new Set<AuthenticatedWebSocket>();
// ...
wss.on('connection', (ws: AuthenticatedWebSocket) => {
    connections.add(ws);
    ws.on('close', () => {
        cleanupWsTimers(ws);
        connections.delete(ws);
    });
    setupWsAuth(ws, config, deps);
    setupWsHeartbeat(ws);
});
```

### Target
- `error` 이벤트 핸들러 추가하여 비정상 종료 시에도 cleanup
- 주기적으로 `connections`에서 dead connection 정리 (heartbeat timeout 기반)
- connections 최대 수 제한 (상한 도달 시 새 연결 거부 또는 가장 오래된 연결 종료)

---

## Issue M7: Request body string 누적 후 size 체크

### Context
`handleRequest`에서 body 청크를 string으로 누적한다. `bodyBytes`로 크기를 확인하지만, `body += chunk.toString()` 이 `bodyBytes` 체크 이전에 string 변환을 수행한다. 32KB 이하여도 string concatenation이 매 청크마다 새 string을 생성하여 GC pressure 증가.

### Current Code
```typescript
// packages/gateway/src/server.ts:141-155
let body = '';
let bodyBytes = 0;
let aborted = false;

req.on('data', (chunk: Buffer) => {
    if (aborted) return;
    bodyBytes += chunk.length;
    if (bodyBytes > MAX_BODY_BYTES) {
        aborted = true;
        sendError(res, 413, 'Request body too large', requestId);
        req.destroy();
        return;
    }
    body += chunk.toString();
});
```

### Target
- Buffer 배열로 청크를 수집한 후 `Buffer.concat` + `toString` 한 번만 호출
- 또는 `bodyBytes` 체크를 `chunk.toString()` 이전으로 이동 (string 생성 최소화)
- 대형 body가 확실히 거부된 후에만 string 변환 수행

---

## Acceptance Criteria (통합)

- [ ] H4: `rateLimitBuckets` Map에 크기 상한 또는 주기적 정리 메커니즘
- [ ] H6: eviction이 매 요청 O(n) 순회가 아닌 효율적 방식으로 변경
- [ ] M5: WebSocket `error` 이벤트 핸들링 + dead connection 정리
- [ ] M7: body 청크 수집이 Buffer 기반으로 변경되거나 불필요한 string 생성 제거
- [ ] 기존 테스트 (`server.test.ts`) 전체 통과
- [ ] 새 테스트: rate limit bucket 상한 도달 검증
- [ ] 새 테스트: WebSocket 비정상 종료 후 connections 정리 검증

## Estimated Impact

| Issue | Metric | Before | After |
|-------|--------|--------|-------|
| H4 | Memory (10K IPs) | 무제한 증가 | 상한 제한 |
| H6 | Per-request overhead | O(n) bucket scan | O(1) amortized |
| M5 | Leaked connections | 누적 가능 | 자동 정리 |
| M7 | GC pressure per request | 청크당 string alloc | 1회 alloc |
