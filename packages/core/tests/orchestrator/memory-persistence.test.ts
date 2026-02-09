import { describe, expect, it, vi } from 'vitest';
import type { EpisodicMemory, Turn, WorkingMemory } from '../../src/memory/types.js';
import {
	type ConceptualMemoryLike,
	type EntityExtractorLike,
	type MemoryPersistenceParams,
	type SemanticMemoryWriterLike,
	estimateTokenCount,
	persistToMemory,
} from '../../src/orchestrator/memory-persistence.js';

// ─── Test Helpers ───

function makeWorkingMemory(): WorkingMemory {
	return {
		layerName: 'M1:working',
		pushTurn: vi.fn().mockResolvedValue(undefined),
		getTurns: vi.fn().mockResolvedValue([]),
		getSummary: vi.fn().mockResolvedValue(null),
		compress: vi.fn().mockResolvedValue(undefined),
		flush: vi.fn().mockResolvedValue(undefined),
		clear: vi.fn().mockResolvedValue(undefined),
		healthCheck: vi.fn().mockResolvedValue({
			state: 'healthy',
			latencyMs: 0,
			message: null,
			lastChecked: new Date(),
		}),
	};
}

function makeEpisodicMemory(): EpisodicMemory {
	return {
		layerName: 'M2:episodic',
		createSession: vi.fn().mockResolvedValue('session-1'),
		endSession: vi.fn().mockResolvedValue(undefined),
		addMessage: vi.fn().mockResolvedValue(undefined),
		getRecentSessions: vi.fn().mockResolvedValue([]),
		searchByTopic: vi.fn().mockResolvedValue([]),
		searchByContent: vi.fn().mockResolvedValue([]),
		healthCheck: vi.fn().mockResolvedValue({
			state: 'healthy',
			latencyMs: 0,
			message: null,
			lastChecked: new Date(),
		}),
	};
}

function makeSemanticWriter(): SemanticMemoryWriterLike {
	return {
		storeConversationMemory: vi.fn().mockResolvedValue('mem-1'),
	};
}

function makeEntityExtractor(): EntityExtractorLike {
	return {
		extract: vi.fn().mockResolvedValue({
			entities: [{ name: 'TypeScript', type: 'technology', properties: {} }],
			relations: [],
		}),
	};
}

function makeConceptualMemory(): ConceptualMemoryLike {
	return {
		addEntity: vi.fn().mockResolvedValue('entity-1'),
		addRelation: vi.fn().mockResolvedValue(undefined),
		findEntity: vi.fn().mockResolvedValue(null),
		incrementMentions: vi.fn().mockResolvedValue(undefined),
	};
}

function makeParams(overrides?: Partial<MemoryPersistenceParams>): MemoryPersistenceParams {
	return {
		workingMemory: makeWorkingMemory(),
		episodicMemory: makeEpisodicMemory(),
		userId: 'user-1',
		sessionId: 'sess-1',
		channelId: 'discord',
		userContent: 'Hello Axel',
		userTimestamp: new Date('2026-02-08T12:00:00Z'),
		assistantContent: 'Hi there!',
		assistantTimestamp: new Date('2026-02-08T12:00:01Z'),
		baseTurnId: 1,
		...overrides,
	};
}

// ─── Tests ───

describe('estimateTokenCount', () => {
	it('should estimate ~3 chars per token (ceil)', () => {
		expect(estimateTokenCount('abc')).toBe(1);
		expect(estimateTokenCount('abcd')).toBe(2);
		expect(estimateTokenCount('')).toBe(0);
	});

	it('should return a positive integer for non-empty strings', () => {
		const result = estimateTokenCount('Hello, world!');
		expect(result).toBeGreaterThan(0);
		expect(Number.isInteger(result)).toBe(true);
	});
});

describe('persistToMemory', () => {
	describe('M1: Working Memory', () => {
		it('should push user turn with correct fields', async () => {
			const wm = makeWorkingMemory();
			const params = makeParams({ workingMemory: wm });

			await persistToMemory(params);

			expect(wm.pushTurn).toHaveBeenCalledTimes(2);
			const userTurn = (wm.pushTurn as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as Turn;
			expect(userTurn.role).toBe('user');
			expect(userTurn.content).toBe('Hello Axel');
			expect(userTurn.channelId).toBe('discord');
			expect(userTurn.turnId).toBe(2); // baseTurnId + 1
		});

		it('should push assistant turn with correct fields', async () => {
			const wm = makeWorkingMemory();
			const params = makeParams({ workingMemory: wm });

			await persistToMemory(params);

			const assistantTurn = (wm.pushTurn as ReturnType<typeof vi.fn>).mock.calls[1]?.[1] as Turn;
			expect(assistantTurn.role).toBe('assistant');
			expect(assistantTurn.content).toBe('Hi there!');
			expect(assistantTurn.turnId).toBe(3); // baseTurnId + 2
		});

		it('should not block M2 when M1 fails', async () => {
			const wm = makeWorkingMemory();
			(wm.pushTurn as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('PG down'));
			const em = makeEpisodicMemory();
			const params = makeParams({ workingMemory: wm, episodicMemory: em });

			await persistToMemory(params);

			// M2 should still be called even if M1 failed
			expect(em.addMessage).toHaveBeenCalledTimes(2);
		});
	});

	describe('M2: Episodic Memory', () => {
		it('should add user message with correct sessionId', async () => {
			const em = makeEpisodicMemory();
			const params = makeParams({ episodicMemory: em });

			await persistToMemory(params);

			expect(em.addMessage).toHaveBeenCalledTimes(2);
			const firstCall = (em.addMessage as ReturnType<typeof vi.fn>).mock.calls[0];
			expect(firstCall?.[0]).toBe('sess-1');
			expect(firstCall?.[1]).toEqual(
				expect.objectContaining({ role: 'user', content: 'Hello Axel' }),
			);
		});

		it('should add assistant message with correct sessionId', async () => {
			const em = makeEpisodicMemory();
			const params = makeParams({ episodicMemory: em });

			await persistToMemory(params);

			const secondCall = (em.addMessage as ReturnType<typeof vi.fn>).mock.calls[1];
			expect(secondCall?.[0]).toBe('sess-1');
			expect(secondCall?.[1]).toEqual(
				expect.objectContaining({ role: 'assistant', content: 'Hi there!' }),
			);
		});

		it('should not throw when M2 fails', async () => {
			const em = makeEpisodicMemory();
			(em.addMessage as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('PG down'));
			const params = makeParams({ episodicMemory: em });

			await expect(persistToMemory(params)).resolves.not.toThrow();
		});
	});

	describe('M3: Semantic Memory (fire-and-forget)', () => {
		it('should call semanticMemoryWriter when provided', async () => {
			const sw = makeSemanticWriter();
			const params = makeParams({ semanticMemoryWriter: sw });

			await persistToMemory(params);

			// Allow fire-and-forget promise to settle
			await new Promise((r) => setTimeout(r, 10));

			expect(sw.storeConversationMemory).toHaveBeenCalledWith({
				userContent: 'Hello Axel',
				assistantContent: 'Hi there!',
				channelId: 'discord',
				sessionId: 'sess-1',
			});
		});

		it('should not throw when semanticMemoryWriter is not provided', async () => {
			const params = makeParams();
			await expect(persistToMemory(params)).resolves.not.toThrow();
		});

		it('should not throw when semanticMemoryWriter fails', async () => {
			const sw = makeSemanticWriter();
			(sw.storeConversationMemory as ReturnType<typeof vi.fn>).mockRejectedValue(
				new Error('Embedding failed'),
			);
			const params = makeParams({ semanticMemoryWriter: sw });

			await expect(persistToMemory(params)).resolves.not.toThrow();
		});
	});

	describe('M4: Conceptual Memory (entity extraction)', () => {
		it('should extract entities and store them when both extractor and conceptualMemory provided', async () => {
			const ext = makeEntityExtractor();
			const cm = makeConceptualMemory();
			const params = makeParams({ entityExtractor: ext, conceptualMemory: cm });

			await persistToMemory(params);

			// Allow fire-and-forget promise to settle
			await new Promise((r) => setTimeout(r, 10));

			expect(ext.extract).toHaveBeenCalledWith('Hello Axel', 'Hi there!');
			expect(cm.addEntity).toHaveBeenCalledWith(
				expect.objectContaining({ name: 'TypeScript', entityType: 'technology' }),
			);
		});

		it('should increment mentions for existing entities instead of creating new ones', async () => {
			const ext = makeEntityExtractor();
			const cm = makeConceptualMemory();
			(cm.findEntity as ReturnType<typeof vi.fn>).mockResolvedValue({ entityId: 'existing-1' });
			const params = makeParams({ entityExtractor: ext, conceptualMemory: cm });

			await persistToMemory(params);
			await new Promise((r) => setTimeout(r, 10));

			expect(cm.incrementMentions).toHaveBeenCalledWith('existing-1');
			expect(cm.addEntity).not.toHaveBeenCalled();
		});

		it('should store relations between extracted entities', async () => {
			const ext: EntityExtractorLike = {
				extract: vi.fn().mockResolvedValue({
					entities: [
						{ name: 'TypeScript', type: 'language', properties: {} },
						{ name: 'Node.js', type: 'runtime', properties: {} },
					],
					relations: [{ source: 'TypeScript', target: 'Node.js', type: 'runs_on' }],
				}),
			};
			const cm = makeConceptualMemory();
			(cm.addEntity as ReturnType<typeof vi.fn>)
				.mockResolvedValueOnce('ent-ts')
				.mockResolvedValueOnce('ent-node');
			const params = makeParams({ entityExtractor: ext, conceptualMemory: cm });

			await persistToMemory(params);
			await new Promise((r) => setTimeout(r, 10));

			expect(cm.addRelation).toHaveBeenCalledWith({
				sourceId: 'ent-ts',
				targetId: 'ent-node',
				relationType: 'runs_on',
				weight: 1.0,
			});
		});

		it('should skip relations when source or target entity not found in map', async () => {
			const ext: EntityExtractorLike = {
				extract: vi.fn().mockResolvedValue({
					entities: [{ name: 'TypeScript', type: 'language', properties: {} }],
					relations: [{ source: 'TypeScript', target: 'Unknown', type: 'uses' }],
				}),
			};
			const cm = makeConceptualMemory();
			const params = makeParams({ entityExtractor: ext, conceptualMemory: cm });

			await persistToMemory(params);
			await new Promise((r) => setTimeout(r, 10));

			expect(cm.addRelation).not.toHaveBeenCalled();
		});

		it('should not call extraction when entityExtractor is not provided', async () => {
			const cm = makeConceptualMemory();
			const params = makeParams({ conceptualMemory: cm });

			await persistToMemory(params);
			await new Promise((r) => setTimeout(r, 10));

			expect(cm.addEntity).not.toHaveBeenCalled();
		});

		it('should not throw when entity extraction fails', async () => {
			const ext: EntityExtractorLike = {
				extract: vi.fn().mockRejectedValue(new Error('LLM failed')),
			};
			const cm = makeConceptualMemory();
			const params = makeParams({ entityExtractor: ext, conceptualMemory: cm });

			await expect(persistToMemory(params)).resolves.not.toThrow();
		});
	});

	describe('token count estimation', () => {
		it('should include non-negative integer tokenCount in M1 turns', async () => {
			const wm = makeWorkingMemory();
			const params = makeParams({ workingMemory: wm });

			await persistToMemory(params);

			const userTurn = (wm.pushTurn as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as Turn;
			expect(userTurn.tokenCount).toBeGreaterThanOrEqual(0);
			expect(Number.isInteger(userTurn.tokenCount)).toBe(true);
		});

		it('should include non-negative integer tokenCount in M2 messages', async () => {
			const em = makeEpisodicMemory();
			const params = makeParams({ episodicMemory: em });

			await persistToMemory(params);

			const userMsg = (em.addMessage as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as {
				tokenCount: number;
			};
			expect(userMsg.tokenCount).toBeGreaterThanOrEqual(0);
			expect(Number.isInteger(userMsg.tokenCount)).toBe(true);
		});
	});

	describe('independence of memory layers', () => {
		it('should persist to M2 even when M1 fails completely', async () => {
			const wm = makeWorkingMemory();
			(wm.pushTurn as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('M1 down'));
			const em = makeEpisodicMemory();
			const params = makeParams({ workingMemory: wm, episodicMemory: em });

			await persistToMemory(params);

			expect(em.addMessage).toHaveBeenCalledTimes(2);
		});

		it('should persist to M1 regardless of M2 state', async () => {
			const wm = makeWorkingMemory();
			const em = makeEpisodicMemory();
			(em.addMessage as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('M2 down'));
			const params = makeParams({ workingMemory: wm, episodicMemory: em });

			await persistToMemory(params);

			expect(wm.pushTurn).toHaveBeenCalledTimes(2);
		});
	});
});
