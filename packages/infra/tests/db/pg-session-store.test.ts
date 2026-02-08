import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SessionSummary } from '../../../core/src/types/session.js';
import type {
	SessionStore,
	UnifiedSession,
	ResolvedSession,
	SessionStats,
} from '../../../core/src/orchestrator/types.js';

// ─── Mock PG Pool ───

function createMockPool() {
	return {
		query: vi.fn(),
		connect: vi.fn(),
	};
}

// ─── Tests ───

describe('PgSessionStore', () => {
	let mockPool: ReturnType<typeof createMockPool>;

	beforeEach(() => {
		mockPool = createMockPool();
		vi.clearAllMocks();
	});

	describe('resolve()', () => {
		it('should return existing active session when one exists', async () => {
			const now = new Date();
			mockPool.query.mockResolvedValue({
				rows: [
					{
						session_id: 'sess-1',
						user_id: 'user-1',
						channel_id: 'discord',
						channel_history: ['discord'],
						started_at: now,
						last_activity_at: now,
						turn_count: 5,
					},
				],
				rowCount: 1,
			});

			const { PgSessionStore } = await import('../../src/db/index.js');
			const store: SessionStore = new PgSessionStore(mockPool as any);

			const result: ResolvedSession = await store.resolve('user-1', 'discord');

			expect(result.isNew).toBe(false);
			expect(result.channelSwitched).toBe(false);
			expect(result.session.sessionId).toBe('sess-1');
			expect(result.session.userId).toBe('user-1');
		});

		it('should detect channel switch on existing session', async () => {
			const now = new Date();
			// First query: find active session (on discord)
			// Then the channel switch is detected because channelId is different
			mockPool.query
				.mockResolvedValueOnce({
					rows: [
						{
							session_id: 'sess-1',
							user_id: 'user-1',
							channel_id: 'discord',
							channel_history: ['discord'],
							started_at: now,
							last_activity_at: now,
							turn_count: 5,
						},
					],
					rowCount: 1,
				})
				.mockResolvedValueOnce({
					rows: [],
					rowCount: 1, // update query
				});

			const { PgSessionStore } = await import('../../src/db/index.js');
			const store: SessionStore = new PgSessionStore(mockPool as any);

			const result = await store.resolve('user-1', 'telegram');

			expect(result.channelSwitched).toBe(true);
			expect(result.session.activeChannelId).toBe('telegram');
		});

		it('should create a new session when none exists', async () => {
			mockPool.query
				.mockResolvedValueOnce({ rows: [], rowCount: 0 }) // no active session
				.mockResolvedValueOnce({
					rows: [
						{
							session_id: 'sess-new',
							user_id: 'user-1',
							channel_id: 'discord',
							channel_history: ['discord'],
							started_at: new Date(),
							last_activity_at: new Date(),
							turn_count: 0,
						},
					],
					rowCount: 1,
				});

			const { PgSessionStore } = await import('../../src/db/index.js');
			const store: SessionStore = new PgSessionStore(mockPool as any);

			const result = await store.resolve('user-1', 'discord');

			expect(result.isNew).toBe(true);
			expect(result.channelSwitched).toBe(false);
			expect(result.session.userId).toBe('user-1');
		});
	});

	describe('updateActivity()', () => {
		it('should update last_activity_at and turn_count', async () => {
			mockPool.query.mockResolvedValue({ rows: [], rowCount: 1 });

			const { PgSessionStore } = await import('../../src/db/index.js');
			const store: SessionStore = new PgSessionStore(mockPool as any);

			await store.updateActivity('sess-1');

			const [sql, params] = mockPool.query.mock.calls[0] as [string, unknown[]];
			expect(sql).toContain('UPDATE');
			expect(params).toContain('sess-1');
		});
	});

	describe('getActive()', () => {
		it('should return the active session for a user', async () => {
			const now = new Date();
			mockPool.query.mockResolvedValue({
				rows: [
					{
						session_id: 'sess-1',
						user_id: 'user-1',
						channel_id: 'discord',
						channel_history: ['discord'],
						started_at: now,
						last_activity_at: now,
						turn_count: 5,
					},
				],
				rowCount: 1,
			});

			const { PgSessionStore } = await import('../../src/db/index.js');
			const store: SessionStore = new PgSessionStore(mockPool as any);

			const session = await store.getActive('user-1');

			expect(session).not.toBeNull();
			expect(session!.sessionId).toBe('sess-1');
		});

		it('should return null when no active session', async () => {
			mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

			const { PgSessionStore } = await import('../../src/db/index.js');
			const store: SessionStore = new PgSessionStore(mockPool as any);

			const session = await store.getActive('user-1');
			expect(session).toBeNull();
		});
	});

	describe('getStats()', () => {
		it('should return session statistics', async () => {
			mockPool.query.mockResolvedValue({
				rows: [
					{
						total_turns: 25,
						channel_breakdown: { discord: 15, telegram: 10 },
						avg_response_time_ms: 1500,
						tools_used: ['web_search', 'calculator'],
					},
				],
				rowCount: 1,
			});

			const { PgSessionStore } = await import('../../src/db/index.js');
			const store: SessionStore = new PgSessionStore(mockPool as any);

			const stats: SessionStats = await store.getStats('sess-1');

			expect(stats.totalTurns).toBe(25);
			expect(stats.channelBreakdown).toEqual({ discord: 15, telegram: 10 });
			expect(stats.avgResponseTimeMs).toBe(1500);
			expect(stats.toolsUsed).toEqual(['web_search', 'calculator']);
		});
	});

	describe('end()', () => {
		it('should end the session and return a summary', async () => {
			const now = new Date();
			mockPool.query.mockResolvedValue({
				rows: [
					{
						session_id: 'sess-1',
						summary: 'Discussed Axel project',
						key_topics: ['typescript', 'axel'],
						emotional_tone: 'positive',
						turn_count: 10,
						channel_history: ['discord', 'telegram'],
						started_at: now,
						ended_at: now,
					},
				],
				rowCount: 1,
			});

			const { PgSessionStore } = await import('../../src/db/index.js');
			const store: SessionStore = new PgSessionStore(mockPool as any);

			const summary: SessionSummary = await store.end('sess-1');

			expect(summary.sessionId).toBe('sess-1');
			expect(summary.summary).toBe('Discussed Axel project');
			expect(summary.turnCount).toBe(10);
		});
	});
});
