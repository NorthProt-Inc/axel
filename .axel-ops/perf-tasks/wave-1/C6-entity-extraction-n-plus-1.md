# PERF-C6: memory-persistence entity extraction — N+1 findEntity/addEntity

## Metadata

| Field | Value |
|-------|-------|
| ID | PERF-C6 |
| Severity | CRITICAL |
| Package | core |
| File | packages/core/src/orchestrator/memory-persistence.ts |
| Lines | 159-198 |
| Wave | 1 |
| Depends On | (없음) |
| Blocks | PERF-H1 (coordinate) |
| Test File | packages/core/tests/orchestrator/memory-persistence.test.ts |

## Context

엔티티 추출 후 각 엔티티를 개별적으로 `findEntity` → `incrementMentions` 또는 `addEntity`로 처리한다. 관계(relation)도 개별 `addRelation` 호출. 추출된 엔티티가 10-20개일 때 20-40회의 DB/인메모리 조회가 발생한다. `ConceptualMemory` 인터페이스에 batch 메서드가 없어서 개별 호출이 강제되고 있다.

## Current Code

```typescript
// packages/core/src/orchestrator/memory-persistence.ts:159-198
async function extractAndStoreEntities(
    entityExtractor: EntityExtractorLike,
    conceptualMemory: ConceptualMemoryLike,
    userContent: string,
    assistantContent: string,
): Promise<void> {
    const extracted = await entityExtractor.extract(userContent, assistantContent);

    // Store entities (upsert: find existing or create new)
    const entityIdMap = new Map<string, string>();
    for (const entity of extracted.entities) {
        const existing = await conceptualMemory.findEntity(entity.name);
        if (existing) {
            await conceptualMemory.incrementMentions(existing.entityId);
            entityIdMap.set(entity.name, existing.entityId);
        } else {
            const entityId = await conceptualMemory.addEntity({
                name: entity.name,
                entityType: entity.type,
                metadata: entity.properties,
            });
            entityIdMap.set(entity.name, entityId);
        }
    }

    // Store relations
    for (const relation of extracted.relations) {
        const sourceId = entityIdMap.get(relation.source);
        const targetId = entityIdMap.get(relation.target);
        if (sourceId && targetId) {
            await conceptualMemory.addRelation({
                sourceId,
                targetId,
                relationType: relation.type,
                weight: 1.0,
            });
        }
    }
}
```

## Target Optimization

**접근 방식: ConceptualMemory에 batch 인터페이스 추가**

1. `ConceptualMemoryLike`에 `findEntities(names: string[])` batch 메서드 추가
2. `upsertEntities(entities[])` — 존재하면 increment, 없으면 create
3. `addRelations(relations[])` — batch relation 추가
4. `extractAndStoreEntities`를 batch 메서드 사용으로 리팩터

**또는 최소 변경 접근**: `Promise.all`로 독립 엔티티 조회를 병렬화 (인터페이스 변경 없이).

**인터페이스 변경 시 H1 태스크(ConceptualMemory)와 조율 필요.**

## Acceptance Criteria

- [ ] 엔티티 처리 루프에서 N+1 개별 호출 제거 (batch 또는 병렬)
- [ ] 관계 처리도 batch 또는 병렬화
- [ ] `ConceptualMemoryLike` 인터페이스 변경 시 H1 태스크와 호환성 유지
- [ ] 기존 테스트 (`memory-persistence.test.ts`) 전체 통과
- [ ] 새 테스트: 10+ 엔티티 추출 시 호출 패턴 검증 (batch 또는 병렬)
- [ ] 엔티티 중복 처리 로직(upsert) 동작 유지

## Estimated Impact

| Metric | Before | After |
|--------|--------|-------|
| DB calls (10 entities, 5 relations) | 20-25 | 2-3 (batch) |
| Latency per persist cycle | ~100ms | ~15ms |
| ConceptualMemory API | 개별 호출 | batch 지원 |
