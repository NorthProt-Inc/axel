import type {
	ResolvedSession,
	SessionStats,
	SessionStore,
	UnifiedSession,
} from '@axel/core/orchestrator';
import type { SessionSummary } from '@axel/core/types';
import type { PgPoolDriver } from './pg-pool.js';

/**
 * PostgreSQL-backed Session Store (ADR-014).
 *
 * Manages unified sessions spanning multiple channels.
 * Stores session data in the `sessions` table with channel_history.
 */
class PgSessionStore implements SessionStore {
	private readonly pool: PgPoolDriver;

	constructor(pool: PgPoolDriver) {
		this.pool = pool;
	}

	async resolve(userId: string, channelId: string): Promise<ResolvedSession> {
		const activeResult = await this.pool.query(
			`SELECT session_id, user_id, channel_id, channel_history,
			        started_at, last_activity_at, turn_count
			 FROM sessions
			 WHERE user_id = $1 AND ended_at IS NULL
			 ORDER BY last_activity_at DESC
			 LIMIT 1`,
			[userId],
		);

		if (activeResult.rows.length > 0) {
			const row = activeResult.rows[0] as SessionRow;
			const channelSwitched = row.channel_id !== channelId;

			if (channelSwitched) {
				await this.pool.query(
					`UPDATE sessions
					 SET channel_id = $2,
					     channel_history = array_append(channel_history, $2),
					     last_activity_at = NOW()
					 WHERE session_id = $1`,
					[row.session_id, channelId],
				);
			}

			return {
				session: toUnifiedSession(row, channelSwitched ? channelId : row.channel_id),
				isNew: false,
				channelSwitched,
				previousSession: null,
			};
		}

		const sessionId = crypto.randomUUID();
		const insertResult = await this.pool.query(
			`INSERT INTO sessions (session_id, user_id, channel_id, channel_history,
			                       started_at, last_activity_at, turn_count)
			 VALUES ($1, $2, $3, ARRAY[$3], NOW(), NOW(), 0)
			 RETURNING session_id, user_id, channel_id, channel_history,
			           started_at, last_activity_at, turn_count`,
			[sessionId, userId, channelId],
		);

		const newRow = insertResult.rows[0] as SessionRow;
		return {
			session: toUnifiedSession(newRow, channelId),
			isNew: true,
			channelSwitched: false,
			previousSession: null,
		};
	}

	async updateActivity(sessionId: string): Promise<void> {
		await this.pool.query(
			`UPDATE sessions
			 SET last_activity_at = NOW(), turn_count = turn_count + 1
			 WHERE session_id = $1`,
			[sessionId],
		);
	}

	async getActive(userId: string): Promise<UnifiedSession | null> {
		const result = await this.pool.query(
			`SELECT session_id, user_id, channel_id, channel_history,
			        started_at, last_activity_at, turn_count
			 FROM sessions
			 WHERE user_id = $1 AND ended_at IS NULL
			 ORDER BY last_activity_at DESC
			 LIMIT 1`,
			[userId],
		);
		if (result.rows.length === 0) return null;
		const row = result.rows[0] as SessionRow;
		return toUnifiedSession(row, row.channel_id);
	}

	async getStats(sessionId: string): Promise<SessionStats> {
		const result = await this.pool.query(
			`SELECT total_turns, channel_breakdown, avg_response_time_ms, tools_used
			 FROM (
				SELECT s.turn_count AS total_turns,
				       COALESCE(
				         jsonb_object_agg(
				           COALESCE(m.channel_id, 'unknown'),
				           ch_count.cnt
				         ) FILTER (WHERE m.channel_id IS NOT NULL),
				         '{}'::jsonb
				       ) AS channel_breakdown,
				       0 AS avg_response_time_ms,
				       ARRAY[]::text[] AS tools_used
				FROM sessions s
				LEFT JOIN LATERAL (
				  SELECT channel_id, COUNT(*) AS cnt
				  FROM messages
				  WHERE session_id = s.session_id
				  GROUP BY channel_id
				) ch_count ON true
				LEFT JOIN messages m ON m.session_id = s.session_id
				WHERE s.session_id = $1
				GROUP BY s.turn_count
			 ) sub`,
			[sessionId],
		);

		if (result.rows.length === 0) {
			return {
				totalTurns: 0,
				channelBreakdown: {},
				avgResponseTimeMs: 0,
				toolsUsed: [],
			};
		}

		const row = result.rows[0] as StatsRow;
		return {
			totalTurns: row.total_turns,
			channelBreakdown: row.channel_breakdown ?? {},
			avgResponseTimeMs: row.avg_response_time_ms,
			toolsUsed: row.tools_used ?? [],
		};
	}

	async end(sessionId: string): Promise<SessionSummary> {
		const result = await this.pool.query(
			`UPDATE sessions
			 SET ended_at = NOW()
			 WHERE session_id = $1
			 RETURNING session_id, summary, key_topics, emotional_tone,
			           turn_count, channel_history, started_at, ended_at`,
			[sessionId],
		);

		if (result.rows.length === 0) {
			throw new Error(`Session not found: ${sessionId}`);
		}

		const row = result.rows[0] as EndedSessionRow;
		return {
			sessionId: row.session_id,
			summary: row.summary ?? '',
			keyTopics: row.key_topics ?? [],
			emotionalTone: row.emotional_tone ?? 'neutral',
			turnCount: row.turn_count,
			channelHistory: row.channel_history ?? [],
			startedAt: row.started_at,
			endedAt: row.ended_at,
		};
	}
}

interface SessionRow {
	session_id: string;
	user_id: string;
	channel_id: string;
	channel_history: readonly string[];
	started_at: Date;
	last_activity_at: Date;
	turn_count: number;
}

interface StatsRow {
	total_turns: number;
	channel_breakdown: Record<string, number>;
	avg_response_time_ms: number;
	tools_used: readonly string[];
}

interface EndedSessionRow {
	session_id: string;
	summary: string | null;
	key_topics: readonly string[];
	emotional_tone: string | null;
	turn_count: number;
	channel_history: readonly string[];
	started_at: Date;
	ended_at: Date;
}

function toUnifiedSession(row: SessionRow, activeChannelId: string): UnifiedSession {
	return {
		sessionId: row.session_id,
		userId: row.user_id,
		activeChannelId,
		channelHistory: row.channel_history ?? [],
		startedAt: row.started_at,
		lastActivityAt: row.last_activity_at,
		turnCount: row.turn_count,
	};
}

export { PgSessionStore };
