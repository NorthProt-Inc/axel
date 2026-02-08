import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccessPattern, HotMemory, MetaMemory } from '../../../core/src/memory/types.js';

// ─── Mock PG Pool ───

function createMockPool() {
	return {
		query: vi.fn(),
		connect: vi.fn(),
	};
}

// ─── Tests ───

describe('PgMetaMemory', () => {
	let mockPool: ReturnType<typeof createMockPool>;

	beforeEach(() => {
		mockPool = createMockPool();
		vi.clearAllMocks();
	});

	describe('implements MetaMemory interface', () => {
		it('should have layerName M5:meta', async () => {
			const { PgMetaMemory } = await import('../../src/db/index.js');
			const mem: MetaMemory = new PgMetaMemory(mockPool as any);
			expect(mem.layerName).toBe('M5:meta');
		});
	});

	describe('recordAccess()', () => {
		it('should insert an access pattern record', async () => {
			mockPool.query.mockResolvedValue({ rows: [], rowCount: 1 });

			const { PgMetaMemory } = await import('../../src/db/index.js');
			const mem: MetaMemory = new PgMetaMemory(mockPool as any);

			const pattern: AccessPattern = {
				queryText: 'TypeScript best practices',
				matchedMemoryIds: [1, 2, 3],
				relevanceScores: [0.95, 0.8, 0.7],
				channelId: 'discord',
			};

			await mem.recordAccess(pattern);

			const [sql, params] = mockPool.query.mock.calls[0] as [string, unknown[]];
			expect(sql).toContain('INSERT INTO memory_access_patterns');
			expect(params).toContain('TypeScript best practices');
			expect(params).toContain('discord');
		});
	});

	describe('getHotMemories()', () => {
		it('should return hot memories from the materialized view', async () => {
			mockPool.query.mockResolvedValue({
				rows: [
					{
						id: 1,
						uuid: 'mem-1',
						content: 'TypeScript facts',
						access_count: 50,
						channel_diversity: 3,
					},
					{
						id: 2,
						uuid: 'mem-2',
						content: 'pnpm tips',
						access_count: 30,
						channel_diversity: 2,
					},
				],
				rowCount: 2,
			});

			const { PgMetaMemory } = await import('../../src/db/index.js');
			const mem: MetaMemory = new PgMetaMemory(mockPool as any);

			const hotMems = await mem.getHotMemories(10);

			expect(hotMems).toHaveLength(2);
			expect(hotMems[0]?.memoryId).toBe(1);
			expect(hotMems[0]?.uuid).toBe('mem-1');
			expect(hotMems[0]?.accessCount).toBe(50);
			expect(hotMems[0]?.channelDiversity).toBe(3);

			const [sql] = mockPool.query.mock.calls[0] as [string, unknown[]];
			expect(sql).toContain('hot_memories');
		});
	});

	describe('getPrefetchCandidates()', () => {
		it('should return UUIDs of likely-needed memories', async () => {
			mockPool.query.mockResolvedValue({
				rows: [{ uuid: 'mem-1' }, { uuid: 'mem-2' }],
				rowCount: 2,
			});

			const { PgMetaMemory } = await import('../../src/db/index.js');
			const mem: MetaMemory = new PgMetaMemory(mockPool as any);

			const candidates = await mem.getPrefetchCandidates('user-1', 'discord');

			expect(candidates).toHaveLength(2);
			expect(candidates).toContain('mem-1');
			expect(candidates).toContain('mem-2');
		});
	});

	describe('refreshView()', () => {
		it('should refresh the hot_memories materialized view', async () => {
			mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

			const { PgMetaMemory } = await import('../../src/db/index.js');
			const mem: MetaMemory = new PgMetaMemory(mockPool as any);

			await mem.refreshView();

			const [sql] = mockPool.query.mock.calls[0] as [string, unknown[]];
			expect(sql).toContain('REFRESH MATERIALIZED VIEW');
			expect(sql).toContain('CONCURRENTLY');
		});
	});

	describe('pruneOldPatterns()', () => {
		it('should delete patterns older than specified days', async () => {
			mockPool.query.mockResolvedValue({ rows: [], rowCount: 15 });

			const { PgMetaMemory } = await import('../../src/db/index.js');
			const mem: MetaMemory = new PgMetaMemory(mockPool as any);

			const pruned = await mem.pruneOldPatterns(30);

			expect(pruned).toBe(15);
			const [sql, params] = mockPool.query.mock.calls[0] as [string, unknown[]];
			expect(sql).toContain('DELETE FROM memory_access_patterns');
			expect(params).toContain(30);
		});
	});

	describe('healthCheck()', () => {
		it('should return healthy when DB is accessible', async () => {
			mockPool.query.mockResolvedValue({
				rows: [{ count: '5' }],
				rowCount: 1,
			});

			const { PgMetaMemory } = await import('../../src/db/index.js');
			const mem: MetaMemory = new PgMetaMemory(mockPool as any);

			const health = await mem.healthCheck();
			expect(health.state).toBe('healthy');
		});

		it('should return unhealthy when DB is down', async () => {
			mockPool.query.mockRejectedValue(new Error('connection refused'));

			const { PgMetaMemory } = await import('../../src/db/index.js');
			const mem: MetaMemory = new PgMetaMemory(mockPool as any);

			const health = await mem.healthCheck();
			expect(health.state).toBe('unhealthy');
		});
	});
});
