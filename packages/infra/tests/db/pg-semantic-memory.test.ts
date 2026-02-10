import type {
	DecayResult,
	NewMemory,
	ScoredMemory,
	SemanticMemory,
	SemanticQuery,
} from '@axel/core/memory';
import type { Memory, MemoryType } from '@axel/core/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
				embedding: makeFakeEmbedding(1536),
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

			const params = mockPool.query.mock.calls[0]?.[1] as unknown[];
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
				embedding: makeFakeEmbedding(1536),
				limit: 10,
			};

			const results = await mem.search(query);

			expect(results).toHaveLength(1);
			expect(results[0]?.memory.uuid).toBe('mem-1');
			expect(results[0]?.vectorScore).toBeCloseTo(0.95);
			expect(results[0]?.finalScore).toBeCloseTo(0.7 * 0.95 + 0.3 * 0.7);
		});

		it('should apply minImportance filter', async () => {
			mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

			const { PgSemanticMemory } = await import('../../src/db/index.js');
			const mem: SemanticMemory = new PgSemanticMemory(mockPool as any);

			const query: SemanticQuery = {
				text: 'test',
				embedding: makeFakeEmbedding(1536),
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
				embedding: makeFakeEmbedding(1536),
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
				embedding: makeFakeEmbedding(1536),
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
				embedding: makeFakeEmbedding(1536),
				limit: 10,
				hybridSearch: true,
			});

			expect(results[0]?.finalScore).toBeCloseTo(0.7 * 0.8 + 0.3 * 0.6);
		});
	});

	describe('decay()', () => {
		it('legacy mode: deletes below threshold without decay calculation', async () => {
			mockPool.query
				.mockResolvedValueOnce({
					rows: [{ cnt: '4' }],
					rowCount: 1,
				})
				.mockResolvedValueOnce({
					rows: [],
					rowCount: 2,
				});

			const { PgSemanticMemory } = await import('../../src/db/index.js');
			const mem: SemanticMemory = new PgSemanticMemory(mockPool as any);

			const result: DecayResult = await mem.decay({ threshold: 0.5 });

			expect(result.processed).toBe(4);
			expect(result.deleted).toBe(2);
		});

		it('with decayConfig: applies decay calculation and updates importance', async () => {
			const now = new Date();
			const oneHourAgo = new Date(now.getTime() - 3_600_000);
			mockPool.query
				.mockResolvedValueOnce({
					rows: [
						{
							uuid: 'mem-1',
							importance: 0.8,
							memory_type: 'fact',
							created_at: oneHourAgo,
							last_accessed: now,
							access_count: 3,
							channel_mentions: { cli: 1, discord: 1 },
						},
						{
							uuid: 'mem-2',
							importance: 0.02,
							memory_type: 'conversation',
							created_at: oneHourAgo,
							last_accessed: oneHourAgo,
							access_count: 1,
							channel_mentions: null,
						},
					],
					rowCount: 2,
				})
				// Batch DELETE + batch UPDATE
				.mockResolvedValue({ rows: [], rowCount: 1 });

			const { PgSemanticMemory } = await import('../../src/db/index.js');
			const mem: SemanticMemory = new PgSemanticMemory(mockPool as any);

			const { DEFAULT_DECAY_CONFIG } = await import('@axel/core/decay');
			const result: DecayResult = await mem.decay({
				threshold: DEFAULT_DECAY_CONFIG.deleteThreshold,
				decayConfig: DEFAULT_DECAY_CONFIG,
			});

			expect(result.processed).toBe(2);
			// mem-2 with importance 0.02 will decay further and get deleted
			expect(result.deleted).toBeGreaterThanOrEqual(1);

			// Verify batch pattern: 1 SELECT + at most 1 DELETE + 1 UPDATE = max 3 queries
			const totalQueries = mockPool.query.mock.calls.length;
			expect(totalQueries).toBeLessThanOrEqual(3);

			// Verify batch SQL patterns (no individual WHERE uuid = $1)
			const sqls = mockPool.query.mock.calls.map((c: unknown[]) => c[0] as string);
			const hasAnyDelete = sqls.some((s: string) => s.includes('ANY($1::uuid[])'));
			const hasUnnestUpdate = sqls.some((s: string) => s.includes('unnest'));
			// At least one of them should be present (delete or update happened)
			expect(hasAnyDelete || hasUnnestUpdate).toBe(true);
		});

		it('with decayConfig: returns zeros for empty table', async () => {
			mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

			const { PgSemanticMemory } = await import('../../src/db/index.js');
			const mem: SemanticMemory = new PgSemanticMemory(mockPool as any);

			const { DEFAULT_DECAY_CONFIG } = await import('@axel/core/decay');
			const result = await mem.decay({
				threshold: DEFAULT_DECAY_CONFIG.deleteThreshold,
				decayConfig: DEFAULT_DECAY_CONFIG,
			});

			expect(result.processed).toBe(0);
			expect(result.deleted).toBe(0);
		});

		it('PERF-C3: 100+ rows decay uses at most 3 queries (SELECT + batch DELETE + batch UPDATE)', async () => {
			const now = new Date();
			const twoHoursAgo = new Date(now.getTime() - 7_200_000);
			const rowCount = 120;

			// Generate 120 rows: half with high importance (survive), half with very low (deleted)
			const rows = Array.from({ length: rowCount }, (_, i) => ({
				uuid: `mem-${i}`,
				importance: i < 60 ? 0.01 : 0.9, // first 60 will be deleted, last 60 updated
				memory_type: 'fact',
				created_at: twoHoursAgo,
				last_accessed: i < 60 ? twoHoursAgo : now,
				access_count: i < 60 ? 1 : 5,
				channel_mentions: null,
			}));

			mockPool.query
				.mockResolvedValueOnce({ rows, rowCount }) // SELECT load
				.mockResolvedValue({ rows: [], rowCount: 0 }); // batch DELETE + batch UPDATE

			const { PgSemanticMemory } = await import('../../src/db/index.js');
			const mem: SemanticMemory = new PgSemanticMemory(mockPool as any);

			const { DEFAULT_DECAY_CONFIG } = await import('@axel/core/decay');
			const result: DecayResult = await mem.decay({
				threshold: DEFAULT_DECAY_CONFIG.deleteThreshold,
				decayConfig: DEFAULT_DECAY_CONFIG,
			});

			// ── Query count assertion ──
			const totalQueries = mockPool.query.mock.calls.length;
			expect(totalQueries).toBeLessThanOrEqual(3); // 1 SELECT + 1 DELETE + 1 UPDATE

			// ── Stats correctness ──
			expect(result.processed).toBe(rowCount);
			expect(result.deleted).toBeGreaterThanOrEqual(1);
			const surviving = result.processed - result.deleted;
			expect(surviving).toBeGreaterThanOrEqual(1);
			expect(result.minImportance).toBeGreaterThan(0);
			expect(result.maxImportance).toBeGreaterThanOrEqual(result.minImportance);
			expect(result.avgImportance).toBeGreaterThan(0);
			// Allow floating-point tolerance (avg may differ from min/max by rounding)
			expect(result.avgImportance).toBeLessThanOrEqual(result.maxImportance + 1e-10);
			expect(result.avgImportance).toBeGreaterThanOrEqual(result.minImportance - 1e-10);

			// ── Batch SQL verification ──
			const sqls = mockPool.query.mock.calls.map((c: unknown[]) => c[0] as string);
			const deleteQuery = sqls.find((s: string) => s.includes('DELETE') && s.includes('ANY'));
			const updateQuery = sqls.find((s: string) => s.includes('unnest'));
			expect(deleteQuery).toContain('ANY($1::uuid[])');
			expect(updateQuery).toContain('unnest($1::uuid[])');
			expect(updateQuery).toContain('unnest($2::float8[])');

			// ── No individual per-row queries ──
			const perRowQueries = sqls.filter(
				(s: string) =>
					(s.includes('DELETE') || s.includes('UPDATE')) &&
					s.includes('WHERE uuid = $1') &&
					!s.includes('ANY'),
			);
			expect(perRowQueries).toHaveLength(0);
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
			expect(result?.uuid).toBe('mem-1');
			expect(result?.content).toBe('test content');
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
