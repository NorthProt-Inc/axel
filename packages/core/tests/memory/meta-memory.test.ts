import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryMetaMemory } from '../../src/memory/meta-memory.js';

describe('InMemoryMetaMemory', () => {
	let meta: InMemoryMetaMemory;

	beforeEach(() => {
		meta = new InMemoryMetaMemory();
	});

	describe('layerName', () => {
		it('should be "M5:meta"', () => {
			expect(meta.layerName).toBe('M5:meta');
		});
	});

	describe('recordAccess', () => {
		it('should record access pattern', async () => {
			await expect(
				meta.recordAccess({
					queryText: 'user music preferences',
					matchedMemoryIds: [1, 2, 3],
					relevanceScores: [0.95, 0.87, 0.72],
					channelId: 'discord-123',
				}),
			).resolves.not.toThrow();
		});
	});

	describe('getHotMemories', () => {
		it('should return hot memories based on access patterns', async () => {
			// Record multiple accesses to same memory
			for (let i = 0; i < 5; i++) {
				await meta.recordAccess({
					queryText: `query ${i}`,
					matchedMemoryIds: [42, 43],
					relevanceScores: [0.9, 0.8],
					channelId: 'discord',
				});
			}

			const hot = await meta.getHotMemories(10);
			expect(hot.length).toBeGreaterThanOrEqual(1);

			// Memory 42 should be hot (accessed 5 times)
			const mem42 = hot.find((h) => h.memoryId === 42);
			expect(mem42).toBeDefined();
			expect(mem42?.accessCount).toBe(5);
		});

		it('should respect limit', async () => {
			for (let i = 0; i < 20; i++) {
				await meta.recordAccess({
					queryText: `query ${i}`,
					matchedMemoryIds: [i],
					relevanceScores: [0.9],
					channelId: 'discord',
				});
			}

			const hot = await meta.getHotMemories(5);
			expect(hot.length).toBeLessThanOrEqual(5);
		});

		it('should return empty when no patterns recorded', async () => {
			const hot = await meta.getHotMemories(10);
			expect(hot).toHaveLength(0);
		});

		it('should track channel diversity', async () => {
			// Access from multiple channels
			await meta.recordAccess({
				queryText: 'query 1',
				matchedMemoryIds: [42],
				relevanceScores: [0.9],
				channelId: 'discord',
			});
			await meta.recordAccess({
				queryText: 'query 2',
				matchedMemoryIds: [42],
				relevanceScores: [0.9],
				channelId: 'telegram',
			});
			await meta.recordAccess({
				queryText: 'query 3',
				matchedMemoryIds: [42],
				relevanceScores: [0.9],
				channelId: 'cli',
			});

			const hot = await meta.getHotMemories(10);
			const mem42 = hot.find((h) => h.memoryId === 42);
			expect(mem42).toBeDefined();
			expect(mem42?.channelDiversity).toBe(3);
		});
	});

	describe('getPrefetchCandidates', () => {
		it('should return memory IDs for prefetch', async () => {
			await meta.recordAccess({
				queryText: 'music taste',
				matchedMemoryIds: [10, 20, 30],
				relevanceScores: [0.95, 0.85, 0.75],
				channelId: 'discord',
			});

			const candidates = await meta.getPrefetchCandidates('user-1', 'discord');
			expect(Array.isArray(candidates)).toBe(true);
		});

		it('should return empty array when no data', async () => {
			const candidates = await meta.getPrefetchCandidates('user-1', 'discord');
			expect(candidates).toHaveLength(0);
		});
	});

	describe('refreshView', () => {
		it('should not throw (simulates MV refresh)', async () => {
			await expect(meta.refreshView()).resolves.not.toThrow();
		});
	});

	describe('pruneOldPatterns', () => {
		it('should return number of pruned patterns', async () => {
			await meta.recordAccess({
				queryText: 'old query',
				matchedMemoryIds: [1],
				relevanceScores: [0.5],
				channelId: 'discord',
			});

			const pruned = await meta.pruneOldPatterns(7);
			expect(typeof pruned).toBe('number');
			expect(pruned).toBeGreaterThanOrEqual(0);
		});
	});

	describe('healthCheck', () => {
		it('should return healthy status', async () => {
			const health = await meta.healthCheck();
			expect(health.state).toBe('healthy');
			expect(health.lastChecked).toBeInstanceOf(Date);
		});
	});
});
