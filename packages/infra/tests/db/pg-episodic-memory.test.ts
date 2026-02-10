import type {
	CreateSessionParams,
	EpisodicMemory,
	MessageRecord,
	NewEntity,
} from '@axel/core/memory';
import type { SessionSummary } from '@axel/core/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mock PG Pool ───

function createMockPool() {
	return {
		query: vi.fn(),
		connect: vi.fn(),
	};
}

// ─── Tests ───

describe('PgEpisodicMemory', () => {
	let mockPool: ReturnType<typeof createMockPool>;

	beforeEach(() => {
		mockPool = createMockPool();
		vi.clearAllMocks();
	});

	describe('implements EpisodicMemory interface', () => {
		it('should have layerName M2:episodic', async () => {
			const { PgEpisodicMemory } = await import('../../src/db/index.js');
			const mem: EpisodicMemory = new PgEpisodicMemory(mockPool as any);
			expect(mem.layerName).toBe('M2:episodic');
		});
	});

	describe('createSession()', () => {
		it('should insert a session and return the session ID', async () => {
			mockPool.query.mockResolvedValue({
				rows: [{ session_id: 'sess-abc123' }],
				rowCount: 1,
			});

			const { PgEpisodicMemory } = await import('../../src/db/index.js');
			const mem: EpisodicMemory = new PgEpisodicMemory(mockPool as any);

			const params: CreateSessionParams = {
				userId: 'user-1',
				channelId: 'discord',
				metadata: { source: 'test' },
			};

			const sessionId = await mem.createSession(params);

			expect(typeof sessionId).toBe('string');
			expect(sessionId.length).toBeGreaterThan(0);
			expect(mockPool.query).toHaveBeenCalledTimes(1);
			const [sql, sqlParams] = mockPool.query.mock.calls[0] as [string, unknown[]];
			expect(sql).toContain('INSERT INTO sessions');
			expect(sqlParams).toContain('user-1');
			expect(sqlParams).toContain('discord');
		});
	});

	describe('endSession()', () => {
		it('should update session with summary and end time', async () => {
			mockPool.query.mockResolvedValue({ rows: [], rowCount: 1 });

			const { PgEpisodicMemory } = await import('../../src/db/index.js');
			const mem: EpisodicMemory = new PgEpisodicMemory(mockPool as any);

			await mem.endSession('sess-1', 'Great conversation about TypeScript');

			expect(mockPool.query).toHaveBeenCalledTimes(1);
			const [sql, params] = mockPool.query.mock.calls[0] as [string, unknown[]];
			expect(sql).toContain('UPDATE sessions');
			expect(params).toContain('sess-1');
			expect(params).toContain('Great conversation about TypeScript');
		});

		it('should throw if session not found', async () => {
			mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

			const { PgEpisodicMemory } = await import('../../src/db/index.js');
			const mem: EpisodicMemory = new PgEpisodicMemory(mockPool as any);

			await expect(mem.endSession('nonexistent', 'summary')).rejects.toThrow(/not found/i);
		});
	});

	describe('addMessage()', () => {
		it('should insert a message record', async () => {
			mockPool.query.mockResolvedValue({ rows: [], rowCount: 1 });

			const { PgEpisodicMemory } = await import('../../src/db/index.js');
			const mem: EpisodicMemory = new PgEpisodicMemory(mockPool as any);

			const message: MessageRecord = {
				role: 'user',
				content: 'Hello, Axel!',
				channelId: 'discord',
				timestamp: new Date('2026-02-08T10:00:00Z'),
				tokenCount: 5,
			};

			await mem.addMessage('sess-1', message);

			expect(mockPool.query).toHaveBeenCalled();
			const [sql] = mockPool.query.mock.calls[0] as [string, unknown[]];
			expect(sql).toContain('INSERT INTO messages');
		});

		it('should increment turn_count on the session', async () => {
			// Two queries: insert message + update turn_count
			mockPool.query.mockResolvedValue({ rows: [], rowCount: 1 });

			const { PgEpisodicMemory } = await import('../../src/db/index.js');
			const mem: EpisodicMemory = new PgEpisodicMemory(mockPool as any);

			const message: MessageRecord = {
				role: 'assistant',
				content: 'Hi there!',
				channelId: 'discord',
				timestamp: new Date('2026-02-08T10:00:01Z'),
				tokenCount: 3,
			};

			await mem.addMessage('sess-1', message);

			// Should have either a single query that also updates turn_count
			// or two separate queries
			const allCalls = mockPool.query.mock.calls;
			const allSql = allCalls.map((c: unknown[]) => c[0] as string).join(' ');
			expect(allSql).toContain('messages');
		});
	});

	describe('getRecentSessions()', () => {
		it('should return recent completed sessions for a user', async () => {
			const now = new Date();
			mockPool.query.mockResolvedValue({
				rows: [
					{
						session_id: 'sess-1',
						summary: 'Discussed TypeScript',
						key_topics: ['typescript', 'testing'],
						emotional_tone: 'positive',
						turn_count: 10,
						channel_id: 'discord',
						started_at: now,
						ended_at: now,
					},
				],
				rowCount: 1,
			});

			const { PgEpisodicMemory } = await import('../../src/db/index.js');
			const mem: EpisodicMemory = new PgEpisodicMemory(mockPool as any);

			const sessions = await mem.getRecentSessions('user-1', 5);

			expect(sessions).toHaveLength(1);
			expect(sessions[0]?.sessionId).toBe('sess-1');
			expect(sessions[0]?.summary).toBe('Discussed TypeScript');

			const [sql, params] = mockPool.query.mock.calls[0] as [string, unknown[]];
			expect(sql).toContain('WHERE');
			expect(params).toContain('user-1');
			expect(params).toContain(5);
		});

		it('should return empty array for user with no sessions', async () => {
			mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

			const { PgEpisodicMemory } = await import('../../src/db/index.js');
			const mem: EpisodicMemory = new PgEpisodicMemory(mockPool as any);

			const sessions = await mem.getRecentSessions('unknown-user', 5);
			expect(sessions).toEqual([]);
		});
	});

	describe('searchByTopic()', () => {
		it('should search sessions by topic using text matching', async () => {
			mockPool.query.mockResolvedValue({
				rows: [
					{
						session_id: 'sess-2',
						summary: 'Talked about TypeScript patterns',
						key_topics: ['typescript'],
						emotional_tone: 'neutral',
						turn_count: 5,
						channel_id: 'cli',
						started_at: new Date(),
						ended_at: new Date(),
					},
				],
				rowCount: 1,
			});

			const { PgEpisodicMemory } = await import('../../src/db/index.js');
			const mem: EpisodicMemory = new PgEpisodicMemory(mockPool as any);

			const results = await mem.searchByTopic('typescript', 10);

			expect(results).toHaveLength(1);
			expect(mockPool.query).toHaveBeenCalledTimes(1);
		});
	});

	describe('searchByContent()', () => {
		it('should search messages by content using trigram matching', async () => {
			mockPool.query.mockResolvedValue({
				rows: [
					{
						role: 'user',
						content: 'How do I use pgvector?',
						channel_id: 'discord',
						timestamp: new Date(),
						token_count: 8,
					},
				],
				rowCount: 1,
			});

			const { PgEpisodicMemory } = await import('../../src/db/index.js');
			const mem: EpisodicMemory = new PgEpisodicMemory(mockPool as any);

			const results = await mem.searchByContent('pgvector', 5);

			expect(results).toHaveLength(1);
			expect(results[0]?.content).toContain('pgvector');
		});
	});

	describe('healthCheck()', () => {
		it('should return healthy when DB query succeeds', async () => {
			mockPool.query.mockResolvedValue({ rows: [{ count: '10' }], rowCount: 1 });

			const { PgEpisodicMemory } = await import('../../src/db/index.js');
			const mem: EpisodicMemory = new PgEpisodicMemory(mockPool as any);

			const health = await mem.healthCheck();

			expect(health.state).toBe('healthy');
		});

		it('should return unhealthy when DB query fails', async () => {
			mockPool.query.mockRejectedValue(new Error('connection refused'));

			const { PgEpisodicMemory } = await import('../../src/db/index.js');
			const mem: EpisodicMemory = new PgEpisodicMemory(mockPool as any);

			const health = await mem.healthCheck();

			expect(health.state).toBe('unhealthy');
		});
	});

	// ─── PERF-M3: Batch message INSERT ───

	describe('addMessages() — PERF-M3', () => {
		it('should no-op for empty array', async () => {
			const { PgEpisodicMemory } = await import('../../src/db/index.js');
			const mem = new PgEpisodicMemory(mockPool as any);

			await mem.addMessages('sess-1', []);

			expect(mockPool.query).not.toHaveBeenCalled();
		});

		it('should delegate to addMessage for a single message', async () => {
			mockPool.query.mockResolvedValue({ rows: [], rowCount: 1 });

			const { PgEpisodicMemory } = await import('../../src/db/index.js');
			const mem = new PgEpisodicMemory(mockPool as any);

			const message: MessageRecord = {
				role: 'user',
				content: 'Single message',
				channelId: 'discord',
				timestamp: new Date('2026-02-08T10:00:00Z'),
				tokenCount: 3,
			};

			await mem.addMessages('sess-1', [message]);

			// addMessage uses subquery for turn_id, so the INSERT SQL should contain the subquery
			const [sql] = mockPool.query.mock.calls[0] as [string, unknown[]];
			expect(sql).toContain('INSERT INTO messages');
			expect(sql).toContain('COALESCE(MAX(turn_id)');
		});

		it('should batch INSERT 10+ messages in a single query', async () => {
			// Mock: first call = SELECT max turn_id, second = batch INSERT, third = UPDATE turn_count
			mockPool.query
				.mockResolvedValueOnce({ rows: [{ max_turn: 0 }], rowCount: 1 }) // max turn_id
				.mockResolvedValueOnce({ rows: [], rowCount: 12 }) // batch INSERT
				.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // UPDATE turn_count

			const { PgEpisodicMemory } = await import('../../src/db/index.js');
			const mem = new PgEpisodicMemory(mockPool as any);

			const messages: MessageRecord[] = Array.from({ length: 12 }, (_, i) => ({
				role: 'user' as const,
				content: `Message ${i + 1}`,
				channelId: 'discord',
				timestamp: new Date(`2026-02-08T10:00:${String(i).padStart(2, '0')}Z`),
				tokenCount: 5 + i,
			}));

			await mem.addMessages('sess-batch', messages);

			// Exactly 3 queries: SELECT max, batch INSERT, UPDATE turn_count
			expect(mockPool.query).toHaveBeenCalledTimes(3);

			// Query 1: SELECT max turn_id
			const [sql1] = mockPool.query.mock.calls[0] as [string, unknown[]];
			expect(sql1).toContain('MAX(turn_id)');

			// Query 2: multi-row INSERT with 12 value tuples
			const [sql2, params2] = mockPool.query.mock.calls[1] as [string, unknown[]];
			expect(sql2).toContain('INSERT INTO messages');
			// 12 messages x 7 params each = 84 params
			expect(params2).toHaveLength(84);
			// Should contain all 12 VALUE tuples
			const valueCount = (sql2.match(/\(/g) ?? []).length;
			// 12 value tuples + opening paren in column list
			expect(valueCount).toBeGreaterThanOrEqual(12);

			// Query 3: UPDATE turn_count by 12
			const [sql3, params3] = mockPool.query.mock.calls[2] as [string, unknown[]];
			expect(sql3).toContain('UPDATE sessions');
			expect(sql3).toContain('turn_count');
			expect(params3).toContain(12);
		});

		it('should assign sequential turn_ids starting from max+1', async () => {
			// Existing max turn_id is 5
			mockPool.query
				.mockResolvedValueOnce({ rows: [{ max_turn: 5 }], rowCount: 1 })
				.mockResolvedValueOnce({ rows: [], rowCount: 3 })
				.mockResolvedValueOnce({ rows: [], rowCount: 1 });

			const { PgEpisodicMemory } = await import('../../src/db/index.js');
			const mem = new PgEpisodicMemory(mockPool as any);

			const messages: MessageRecord[] = [
				{ role: 'user', content: 'A', channelId: 'discord', timestamp: new Date(), tokenCount: 1 },
				{ role: 'assistant', content: 'B', channelId: 'discord', timestamp: new Date(), tokenCount: 2 },
				{ role: 'user', content: 'C', channelId: 'discord', timestamp: new Date(), tokenCount: 3 },
			];

			await mem.addMessages('sess-1', messages);

			const [, params2] = mockPool.query.mock.calls[1] as [string, unknown[]];
			// Turn IDs should be 6, 7, 8 (at positions 1, 8, 15 in the flat param array)
			expect(params2[1]).toBe(6);
			expect(params2[8]).toBe(7);
			expect(params2[15]).toBe(8);
		});
	});

	// ─── PERF-M4: Batch entity processing ───

	describe('processEntities() — PERF-M4', () => {
		it('should no-op for empty array', async () => {
			const { PgEpisodicMemory } = await import('../../src/db/index.js');
			const mem = new PgEpisodicMemory(mockPool as any);

			const result = await mem.processEntities([]);

			expect(result).toEqual([]);
			expect(mockPool.query).not.toHaveBeenCalled();
		});

		it('should batch process 5+ new entities with batch INSERT', async () => {
			const now = new Date();
			const entityNames = ['TypeScript', 'Vitest', 'PostgreSQL', 'Node.js', 'Docker', 'Redis'];

			// Mock: batch lookup returns empty (all new), then batch INSERT
			mockPool.query
				.mockResolvedValueOnce({ rows: [], rowCount: 0 }) // batch lookup: none existing
				.mockResolvedValueOnce({
					rows: entityNames.map((name) => ({
						entity_id: `eid-${name.toLowerCase()}`,
						name,
						entity_type: 'technology',
						mention_count: 1,
						created_at: now,
						updated_at: now,
						metadata: {},
					})),
					rowCount: entityNames.length,
				}); // batch INSERT RETURNING

			const { PgEpisodicMemory } = await import('../../src/db/index.js');
			const mem = new PgEpisodicMemory(mockPool as any);

			const entities: NewEntity[] = entityNames.map((name) => ({
				name,
				entityType: 'technology',
			}));

			const result = await mem.processEntities(entities);

			// Should return all 6 entities
			expect(result).toHaveLength(6);

			// Exactly 2 queries: batch SELECT + batch INSERT (no increment needed)
			expect(mockPool.query).toHaveBeenCalledTimes(2);

			// Query 1: batch lookup with ANY($1)
			const [sql1, params1] = mockPool.query.mock.calls[0] as [string, unknown[]];
			expect(sql1).toContain('WHERE name = ANY($1)');
			expect(params1![0]).toEqual(entityNames);

			// Query 2: multi-row INSERT
			const [sql2, params2] = mockPool.query.mock.calls[1] as [string, unknown[]];
			expect(sql2).toContain('INSERT INTO entities');
			// 6 entities x 4 params each = 24 params
			expect(params2).toHaveLength(24);
		});

		it('should increment mentions for existing entities and insert new ones', async () => {
			const now = new Date();

			// 3 existing + 2 new = 5 entities
			mockPool.query
				.mockResolvedValueOnce({
					rows: [
						{ entity_id: 'e-1', name: 'TypeScript', entity_type: 'tech', mention_count: 5, created_at: now, updated_at: now, metadata: {} },
						{ entity_id: 'e-2', name: 'Node.js', entity_type: 'tech', mention_count: 3, created_at: now, updated_at: now, metadata: {} },
						{ entity_id: 'e-3', name: 'Docker', entity_type: 'tech', mention_count: 1, created_at: now, updated_at: now, metadata: {} },
					],
					rowCount: 3,
				}) // batch lookup: 3 existing
				.mockResolvedValueOnce({ rows: [], rowCount: 3 }) // batch UPDATE mentions
				.mockResolvedValueOnce({
					rows: [
						{ entity_id: 'e-new-1', name: 'Redis', entity_type: 'tech', mention_count: 1, created_at: now, updated_at: now, metadata: {} },
						{ entity_id: 'e-new-2', name: 'Kafka', entity_type: 'tech', mention_count: 1, created_at: now, updated_at: now, metadata: {} },
					],
					rowCount: 2,
				}); // batch INSERT RETURNING

			const { PgEpisodicMemory } = await import('../../src/db/index.js');
			const mem = new PgEpisodicMemory(mockPool as any);

			const entities: NewEntity[] = [
				{ name: 'TypeScript', entityType: 'tech' },
				{ name: 'Node.js', entityType: 'tech' },
				{ name: 'Docker', entityType: 'tech' },
				{ name: 'Redis', entityType: 'tech' },
				{ name: 'Kafka', entityType: 'tech' },
			];

			const result = await mem.processEntities(entities);

			// Should return all 5 entities
			expect(result).toHaveLength(5);

			// Exactly 3 queries: SELECT, UPDATE mentions, INSERT new
			expect(mockPool.query).toHaveBeenCalledTimes(3);

			// Query 2: batch UPDATE with ANY($1) for 3 existing entity IDs
			const [sql2, params2] = mockPool.query.mock.calls[1] as [string, unknown[]];
			expect(sql2).toContain('UPDATE entities');
			expect(sql2).toContain('mentions = mentions + 1');
			expect(params2![0]).toEqual(['e-1', 'e-2', 'e-3']);

			// Query 3: batch INSERT for 2 new entities
			const [sql3, params3] = mockPool.query.mock.calls[2] as [string, unknown[]];
			expect(sql3).toContain('INSERT INTO entities');
			expect(params3).toHaveLength(8); // 2 entities x 4 params

			// Existing entities should have incremented mention counts
			const tsEntity = result.find((e) => e.name === 'TypeScript');
			expect(tsEntity?.mentionCount).toBe(6); // was 5, incremented
		});
	});

	describe('findEntities() — PERF-M4', () => {
		it('should no-op for empty names array', async () => {
			const { PgEpisodicMemory } = await import('../../src/db/index.js');
			const mem = new PgEpisodicMemory(mockPool as any);

			const result = await mem.findEntities([]);

			expect(result).toEqual([]);
			expect(mockPool.query).not.toHaveBeenCalled();
		});

		it('should batch lookup multiple entities in a single query', async () => {
			const now = new Date();
			mockPool.query.mockResolvedValueOnce({
				rows: [
					{ entity_id: 'e-1', name: 'TypeScript', entity_type: 'tech', mention_count: 10, created_at: now, updated_at: now, metadata: {} },
					{ entity_id: 'e-2', name: 'Node.js', entity_type: 'tech', mention_count: 5, created_at: now, updated_at: now, metadata: {} },
				],
				rowCount: 2,
			});

			const { PgEpisodicMemory } = await import('../../src/db/index.js');
			const mem = new PgEpisodicMemory(mockPool as any);

			const result = await mem.findEntities(['TypeScript', 'Node.js', 'Unknown']);

			expect(result).toHaveLength(2);
			expect(mockPool.query).toHaveBeenCalledTimes(1);

			const [sql, params] = mockPool.query.mock.calls[0] as [string, unknown[]];
			expect(sql).toContain('WHERE name = ANY($1)');
			expect(params![0]).toEqual(['TypeScript', 'Node.js', 'Unknown']);
		});
	});
});
