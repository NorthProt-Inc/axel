import { describe, expect, it, vi } from 'vitest';
import { ConsolidationService } from '../../src/memory/consolidation-service.js';

function mockEpisodicMemory() {
	return {
		layerName: 'M2:episodic' as const,
		createSession: vi.fn(),
		endSession: vi.fn(),
		addMessage: vi.fn(),
		getRecentSessions: vi.fn(),
		getSessionMessages: vi.fn().mockResolvedValue([
			{ role: 'user', content: 'I love TypeScript', channelId: 'cli', timestamp: new Date(), tokenCount: 10 },
			{ role: 'assistant', content: 'Nice!', channelId: 'cli', timestamp: new Date(), tokenCount: 5 },
			{ role: 'user', content: 'I prefer functional programming', channelId: 'cli', timestamp: new Date(), tokenCount: 15 },
			{ role: 'assistant', content: 'Great choice!', channelId: 'cli', timestamp: new Date(), tokenCount: 8 },
		]),
		listSessions: vi.fn(),
		searchByTopic: vi.fn(),
		searchByContent: vi.fn(),
		findUnconsolidated: vi.fn().mockResolvedValue([
			{ sessionId: 'sess-1', userId: 'user-1', channelId: 'cli' },
		]),
		markConsolidated: vi.fn().mockResolvedValue(undefined),
		healthCheck: vi.fn(),
	};
}

function mockSemanticMemory() {
	return {
		layerName: 'M3:semantic' as const,
		store: vi.fn().mockResolvedValue('mem-uuid-1'),
		search: vi.fn().mockResolvedValue([]),
		decay: vi.fn(),
		delete: vi.fn(),
		getByUuid: vi.fn(),
		updateAccess: vi.fn().mockResolvedValue(undefined),
		healthCheck: vi.fn(),
	};
}

function mockEmbedding() {
	return {
		embed: vi.fn().mockResolvedValue(new Float32Array(1536)),
	};
}

function mockLlm(response = '{"memories":[{"content":"User likes TypeScript","type":"preference","importance":0.6}]}') {
	return {
		getGenerativeModel: vi.fn().mockReturnValue({
			generateContent: vi.fn().mockResolvedValue({
				response: { text: () => response },
			}),
		}),
	};
}

describe('ConsolidationService', () => {
	it('processes unconsolidated sessions and stores memories', async () => {
		const em = mockEpisodicMemory();
		const sm = mockSemanticMemory();
		const embed = mockEmbedding();
		const llm = mockLlm();

		const service = new ConsolidationService({
			episodicMemory: em,
			semanticMemory: sm,
			embeddingService: embed,
			llmClient: llm,
			model: 'gemini-3-flash-preview',
		});

		const result = await service.consolidate();

		expect(result.sessionsProcessed).toBe(1);
		expect(result.memoriesExtracted).toBe(1);
		expect(result.memoriesStored).toBe(1);
		expect(result.memoriesUpdated).toBe(0);
		expect(em.markConsolidated).toHaveBeenCalledWith('sess-1');
		expect(sm.store).toHaveBeenCalledTimes(1);
	});

	it('deduplicates with updateAccess when similarity >= threshold', async () => {
		const em = mockEpisodicMemory();
		const sm = mockSemanticMemory();
		sm.search.mockResolvedValue([{
			memory: { uuid: 'existing-uuid' },
			vectorScore: 0.95,
			textScore: 0.90,
			finalScore: 0.94,
		}]);
		const embed = mockEmbedding();
		const llm = mockLlm();

		const service = new ConsolidationService({
			episodicMemory: em,
			semanticMemory: sm,
			embeddingService: embed,
			llmClient: llm,
			model: 'gemini-3-flash-preview',
		});

		const result = await service.consolidate();

		expect(result.memoriesUpdated).toBe(1);
		expect(result.memoriesStored).toBe(0);
		expect(sm.updateAccess).toHaveBeenCalledWith('existing-uuid');
	});

	it('skips sessions with too few turns', async () => {
		const em = mockEpisodicMemory();
		em.getSessionMessages.mockResolvedValue([
			{ role: 'user', content: 'Hi', channelId: 'cli', timestamp: new Date(), tokenCount: 2 },
		]);
		const sm = mockSemanticMemory();
		const embed = mockEmbedding();
		const llm = mockLlm();

		const service = new ConsolidationService({
			episodicMemory: em,
			semanticMemory: sm,
			embeddingService: embed,
			llmClient: llm,
			model: 'gemini-3-flash-preview',
		});

		const result = await service.consolidate();

		expect(result.memoriesExtracted).toBe(0);
		expect(em.markConsolidated).toHaveBeenCalledWith('sess-1');
	});

	it('handles LLM extraction failure gracefully', async () => {
		const em = mockEpisodicMemory();
		const sm = mockSemanticMemory();
		const embed = mockEmbedding();
		const llm = {
			getGenerativeModel: vi.fn().mockReturnValue({
				generateContent: vi.fn().mockRejectedValue(new Error('LLM error')),
			}),
		};

		const service = new ConsolidationService({
			episodicMemory: em,
			semanticMemory: sm,
			embeddingService: embed,
			llmClient: llm,
			model: 'gemini-3-flash-preview',
		});

		const result = await service.consolidate();

		// Should not crash, just skip the failed session
		expect(result.sessionsProcessed).toBe(1);
		expect(result.memoriesExtracted).toBe(0);
	});
});
