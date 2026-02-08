import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Memory, MemoryType } from '@axel/core/types';
import type {
	SemanticMemory,
	NewMemory,
	SemanticQuery,
	ScoredMemory,
	DecayResult,
} from '@axel/core/memory';

// ─── Mock PG Pool ───

function createMockPool() {
	return {
		query: vi.fn(),
		connect: vi.fn(),
	};
}

function makeFakeEmbedding(dim: number): Float32Array {
	const arr = new Float32Array(dim);
	for (let i = 0; i < dim; i++) {
		arr[i] = Math.random() * 2 - 1;
	}
	return arr;
}

// ─── Tests ───

describe('PgSemanticMemory', () => {
	let mockPool: ReturnType<typeof createMockPool>;

	beforeEach(() => {
		mockPool = createMockPool();
		vi.clearAllMocks();
	});

	describe('implements SemanticMemory interface', () => {
		it('should have layerName M3:semantic', async () => {
			const { PgSemanticMemory } = await import('../../src/db/index.js');
			const mem: SemanticMemory = new PgSemanticMemory(mockPool as any);
			expect(mem.layerName).toBe('M3:semantic');
		});
	});

	describe('store()', () => {
		it('should insert a memory and return UUID', async () => {
			mockPool.query.mockResolvedValue({
				rows: [{ uuid: 'mem-uuid-1' }],
				rowCount: 1,
			});

			const { PgSemanticMemory } = await import('../../src/db/index.js');
			const mem: SemanticMemory = new PgSemanticMemory(mockPool as any);

			const newMem: NewMemory = {
				content: 'User prefers TypeScript',
				memoryType: 'preference',
				importance: 0.8,
				embedding: makeFakeEmbedding(3072),
				sourceChannel: 'discord',
				sourceSession: 'sess-1',
			};

			const uuid = await mem.store(newMem);

			expect(typeof uuid).toBe('string');
			expect(uuid.length).toBeGreaterThan(0);
			const [sql, params] = mockPool.query.mock.calls[0] as [string, unknown[]];
			expect(sql).toContain('INSERT INTO memories');
			expect(params).toContain('User prefers TypeScript');
			expect(params).toContain('preference');
		});

		it('should encode Float32Array embedding as pgvector format', async () => {
			mockPool.query.mockResolvedValue({
				rows: [{ uuid: 'mem-uuid-2' }],
				rowCount: 1,
			});

			const { PgSemanticMemory } = await import('../../src/db/index.js');
			const mem: SemanticMemory = new PgSemanticMemory(mockPool as any);

			const embedding = new Float32Array([0.1, 0.2, 0.3]);
			const newMem: NewMemory = {
				content: 'test',
				memoryType: 'fact',
				importance: 0.5,
				embedding,
				sourceChannel: null,
			};

			await mem.store(newMem);

			const params = mockPool.query.mock.calls[0]![1] as unknown[];
			// The embedding should be serialized as a pgvector string like '[0.1,0.2,0.3]'
			const embeddingParam = params.find(
				(p) => typeof p === 'string' && (p as string).startsWith('['),
			);
			expect(embeddingParam).toBeDefined();
		});
	});

	describe('search()', () => {
		it('should perform vector similarity search with scoring', async () => {
			const now = new Date();
			mockPool.query.mockResolvedValue({
				rows: [
					{
						uuid: 'mem-1',
						content: 'User likes TypeScript',
						memory_type: 'preference',
						importance: 0.8,
						embedding: '[0.1,0.2,0.3]',
						created_at: now,
						last_accessed: now,
						access_count: 5,
						source_channel: 'discord',
						channel_mentions: {},
						source_session: null,
						decayed_importance: null,
						last_decayed_at: null,
						vector_score: 0.95,
						text_score: 0.7,
					},
				],
				rowCount: 1,
			});

			const { PgSemanticMemory } = await import('../../src/db/index.js');
			const mem: SemanticMemory = new PgSemanticMemory(mockPool as any);

			const query: SemanticQuery = {
				text: 'TypeScript preference',
				embedding: makeFakeEmbedding(3072),
				limit: 10,
			};

			const results = await mem.search(query);

			expect(results).toHaveLength(1);
			expect(results[0]!.memory.uuid).toBe('mem-1');
			expect(results[0]!.vectorScore).toBeCloseTo(0.95);
			expect(results[0]!.finalScore).toBeCloseTo(0.7 * 0.95 + 0.3 * 0.7);
		});

		it('should apply minImportance filter', async () => {
			mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

			const { PgSemanticMemory } = await import('../../src/db/index.js');
			const mem: SemanticMemory = new PgSemanticMemory(mockPool as any);

			const query: SemanticQuery = {
				text: 'test',
				embedding: makeFakeEmbedding(3072),
				limit: 10,
				minImportance: 0.5,
			};

			await mem.search(query);

			const [sql] = mockPool.query.mock.calls[0] as [string, unknown[]];
			expect(sql).toContain('importance');
		});

		it('should apply memoryType filter', async () => {
			mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

			const { PgSemanticMemory } = await import('../../src/db/index.js');
			const mem: SemanticMemory = new PgSemanticMemory(mockPool as any);

			const query: SemanticQuery = {
				text: 'test',
				embedding: makeFakeEmbedding(3072),
				limit: 10,
				memoryTypes: ['fact', 'preference'] as readonly MemoryType[],
			};

			await mem.search(query);

			const [sql] = mockPool.query.mock.calls[0] as [string, unknown[]];
			expect(sql).toContain('memory_type');
		});

		it('should apply channel filter', async () => {
			mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

			const { PgSemanticMemory } = await import('../../src/db/index.js');
			const mem: SemanticMemory = new PgSemanticMemory(mockPool as any);

			const query: SemanticQuery = {
				text: 'test',
				embedding: makeFakeEmbedding(3072),
				limit: 5,
				channelFilter: 'discord',
			};

			await mem.search(query);

			const [sql, params] = mockPool.query.mock.calls[0] as [string, unknown[]];
			expect(sql).toContain('source_channel');
			expect(params).toContain('discord');
		});

		it('should use hybrid scoring (0.7 vector + 0.3 text)', async () => {
			const now = new Date();
			mockPool.query.mockResolvedValue({
				rows: [
					{
						uuid: 'mem-1',
						content: 'test content',
						memory_type: 'fact',
						importance: 0.5,
						embedding: '[0.1]',
						created_at: now,
						last_accessed: now,
						access_count: 1,
						source_channel: null,
						channel_mentions: {},
						source_session: null,
						decayed_importance: null,
						last_decayed_at: null,
						vector_score: 0.8,
						text_score: 0.6,
					},
				],
				rowCount: 1,
			});

			const { PgSemanticMemory } = await import('../../src/db/index.js');
			const mem: SemanticMemory = new PgSemanticMemory(mockPool as any);

			const results = await mem.search({
				text: 'test',
				embedding: makeFakeEmbedding(3072),
				limit: 10,
				hybridSearch: true,
			});

			expect(results[0]!.finalScore).toBeCloseTo(0.7 * 0.8 + 0.3 * 0.6);
		});
	});

	describe('decay()', () => {
		it('should process and delete low-importance memories', async () => {
			// First query: get all memories for processing
			// Second query: delete below threshold
			mockPool.query
				.mockResolvedValueOnce({
					rows: [
						{ importance: 0.1 },
						{ importance: 0.3 },
						{ importance: 0.6 },
						{ importance: 0.8 },
					],
					rowCount: 4,
				})
				.mockResolvedValueOnce({
					rows: [],
					rowCount: 2, // 2 deleted (0.1 and 0.3 < threshold 0.5)
				});

			const { PgSemanticMemory } = await import('../../src/db/index.js');
			const mem: SemanticMemory = new PgSemanticMemory(mockPool as any);

			const result: DecayResult = await mem.decay({ threshold: 0.5 });

			expect(result.processed).toBe(4);
			expect(result.deleted).toBe(2);
			expect(result.minImportance).toBeCloseTo(0.1);
			expect(result.maxImportance).toBeCloseTo(0.8);
		});
	});

	describe('delete()', () => {
		it('should delete a memory by UUID', async () => {
			mockPool.query.mockResolvedValue({ rows: [], rowCount: 1 });

			const { PgSemanticMemory } = await import('../../src/db/index.js');
			const mem: SemanticMemory = new PgSemanticMemory(mockPool as any);

			await mem.delete('mem-uuid-1');

			const [sql, params] = mockPool.query.mock.calls[0] as [string, unknown[]];
			expect(sql).toContain('DELETE FROM memories');
			expect(params).toContain('mem-uuid-1');
		});
	});

	describe('getByUuid()', () => {
		it('should return a memory by UUID', async () => {
			const now = new Date();
			mockPool.query.mockResolvedValue({
				rows: [
					{
						uuid: 'mem-1',
						content: 'test content',
						memory_type: 'fact',
						importance: 0.5,
						embedding: '[0.1,0.2]',
						created_at: now,
						last_accessed: now,
						access_count: 1,
						source_channel: null,
						channel_mentions: {},
						source_session: null,
						decayed_importance: null,
						last_decayed_at: null,
					},
				],
				rowCount: 1,
			});

			const { PgSemanticMemory } = await import('../../src/db/index.js');
			const mem: SemanticMemory = new PgSemanticMemory(mockPool as any);

			const result = await mem.getByUuid('mem-1');

			expect(result).not.toBeNull();
			expect(result!.uuid).toBe('mem-1');
			expect(result!.content).toBe('test content');
		});

		it('should return null for unknown UUID', async () => {
			mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

			const { PgSemanticMemory } = await import('../../src/db/index.js');
			const mem: SemanticMemory = new PgSemanticMemory(mockPool as any);

			const result = await mem.getByUuid('nonexistent');
			expect(result).toBeNull();
		});
	});

	describe('updateAccess()', () => {
		it('should increment access count and update last_accessed', async () => {
			mockPool.query.mockResolvedValue({ rows: [], rowCount: 1 });

			const { PgSemanticMemory } = await import('../../src/db/index.js');
			const mem: SemanticMemory = new PgSemanticMemory(mockPool as any);

			await mem.updateAccess('mem-1');

			const [sql, params] = mockPool.query.mock.calls[0] as [string, unknown[]];
			expect(sql).toContain('UPDATE memories');
			expect(sql).toContain('access_count');
			expect(sql).toContain('last_accessed');
			expect(params).toContain('mem-1');
		});
	});

	describe('healthCheck()', () => {
		it('should return healthy when DB is accessible', async () => {
			mockPool.query.mockResolvedValue({
				rows: [{ count: '50' }],
				rowCount: 1,
			});

			const { PgSemanticMemory } = await import('../../src/db/index.js');
			const mem: SemanticMemory = new PgSemanticMemory(mockPool as any);

			const health = await mem.healthCheck();
			expect(health.state).toBe('healthy');
		});

		it('should return unhealthy on DB failure', async () => {
			mockPool.query.mockRejectedValue(new Error('connection refused'));

			const { PgSemanticMemory } = await import('../../src/db/index.js');
			const mem: SemanticMemory = new PgSemanticMemory(mockPool as any);

			const health = await mem.healthCheck();
			expect(health.state).toBe('unhealthy');
		});
	});
});
