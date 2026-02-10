# PERF-C4: consolidation-service — 세션별 순차 처리 + 내부 N+1

## Metadata

| Field | Value |
|-------|-------|
| ID | PERF-C4 |
| Severity | CRITICAL |
| Package | infra |
| File | packages/infra/src/memory/consolidation-service.ts |
| Lines | 73-132 |
| Wave | 2 |
| Depends On | PERF-M1 (임베딩 정규화 패턴) |
| Blocks | (없음) |
| Test File | packages/infra/tests/memory/consolidation-service.test.ts |

## Context

Consolidation 서비스가 여러 세션을 순차적으로 처리한다. 각 세션 내에서:
1. 메시지 조회 (1 쿼리)
2. LLM 호출로 메모리 추출 (1 API 호출)
3. 각 추출된 메모리마다: 임베딩 생성 → 유사도 검색 → store/update (N+1)
4. 세션 마킹 (1 쿼리)

세션이 10개이고 각 세션에서 5개 메모리가 추출되면 약 50+α 개의 DB/API 호출이 순차 실행된다.

## Current Code

```typescript
// packages/infra/src/memory/consolidation-service.ts:73-132
for (const session of sessions) {
    try {
        const messages = await this.episodicMemory.getSessionMessages(session.sessionId);

        if (!shouldConsolidate(messages.length, this.config)) {
            await this.episodicMemory.markConsolidated(session.sessionId);
            continue;
        }

        const conversationText = formatSessionForExtraction(messages);
        const generativeModel = this.llmClient.getGenerativeModel({ model: this.model });

        const result = await generativeModel.generateContent({
            contents: [{ role: 'user', parts: [{ text: conversationText }] }],
            systemInstruction: { parts: [{ text: EXTRACTION_PROMPT }] },
        });

        const extracted = parseExtractedMemories(result.response.text(), session.sessionId, session.channelId);
        memoriesExtracted += extracted.length;

        for (const memory of extracted) {
            const embedding = await this.embeddingService.embed(memory.content, 'RETRIEVAL_DOCUMENT');
            const similar = await this.semanticMemory.search({
                text: memory.content, embedding, limit: 1, minImportance: 0,
            });

            const topMatch = similar[0];
            if (topMatch && topMatch.finalScore >= this.config.similarityThreshold) {
                await this.semanticMemory.updateAccess(topMatch.memory.uuid);
                memoriesUpdated++;
            } else {
                await this.semanticMemory.store({ content: memory.content, memoryType: memory.memoryType,
                    importance: memory.importance, embedding, sourceChannel: memory.sourceChannel,
                    sourceSession: memory.sourceSession });
                memoriesStored++;
            }
        }

        await this.episodicMemory.markConsolidated(session.sessionId);
    } catch (err: unknown) {
        this.logger.warn('Failed to consolidate session', {
            sessionId: session.sessionId, error: err instanceof Error ? err.message : String(err),
        });
    }
}
```

## Target Optimization

**접근 방식: 2단계 병렬화**

### Level 1: 세션 간 병렬화 (제한적)
- LLM 호출은 rate limit이 있으므로 concurrency 제한 (2-3 동시)
- `Promise.allSettled` + semaphore/pool 패턴

### Level 2: 세션 내 메모리 처리 병렬화
- 추출된 메모리들의 임베딩 생성을 batch로 (`embedBatch` API가 있다면)
- 유사도 검색은 독립적이므로 `Promise.all`로 병렬
- store/update는 검색 결과에 의존하므로 검색 완료 후 실행

### Level 3: M1 패턴 반영
- M1에서 임베딩 정규화 패턴이 변경되면 consolidation의 embedding → search 품질에 영향
- M1 완료 후 search threshold 재검증 필요

## Acceptance Criteria

- [ ] 세션 간 처리가 제한된 병렬로 전환 (concurrency limit 설정)
- [ ] 세션 내 메모리 임베딩 생성이 batch 또는 병렬
- [ ] 개별 세션 실패가 다른 세션에 영향 없음 (기존 try-catch 유지)
- [ ] LLM API rate limit 준수 (동시 호출 상한)
- [ ] 기존 테스트 (`consolidation-service.test.ts`) 전체 통과
- [ ] 새 테스트: 다중 세션 병렬 처리 동작 검증
- [ ] 새 테스트: 임베딩 batch 처리 검증

## Estimated Impact

| Metric | Before | After |
|--------|--------|-------|
| 10 sessions × 5 memories 처리 | 순차 (50+ 호출) | 병렬 (3 세션 동시, batch embed) |
| Consolidation cycle latency | ~30s | ~10-12s |
| LLM API utilization | 1 요청/시간 | 2-3 요청/시간 (제한 내) |
