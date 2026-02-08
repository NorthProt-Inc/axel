# ADR-002: PostgreSQL + pgvector Single Database

> Status: ACCEPTED
> Date: 2026-02-07
> Author: Architecture Division

## Context

axnmihn은 3개의 분리된 스토리지를 사용했다:

1. **SQLite** — 세션/메시지 (WAL 모드, 단일 writer)
2. **ChromaDB** — 벡터 검색 (별도 프로세스, Python 네이티브)
3. **JSON 파일** — 지식 그래프 (956KB, 전체 메모리 로드)

이 3-스토리지 구조는:
- 트랜잭션 일관성 없음 (벡터 저장 성공 + SQLite 실패 → 불일치)
- 3개 백업 전략 필요
- ChromaDB가 별도 프로세스 → 리소스 오버헤드
- JSON graph가 메모리 로드 → 메모리 압박 + I/O 병목

## Decision

**PostgreSQL 16 + pgvector 0.8을 단일 데이터베이스로 사용한다.**

| 기능 | axnmihn | Axel |
|------|---------|------|
| 세션/메시지 | SQLite | PostgreSQL |
| 벡터 검색 | ChromaDB (별도 프로세스) | pgvector (같은 DB) |
| 지식 그래프 | JSON 파일 (메모리 로드) | PostgreSQL 테이블 (entities, relations) |
| 트랜잭션 | SQLite WAL (단일 writer) | PostgreSQL MVCC (동시 read/write) |
| 백업 | 파일 복사 3곳 | `pg_dump` + WAL archiving 1곳 |

### Schema Overview

- `sessions`, `messages` — Episodic Memory (Layer 2)
- `memories` + `vector(3072)` — Semantic Memory (Layer 3, pgvector)
- `entities`, `relations` — Conceptual Memory (Layer 4)
- `memory_access_patterns` + `hot_memories` MV — Meta Memory (Layer 5)
- `interaction_logs` — 텔레메트리

### Redis의 역할

PostgreSQL은 "영구 기억", Redis는 "순간 기억"으로 역할 분리:
- Working Memory: 빈번한 read/write, 낮은 latency → Redis
- Session Router: pub/sub → Redis
- Rate Limiting: token bucket → Redis
- 모든 Redis 데이터는 PostgreSQL에 shadow write → Redis 장애 시 PG fallback 가능 (ADR-003 참조)

## Alternatives Considered

| Option | Pros | Cons |
|--------|------|------|
| **PostgreSQL + pgvector (선택)** | 단일 DB, 트랜잭션, pg_dump 백업, SQL 그래프 탐색 | pgvector가 전용 벡터 DB 대비 기능 제한적 |
| SQLite + ChromaDB + JSON 유지 | 마이그레이션 불필요 | 3개 스토리지 동기화, 트랜잭션 없음, 기술 부채 |
| MongoDB + Atlas Vector Search | 유연한 스키마, 벡터 검색 내장 | ACID 약함, 관계 데이터에 부적합, 비용 높음 |
| Qdrant / Pinecone (전용 벡터 DB) | 벡터 검색 최적화 | 추가 인프라, 비용, 관계 데이터 별도 관리 |
| DuckDB | 분석 쿼리 빠름 | 벡터 검색 미성숙, 동시 write 제한 |

## Consequences

### Positive
- 모든 데이터가 하나의 트랜잭션으로 일관성 보장
- `pg_dump` 하나로 전체 백업/복원
- SQL JOIN으로 그래프 탐색 → BFS 알고리즘 불필요
- pgvector IVFFlat/HNSW 인덱스로 벡터 검색 성능 확보
- connection pool (pg)로 동시 요청 처리

### Negative
- pgvector는 전용 벡터 DB(Qdrant, Pinecone) 대비 벡터 검색 기능 제한적
  - Mitigation: Axel 규모 (1,000~10,000 벡터)에서 pgvector는 충분
- axnmihn 데이터 전량 마이그레이션 필요 (PLAN-003)
- PostgreSQL 운영 부담 (self-hosted 시 WAL, vacuum, 모니터링)

### pgvector Index Strategy

RES-001 연구 결과 기반:
- 1,000~10,000 규모: HNSW 권장 (7.4x faster queries, better recall)
- 10,000+ 규모: IVFFlat 검토 (build time, memory 절약)
- 상세 인덱스 전략은 plan Section 4 Layer 3에서 정의

## References

- Plan v2.0 Section 3.2: 데이터베이스 결정
- Plan v2.0 Section 4 Layer 2: Persistence (PostgreSQL schema)
- ADR-003: Redis for Working Memory
- ADR-013: 6-Layer Memory Architecture
- RES-001: pgvector Index Comparison
- PLAN-003: Migration Strategy
