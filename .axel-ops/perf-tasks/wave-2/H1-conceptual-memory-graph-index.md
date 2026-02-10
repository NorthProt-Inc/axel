# PERF-H1: conceptual-memory traverse — O(R) 관계 스캔

## Metadata

| Field | Value |
|-------|-------|
| ID | PERF-H1 |
| Severity | HIGH |
| Package | core |
| File | packages/core/src/memory/conceptual-memory.ts |
| Lines | 43-74 |
| Wave | 2 |
| Depends On | PERF-C6 (ConceptualMemory 인터페이스 조율) |
| Blocks | (없음) |
| Test File | packages/core/tests/memory/conceptual-memory.test.ts |

## Context

`expandFrontier`가 frontier의 각 노드에 대해 **전체 관계 배열**(`this.relations`)을 순회하여 인접 노드를 찾는다. 관계가 R개이면 frontier 크기 F에 대해 O(F × R) 복잡도. 그래프가 커질수록 (수백 엔티티, 수천 관계) traversal 비용이 급격히 증가한다. 인덱스가 없어서 모든 관계를 매번 full scan한다.

## Current Code

```typescript
// packages/core/src/memory/conceptual-memory.ts:43-74
async traverse(entityId: string, maxDepth: number): Promise<readonly GraphNode[]> {
    const visited = new Set<string>([entityId]);
    const result: GraphNode[] = [];
    let frontier = [entityId];

    for (let depth = 1; depth <= maxDepth; depth++) {
        const nextFrontier = this.expandFrontier(frontier, visited, result, depth);
        frontier = nextFrontier;
    }

    return result;
}

private expandFrontier(
    frontier: readonly string[],
    visited: Set<string>,
    result: GraphNode[],
    depth: number,
): string[] {
    const nextFrontier: string[] = [];
    for (const sourceId of frontier) {
        for (const rel of this.relations) {           // O(R) full scan
            if (rel.sourceId !== sourceId || visited.has(rel.targetId)) continue;
            visited.add(rel.targetId);
            const entity = this.entities.get(rel.targetId);
            if (!entity) continue;
            result.push({ entity, relationType: rel.relationType, weight: rel.weight, depth });
            nextFrontier.push(rel.targetId);
        }
    }
    return nextFrontier;
}
```

## Target Optimization

**접근 방식: 인접 리스트 (adjacency list) 인덱스**

1. `relations` 배열 대신 `Map<string, Relation[]>` 형태의 adjacency list 유지
   - key: `sourceId`, value: 해당 source에서 나가는 관계들
2. `addRelation` 시 adjacency list에도 추가
3. `expandFrontier`에서 `sourceId`로 O(1) 조회하여 해당 관계만 순회

```typescript
// 방향성 예시
private readonly adjacency = new Map<string, Relation[]>();

// expandFrontier에서:
const rels = this.adjacency.get(sourceId) ?? [];
for (const rel of rels) { ... }
```

**C6 인터페이스 조율**: C6에서 batch 메서드가 추가되면 adjacency list 업데이트도 batch로 처리.

## Acceptance Criteria

- [ ] `expandFrontier`에서 전체 `relations` full scan 제거
- [ ] adjacency list 또는 동등한 인덱스 구조 추가
- [ ] `addRelation`, `removeRelation` 등 mutation 시 인덱스 동기화
- [ ] C6 인터페이스 변경과 호환 (batch addRelation 지원)
- [ ] 기존 테스트 (`conceptual-memory.test.ts`) 전체 통과
- [ ] 새 테스트: 1000+ 관계에서 traverse 성능 O(F × degree) 확인
- [ ] traverse 결과가 기존과 동일 (순서 무관, 내용 일치)

## Estimated Impact

| Metric | Before | After |
|--------|--------|-------|
| expandFrontier per node | O(R) — 전체 관계 | O(degree) — 인접 관계만 |
| 500 relations, frontier 5 | ~2500 iterations | ~25 iterations (avg degree 5) |
| Memory overhead | 없음 | adjacency Map (관계 참조) |
| Traverse latency | 관계 수에 비례 | 그래프 밀도에 비례 |
