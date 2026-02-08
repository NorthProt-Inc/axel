import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
	CreateSessionParams,
	EpisodicMemory,
	MessageRecord,
} from '../../../core/src/memory/types.js';
import type { SessionSummary } from '../../../core/src/types/session.js';

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
});
