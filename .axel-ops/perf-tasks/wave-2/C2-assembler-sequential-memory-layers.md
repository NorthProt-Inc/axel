# PERF-C2: assembler assemble() — 7개 메모리 레이어 순차 실행

## Metadata

| Field | Value |
|-------|-------|
| ID | PERF-C2 |
| Severity | CRITICAL |
| Package | core |
| File | packages/core/src/context/assembler.ts |
| Lines | 62-163 |
| Wave | 2 |
| Depends On | PERF-C1 (동일 파일, truncateToFit 시그니처 변경) |
| Blocks | (없음) |
| Test File | packages/core/tests/context/assembler.test.ts |

## Context

`assemble()` 메서드가 7개의 메모리 레이어 (Working Memory, Stream Buffer, Semantic Search, Graph Traversal, Session Archive, Meta Memory, Tool Definitions)를 순차적으로 fetch + truncate한다. 각 레이어의 데이터 소스가 독립적이므로 병렬 fetch가 가능하지만 현재 `await`로 직렬화되어 있다. 7개 레이어의 latency가 합산되어 context assembly가 전체 응답 시간의 병목이 된다.

## Current Code

```typescript
// packages/core/src/context/assembler.ts:62-163
async assemble(params: AssembleParams): Promise<AssembledContext> {
    const { systemPrompt, userId, query, entityId } = params;

    const truncatedSystemPrompt = await this.truncateToFit(systemPrompt, this.budget.systemPrompt);
    const systemTokens = truncatedSystemPrompt
        ? await this.counter.count(truncatedSystemPrompt)
        : 0;

    const sections: ContextSection[] = [];

    // 1. Working Memory (M1)
    const turns = await this.provider.getWorkingMemory(userId, DEFAULTS.workingMemoryLimit);
    await this.addSection(sections, 'workingMemory', 'M1:working', formatTurns(turns), this.budget.workingMemory);

    // 2. Stream Buffer (M0)
    const events = await this.provider.getStreamBuffer(userId);
    await this.addSection(sections, 'streamBuffer', 'M0:stream', formatStreamEvents(events), this.budget.streamBuffer);

    // 3. Semantic Search (M3)
    const memories = await this.provider.searchSemantic(query, DEFAULTS.semanticSearchLimit);
    await this.addSection(sections, 'semanticSearch', 'M3:semantic', formatSemanticResults(memories), this.budget.semanticSearch);

    // 4. Graph Traversal (M4)
    let resolvedEntityId = entityId;
    if (resolvedEntityId === undefined && this.provider.searchEntities) {
        const entity = await this.provider.searchEntities(query);
        if (entity) { resolvedEntityId = entity.entityId; }
    }
    if (resolvedEntityId !== undefined) {
        const entities = await this.provider.traverseGraph(resolvedEntityId, DEFAULTS.graphDepth);
        await this.addSection(sections, 'graphTraversal', 'M4:conceptual', formatEntities(entities), this.budget.graphTraversal);
    }

    // 5. Session Archive (M2)
    const summaries = await this.provider.getSessionArchive(userId, DEFAULTS.sessionArchiveDays);
    await this.addSection(sections, 'sessionArchive', 'M2:episodic', formatSessionSummaries(summaries), this.budget.sessionArchive);

    // 6. Meta Memory (M5)
    const hotMemories = await this.provider.getMetaMemory(userId);
    await this.addSection(sections, 'metaMemory', 'M5:meta', formatHotMemories(hotMemories), this.budget.metaMemory);

    // 7. Tool Definitions (last)
    const tools = this.provider.getToolDefinitions();
    await this.addSection(sections, 'toolDefinitions', 'tools', formatToolDefinitions(tools), this.budget.toolDefinitions);

    // ... token counting and return
}
```

## Target Optimization

**접근 방식: 독립 레이어 병렬 fetch + 순차 section 추가**

1. **Phase 1 — 병렬 fetch**: 독립적인 데이터 소스를 `Promise.all`로 동시 fetch
   - M1 (Working Memory), M0 (Stream Buffer), M3 (Semantic Search), M2 (Session Archive), M5 (Meta Memory), Tools는 모두 독립
   - M4 (Graph Traversal)은 `entityId` 해석이 필요하므로 `searchEntities` → `traverseGraph` 체인 유지
2. **Phase 2 — 순차 section 구성**: fetch 결과를 순서대로 `addSection`에 전달 (토큰 예산 계산은 순차)
3. `addSection` 내부의 `truncateToFit`도 병렬화 가능 (C1 완료 후의 새 시그니처에 맞춰 조정)

**의존성 주의**: C1에서 `truncateToFit` 시그니처가 변경될 수 있으므로 C1 완료 후 작업.

## Acceptance Criteria

- [ ] 독립 메모리 레이어의 fetch가 `Promise.all` 등으로 병렬화
- [ ] 최종 section 순서는 기존과 동일 (M1 → M0 → M3 → M4 → M2 → M5 → Tools)
- [ ] 토큰 예산 계산의 정확도 유지
- [ ] C1의 `truncateToFit` 변경사항 반영
- [ ] 기존 테스트 (`assembler.test.ts`) 전체 통과
- [ ] 새 테스트: 병렬 fetch 시 모든 레이어가 정상 반환되는지 검증
- [ ] 새 테스트: 개별 레이어 실패 시 격리 동작 확인

## Estimated Impact

| Metric | Before | After |
|--------|--------|-------|
| Assemble latency | sum(7 layers) ≈ 7 × avg | max(7 layers) ≈ 1 × max |
| Typical latency (50ms/layer avg) | ~350ms | ~80-100ms |
| Context assembly throughput | 직렬 | 병렬 (3-5x 개선) |
