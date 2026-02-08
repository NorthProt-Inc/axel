import { beforeEach, describe, expect, it } from 'vitest';
import { InMemorySemanticMemory } from '../../src/memory/semantic-memory.js';
import type { NewMemory, ScoredMemory, SemanticQuery } from '../../src/memory/types.js';
import type { Memory } from '../../src/types/memory.js';

describe('InMemorySemanticMemory', () => {
	let semantic: InMemorySemanticMemory;

	const makeEmbedding = (val: number): Float32Array => {
		const arr = new Float32Array(3072);
		arr[0] = val;
		return arr;
	};

	const makeNewMemory = (overrides?: Partial<NewMemory>): NewMemory => ({
		content: 'Test memory',
		memoryType: 'fact',
		importance: 0.5,
		embedding: makeEmbedding(0.9),
		sourceChannel: 'discord',
		...overrides,
	});

	beforeEach(() => {
		semantic = new InMemorySemanticMemory();
	});

	describe('layerName', () => {
		it('should be "M3:semantic"', () => {
			expect(semantic.layerName).toBe('M3:semantic');
		});
	});

	describe('store', () => {
		it('should return a uuid', async () => {
			const uuid = await semantic.store(makeNewMemory());
			expect(typeof uuid).toBe('string');
			expect(uuid.length).toBeGreaterThan(0);
		});
	});

	describe('search', () => {
		it('should return matching memories', async () => {
			await semantic.store(makeNewMemory({ content: 'User likes jazz' }));
			await semantic.store(makeNewMemory({ content: 'User likes rock' }));

			const query: SemanticQuery = {
				text: 'jazz',
				embedding: makeEmbedding(0.9),
				limit: 10,
			};

			const results = await semantic.search(query);
			expect(results.length).toBeGreaterThanOrEqual(1);
		});

		it('should respect limit', async () => {
			for (let i = 0; i < 10; i++) {
				await semantic.store(makeNewMemory({ content: `Memory ${i}` }));
			}

			const query: SemanticQuery = {
				text: 'memory',
				embedding: makeEmbedding(0.9),
				limit: 3,
			};

			const results = await semantic.search(query);
			expect(results.length).toBeLessThanOrEqual(3);
		});

		it('should filter by minImportance', async () => {
			await semantic.store(makeNewMemory({ importance: 0.1, content: 'Low importance' }));
			await semantic.store(makeNewMemory({ importance: 0.9, content: 'High importance' }));

			const query: SemanticQuery = {
				text: 'importance',
				embedding: makeEmbedding(0.9),
				limit: 10,
				minImportance: 0.5,
			};

			const results = await semantic.search(query);
			for (const r of results) {
				expect(r.memory.importance).toBeGreaterThanOrEqual(0.5);
			}
		});

		it('should filter by memoryTypes', async () => {
			await semantic.store(makeNewMemory({ memoryType: 'fact', content: 'A fact' }));
			await semantic.store(makeNewMemory({ memoryType: 'preference', content: 'A preference' }));

			const query: SemanticQuery = {
				text: 'something',
				embedding: makeEmbedding(0.9),
				limit: 10,
				memoryTypes: ['fact'],
			};

			const results = await semantic.search(query);
			for (const r of results) {
				expect(r.memory.memoryType).toBe('fact');
			}
		});

		it('should return ScoredMemory with all score fields', async () => {
			await semantic.store(makeNewMemory());

			const query: SemanticQuery = {
				text: 'test',
				embedding: makeEmbedding(0.9),
				limit: 10,
			};

			const results = await semantic.search(query);
			if (results.length > 0) {
				const result = results[0];
				expect(typeof result.vectorScore).toBe('number');
				expect(typeof result.textScore).toBe('number');
				expect(typeof result.finalScore).toBe('number');
			}
		});
	});

	describe('getByUuid', () => {
		it('should return stored memory by uuid', async () => {
			const uuid = await semantic.store(makeNewMemory({ content: 'Specific memory' }));
			const memory = await semantic.getByUuid(uuid);
			expect(memory).not.toBeNull();
			expect(memory?.content).toBe('Specific memory');
			expect(memory?.uuid).toBe(uuid);
		});

		it('should return null for non-existent uuid', async () => {
			const memory = await semantic.getByUuid('nonexistent');
			expect(memory).toBeNull();
		});
	});

	describe('updateAccess', () => {
		it('should increment accessCount and update lastAccessed', async () => {
			const uuid = await semantic.store(makeNewMemory());
			const before = await semantic.getByUuid(uuid);
			expect(before?.accessCount).toBe(0);

			await semantic.updateAccess(uuid);

			const after = await semantic.getByUuid(uuid);
			expect(after?.accessCount).toBe(1);
			expect(after?.lastAccessed.getTime()).toBeGreaterThanOrEqual(before?.lastAccessed.getTime());
		});
	});

	describe('delete', () => {
		it('should remove memory', async () => {
			const uuid = await semantic.store(makeNewMemory());
			await semantic.delete(uuid);

			const memory = await semantic.getByUuid(uuid);
			expect(memory).toBeNull();
		});
	});

	describe('search - additional branch coverage', () => {
		it('should filter by channelFilter', async () => {
			await semantic.store(makeNewMemory({ sourceChannel: 'discord', content: 'Discord msg' }));
			await semantic.store(makeNewMemory({ sourceChannel: 'telegram', content: 'Telegram msg' }));

			const query: SemanticQuery = {
				text: 'msg',
				embedding: makeEmbedding(0.9),
				limit: 10,
				channelFilter: 'telegram',
			};

			const results = await semantic.search(query);
			expect(results).toHaveLength(1);
			expect(results[0]?.memory.sourceChannel).toBe('telegram');
		});

		it('should not filter when channelFilter is undefined', async () => {
			await semantic.store(makeNewMemory({ sourceChannel: 'discord', content: 'A' }));
			await semantic.store(makeNewMemory({ sourceChannel: 'telegram', content: 'B' }));

			const query: SemanticQuery = {
				text: 'something',
				embedding: makeEmbedding(0.9),
				limit: 10,
			};

			const results = await semantic.search(query);
			expect(results).toHaveLength(2);
		});

		it('should handle empty memoryTypes array as no filter', async () => {
			await semantic.store(makeNewMemory({ memoryType: 'fact' }));
			await semantic.store(makeNewMemory({ memoryType: 'preference' }));

			const query: SemanticQuery = {
				text: 'something',
				embedding: makeEmbedding(0.9),
				limit: 10,
				memoryTypes: [],
			};

			const results = await semantic.search(query);
			expect(results).toHaveLength(2);
		});

		it('should compute cosine similarity with zero-norm embedding', async () => {
			await semantic.store(makeNewMemory({ content: 'Test' }));

			const zeroEmbed = new Float32Array(3072);
			const query: SemanticQuery = {
				text: 'test',
				embedding: zeroEmbed,
				limit: 10,
			};

			const results = await semantic.search(query);
			expect(results).toHaveLength(1);
			expect(results[0]?.vectorScore).toBe(0);
		});

		it('should handle mismatched embedding lengths', async () => {
			await semantic.store(makeNewMemory({ content: 'Test' }));

			const shortEmbed = new Float32Array(10);
			const query: SemanticQuery = {
				text: 'test',
				embedding: shortEmbed,
				limit: 10,
			};

			const results = await semantic.search(query);
			expect(results).toHaveLength(1);
			expect(results[0]?.vectorScore).toBe(0);
		});

		it('should handle text similarity with no word matches', async () => {
			await semantic.store(makeNewMemory({ content: 'TypeScript programming' }));

			const query: SemanticQuery = {
				text: 'jazz music',
				embedding: makeEmbedding(0.9),
				limit: 10,
			};

			const results = await semantic.search(query);
			expect(results).toHaveLength(1);
			expect(results[0]?.textScore).toBe(0);
		});

		it('should handle text similarity with empty query', async () => {
			await semantic.store(makeNewMemory({ content: 'Some content' }));

			const query: SemanticQuery = {
				text: '',
				embedding: makeEmbedding(0.9),
				limit: 10,
			};

			const results = await semantic.search(query);
			expect(results).toHaveLength(1);
		});
	});

	describe('decay', () => {
		it('should return decay result', async () => {
			await semantic.store(makeNewMemory({ importance: 0.1 }));
			await semantic.store(makeNewMemory({ importance: 0.9 }));

			const result = await semantic.decay({ threshold: 0.03 });
			expect(typeof result.processed).toBe('number');
			expect(typeof result.deleted).toBe('number');
			expect(typeof result.minImportance).toBe('number');
			expect(typeof result.maxImportance).toBe('number');
			expect(typeof result.avgImportance).toBe('number');
		});

		it('should delete memories below threshold', async () => {
			await semantic.store(makeNewMemory({ importance: 0.01 }));
			await semantic.store(makeNewMemory({ importance: 0.5 }));

			const result = await semantic.decay({ threshold: 0.05 });
			expect(result.deleted).toBe(1);
			expect(result.processed).toBe(2);
		});

		it('should return zeroes for empty memory store', async () => {
			const result = await semantic.decay({ threshold: 0.03 });
			expect(result.processed).toBe(0);
			expect(result.deleted).toBe(0);
			expect(result.minImportance).toBe(0);
			expect(result.maxImportance).toBe(0);
			expect(result.avgImportance).toBe(0);
		});
	});

	describe('updateAccess', () => {
		it('should no-op for non-existent uuid', async () => {
			await expect(semantic.updateAccess('nonexistent')).resolves.not.toThrow();
		});
	});

	describe('healthCheck', () => {
		it('should return healthy status', async () => {
			const health = await semantic.healthCheck();
			expect(health.state).toBe('healthy');
			expect(health.lastChecked).toBeInstanceOf(Date);
		});
	});
});
