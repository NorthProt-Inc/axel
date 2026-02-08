# ADR-003: Redis for Working Memory and Ephemeral State

> Status: ACCEPTED
> Date: 2026-02-07
> Author: Architecture Division

## Context

Axel의 MISSION Principle #2는 "PostgreSQL + pgvector 단일 DB"를 명시한다. 그러나 일부 데이터 패턴은 PostgreSQL의 특성과 맞지 않는다:

1. **Working Memory**: 현재 대화 턴 (최근 20개) — 초당 수십 회 read/write, 1시간 후 만료
2. **Cross-Channel Session Router**: pub/sub 이벤트 전파 — 실시간 채널 간 알림
3. **Rate Limiting**: token bucket 카운터 — 60초 TTL
4. **Intent Classification Cache**: 동일 패턴 분류 결과 — 5분 TTL
5. **Speculative Prefetch**: 선제 로딩된 기억 — 30초 TTL

이들은 모두 **빈번한 read/write + 짧은 TTL + 영구 보존 불필요**한 데이터이다.

### PostgreSQL 단일 DB 원칙과의 관계 (ERR-010 해소)

Redis는 PostgreSQL을 대체하는 것이 아니라, **ephemeral cache layer**로 기능한다:
- 모든 Redis 데이터는 PostgreSQL에 shadow write됨
- Redis 장애 시 PostgreSQL fallback으로 서비스 지속 가능 (latency 증가 허용)
- Redis는 "있으면 빠르고, 없어도 동작하는" 캐시

## Decision

**Redis 7 (또는 Valkey)를 ephemeral cache + pub/sub로 사용한다.**

### Redis 데이터 구조

```
# Working Memory (현재 활성 대화)
HASH   axel:working:{userId}         # 현재 세션 메타데이터
LIST   axel:working:{userId}:turns   # 최근 N턴 (JSON)
EXPIRE 3600                          # 1시간 비활동 시 만료

# Cross-Channel Session Router
HASH   axel:session:{userId}         # 활성 세션 ID, 채널, 마지막 활동
PUBSUB axel:channel:{channelId}      # 채널별 이벤트 스트림

# Rate Limiting
STRING axel:rate:{userId}:{minute}   # Token bucket 카운터
EXPIRE 60

# Intent Classification Cache
STRING axel:intent:{hash}            # 동일 패턴의 분류 결과
EXPIRE 300                           # 5분 TTL

# Speculative Prefetch
HASH   axel:prefetch:{userId}        # 선제 로딩된 기억 맥락
EXPIRE 30                            # 30초 TTL
```

### Shadow Write 규칙

| Redis Key | PostgreSQL Shadow | Write Timing |
|-----------|-------------------|--------------|
| `axel:working:*:turns` | `messages` table | 매 턴 비동기 INSERT |
| `axel:session:*` | `sessions` table | 세션 시작/종료 시 |
| `axel:rate:*` | 없음 (ephemeral only) | — |
| `axel:intent:*` | 없음 (cache only) | — |
| `axel:prefetch:*` | 없음 (cache only) | — |

### Redis 장애 시 Degradation Path

1. Redis 연결 실패 감지 (circuit breaker)
2. Working Memory: PostgreSQL `messages` 테이블 직접 쿼리 (latency ~50ms → ~200ms)
3. Session Router: pub/sub 비활성화, polling fallback (1초 간격)
4. Rate Limiting: in-memory Map 사용 (프로세스 재시작 시 리셋 허용)
5. Cache/Prefetch: 캐시 미스로 처리 (매번 원본 조회)
6. 로그에 degraded mode 경고 기록

## Alternatives Considered

| Option | Pros | Cons |
|--------|------|------|
| **Redis as ephemeral cache (선택)** | 빠른 read/write, TTL 네이티브, pub/sub, PG fallback 가능 | 추가 인프라 (Redis 프로세스) |
| PostgreSQL only | 단일 DB 원칙 완전 준수 | Working Memory latency 부적합, pub/sub 없음, TTL 수동 관리 |
| In-memory Map only | 외부 의존성 없음 | 프로세스 재시작 시 유실, pub/sub 없음, 규모 확장 불가 |
| SQLite (WAL) | 로컬 파일, 가벼움 | 동시 write 제한, pub/sub 없음 |
| Memcached | 간단한 캐시 | pub/sub 없음, 데이터 구조 제한적 |

## Consequences

### Positive
- Working Memory read/write latency < 1ms
- Redis pub/sub로 채널 간 실시간 이벤트 전파
- TTL 기반 자동 만료 → 수동 cleanup 불필요
- Shadow write로 PostgreSQL 단일 DB 원칙 실질적 유지

### Negative
- Redis 프로세스 운영 부담 (Docker Compose에 포함)
- Redis ↔ PostgreSQL 동기화 지연 (비동기 shadow write)
  - Mitigation: 핵심 데이터는 즉시 PG write, 캐시성 데이터만 비동기
- Redis 장애 시 latency 증가 (degraded mode)

## References

- Plan v2.0 Section 3.2: Redis 역할
- Plan v2.0 Section 4 Layer 2: Redis 구조
- ADR-002: PostgreSQL Single DB
- ADR-013: 6-Layer Memory Architecture (Layer 0 Stream Buffer, Layer 1 Working Memory)
- ERR-010: Redis usage vs PG single DB principle
- ERR-038: Redis critical functions error handling
