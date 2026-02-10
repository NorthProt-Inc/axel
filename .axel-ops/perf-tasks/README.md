# Performance Optimization Tasks

> Generated: 2026-02-10 | Source: `/perf` analysis | Issues: 20 (CRITICAL 6, HIGH 6, MEDIUM 8)

## Summary

20개 성능 이슈를 의존성 분석 기반으로 3개 웨이브, 15개 태스크 파일로 구조화.
동일 파일 충돌 이슈는 번들링하여 병렬 실행 시 merge conflict 방지.

## Dependency Graph

```
Wave 1 (병렬)                          Wave 2 (Wave 1 완료 후)        Wave 3
─────────────────                      ─────────────────────          ──────
C1  ────blocks────────────────────→    C2                             INTEGRATION
C3  ────pattern───────────────────→    H2-H3                          -VERIFY
C6  ────coordinate────────────────→    H1
M2  (독립)                             M1 ──informs──→ C4
C5  (독립)
M3-M4 (독립)
H4-H6-M5-M7 (독립)
H5  (독립)
M6  (독립)
M8  (독립)
```

### Dependency Details

| From | To | Type | Reason |
|------|----|------|--------|
| PERF-C1 | PERF-C2 | blocks | assembler.ts 동일 파일, C1이 `truncateToFit` 시그니처 변경 |
| PERF-C6 | PERF-H1 | coordinate | `ConceptualMemory` 인터페이스 공유 |
| PERF-M1 | PERF-C4 | informs | 임베딩 정규화 패턴 → consolidation 품질 영향 |
| PERF-C3 | PERF-H2-H3 | pattern | PG batch 패턴 확립 → Redis flush에 동일 패턴 적용 |

### File Conflict Bundles

| Bundle | Issues | Target File |
|--------|--------|-------------|
| H4-H6-M5-M7 | 4개 이슈 | `packages/gateway/src/server.ts` |
| M3-M4 | 2개 이슈 | `packages/infra/src/db/pg-episodic-memory.ts` |
| H2-H3 | 2개 이슈 | `packages/infra/src/cache/redis-working-memory.ts` |

## Wave Execution Plan

### Wave 1: 10 Agent Slots, 14 Issues (All Parallel)

| Slot | Division | Task ID | File | Severity |
|------|----------|---------|------|----------|
| 1 | dev-core | C1 | `core/context/assembler.ts` | CRITICAL |
| 2 | dev-core | C6 | `core/orchestrator/memory-persistence.ts` | CRITICAL |
| 3 | dev-core | M2 | `core/memory/episodic-memory.ts` | MEDIUM |
| 4 | dev-infra | C3 | `infra/db/pg-semantic-memory.ts` | CRITICAL |
| 5 | dev-infra | C5 | `infra/link/link-content-pipeline.ts` | CRITICAL |
| 6 | dev-infra | M3+M4 | `infra/db/pg-episodic-memory.ts` | MEDIUM |
| 7 | dev-edge | H4+H6+M5+M7 | `gateway/server.ts` | HIGH+MEDIUM |
| 8 | dev-edge | H5 | `gateway/prompt-defense.ts` | HIGH |
| 9 | dev-edge | M6 | `channels/discord/discord-channel.ts` | MEDIUM |
| 10 | ui-ux | M8 | `ui/cli/output.ts` + `theme.ts` | MEDIUM |

### Wave 2: 5 Agent Slots, 6 Issues (After Wave 1)

| Slot | Division | Task ID | Depends On | Severity |
|------|----------|---------|------------|----------|
| 1 | dev-core | C2 | C1 완료 | CRITICAL |
| 2 | dev-core | H1 | C6 인터페이스 | HIGH |
| 3 | dev-core | M1 | Wave 1 완료 | MEDIUM |
| 4 | dev-infra | C4 | M1 패턴 | CRITICAL |
| 5 | dev-infra | H2-H3 | C3 배치 패턴 | HIGH |

### Wave 3: Integration Verify (1 Agent)

전체 빌드 + 테스트 + 벤치마크 검증.

## Task File Index

### wave-1/

| File | Task ID | Severity |
|------|---------|----------|
| [`C1-assembler-truncate-binary-search.md`](wave-1/C1-assembler-truncate-binary-search.md) | PERF-C1 | CRITICAL |
| [`C3-pg-semantic-decay-n-plus-1.md`](wave-1/C3-pg-semantic-decay-n-plus-1.md) | PERF-C3 | CRITICAL |
| [`C5-link-pipeline-sequential-urls.md`](wave-1/C5-link-pipeline-sequential-urls.md) | PERF-C5 | CRITICAL |
| [`C6-entity-extraction-n-plus-1.md`](wave-1/C6-entity-extraction-n-plus-1.md) | PERF-C6 | CRITICAL |
| [`H4-H6-M5-M7-gateway-server-bundle.md`](wave-1/H4-H6-M5-M7-gateway-server-bundle.md) | PERF-H4/H6/M5/M7 | HIGH+MEDIUM |
| [`H5-prompt-defense-regex-passes.md`](wave-1/H5-prompt-defense-regex-passes.md) | PERF-H5 | HIGH |
| [`M2-episodic-tolowercase-repeat.md`](wave-1/M2-episodic-tolowercase-repeat.md) | PERF-M2 | MEDIUM |
| [`M3-M4-pg-episodic-bundle.md`](wave-1/M3-M4-pg-episodic-bundle.md) | PERF-M3/M4 | MEDIUM |
| [`M6-discord-unbounded-channel-cache.md`](wave-1/M6-discord-unbounded-channel-cache.md) | PERF-M6 | MEDIUM |
| [`M8-cli-theme-singleton.md`](wave-1/M8-cli-theme-singleton.md) | PERF-M8 | MEDIUM |

### wave-2/

| File | Task ID | Severity |
|------|---------|----------|
| [`C2-assembler-sequential-memory-layers.md`](wave-2/C2-assembler-sequential-memory-layers.md) | PERF-C2 | CRITICAL |
| [`C4-consolidation-sequential-sessions.md`](wave-2/C4-consolidation-sequential-sessions.md) | PERF-C4 | CRITICAL |
| [`H1-conceptual-memory-graph-index.md`](wave-2/H1-conceptual-memory-graph-index.md) | PERF-H1 | HIGH |
| [`H2-H3-redis-working-memory-batch.md`](wave-2/H2-H3-redis-working-memory-batch.md) | PERF-H2/H3 | HIGH |
| [`M1-semantic-cosine-null-checks.md`](wave-2/M1-semantic-cosine-null-checks.md) | PERF-M1 | MEDIUM |

### wave-3/

| File | Task ID |
|------|---------|
| [`INTEGRATION-VERIFY.md`](wave-3/INTEGRATION-VERIFY.md) | PERF-VERIFY |
