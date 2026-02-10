import type {
	CreateSessionParams,
	Entity,
	EpisodicMemory,
	MessageRecord,
	NewEntity,
} from '@axel/core/memory';
import type { ComponentHealth, SessionSummary } from '@axel/core/types';
import type { PgPoolDriver } from './pg-pool.js';

/**
 * PostgreSQL-backed Episodic Memory (M2, ADR-013).
 *
 * Maps to `sessions` and `messages` tables per migration-strategy 002.
 */
class PgEpisodicMemory implements EpisodicMemory {
	readonly layerName = 'M2:episodic' as const;
	private readonly pool: PgPoolDriver;

	constructor(pool: PgPoolDriver) {
		this.pool = pool;
	}

	async createSession(params: CreateSessionParams): Promise<string> {
		const sessionId = crypto.randomUUID();
		await this.pool.query(
			`INSERT INTO sessions (session_id, user_id, channel_id, metadata, started_at)
			 VALUES ($1, $2, $3, $4, NOW())
			 RETURNING session_id`,
			[sessionId, params.userId, params.channelId, JSON.stringify(params.metadata ?? {})],
		);
		return sessionId;
	}

	async endSession(sessionId: string, summary: string): Promise<void> {
		const result = await this.pool.query(
			`UPDATE sessions
			 SET summary = $2, ended_at = NOW()
			 WHERE session_id = $1 AND ended_at IS NULL`,
			[sessionId, summary],
		);
		if (result.rowCount === 0) {
			throw new Error(`Session not found or already ended: ${sessionId}`);
		}
	}

	async addMessage(sessionId: string, message: MessageRecord): Promise<void> {
		await this.pool.query(
			`INSERT INTO messages (session_id, turn_id, role, content, channel_id, timestamp, token_count)
			 VALUES ($1,
			         (SELECT COALESCE(MAX(turn_id), 0) + 1 FROM messages WHERE session_id = $1),
			         $2, $3, $4, $5, $6)`,
			[
				sessionId,
				message.role,
				message.content,
				message.channelId,
				message.timestamp,
				message.tokenCount,
			],
		);
		await this.pool.query('UPDATE sessions SET turn_count = turn_count + 1 WHERE session_id = $1', [
			sessionId,
		]);
	}

	/**
	 * PERF-M3: Batch INSERT for multiple messages in a single query.
	 *
	 * Reduces N individual INSERTs + N session updates to 1 multi-row INSERT + 1 session update.
	 * Falls back to single-message addMessage when given a single message.
	 */
	async addMessages(sessionId: string, messages: readonly MessageRecord[]): Promise<void> {
		if (messages.length === 0) return;

		// Single message: delegate to existing method (no overhead)
		if (messages.length === 1) {
			await this.addMessage(sessionId, messages[0]!);
			return;
		}

		// Fetch current max turn_id once
		const maxResult = await this.pool.query(
			'SELECT COALESCE(MAX(turn_id), 0) AS max_turn FROM messages WHERE session_id = $1',
			[sessionId],
		);
		let nextTurn = ((maxResult.rows[0] as { max_turn: number })?.max_turn ?? 0) + 1;

		// Build multi-row VALUES clause
		const valueClauses: string[] = [];
		const params: unknown[] = [];
		let paramIdx = 1;

		for (const msg of messages) {
			valueClauses.push(
				`($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, $${paramIdx + 4}, $${paramIdx + 5}, $${paramIdx + 6})`,
			);
			params.push(sessionId, nextTurn++, msg.role, msg.content, msg.channelId, msg.timestamp, msg.tokenCount);
			paramIdx += 7;
		}

		await this.pool.query(
			`INSERT INTO messages (session_id, turn_id, role, content, channel_id, timestamp, token_count)
			 VALUES ${valueClauses.join(', ')}`,
			params,
		);

		// Single turn_count update for all messages
		await this.pool.query(
			'UPDATE sessions SET turn_count = turn_count + $2 WHERE session_id = $1',
			[sessionId, messages.length],
		);
	}

	async getRecentSessions(userId: string, limit: number): Promise<readonly SessionSummary[]> {
		const result = await this.pool.query(
			`SELECT session_id, summary, key_topics, emotional_tone,
			        turn_count, channel_id, started_at, ended_at
			 FROM sessions
			 WHERE user_id = $1 AND ended_at IS NOT NULL
			 ORDER BY ended_at DESC
			 LIMIT $2`,
			[userId, limit],
		);
		return (result.rows as SessionRow[]).map(toSessionSummary);
	}

	async searchByTopic(topic: string, limit: number): Promise<readonly SessionSummary[]> {
		const result = await this.pool.query(
			`SELECT session_id, summary, key_topics, emotional_tone,
			        turn_count, channel_id, started_at, ended_at
			 FROM sessions
			 WHERE ended_at IS NOT NULL
			   AND (summary ILIKE '%' || $1 || '%'
			        OR key_topics::text ILIKE '%' || $1 || '%')
			 LIMIT $2`,
			[topic, limit],
		);
		return (result.rows as SessionRow[]).map(toSessionSummary);
	}

	async getSessionMessages(sessionId: string): Promise<readonly MessageRecord[]> {
		const result = await this.pool.query(
			`SELECT role, content, channel_id, timestamp, token_count
			 FROM messages
			 WHERE session_id = $1
			 ORDER BY timestamp ASC`,
			[sessionId],
		);
		return (result.rows as MessageRow[]).map(toMessageRecord);
	}

	async listSessions(
		userId: string,
		limit = 50,
	): Promise<
		readonly {
			sessionId: string;
			title: string;
			channelId: string;
			turnCount: number;
			startedAt: Date;
			endedAt: Date | null;
		}[]
	> {
		const result = await this.pool.query(
			`SELECT session_id, summary, channel_id, turn_count, started_at, ended_at
			 FROM sessions
			 WHERE user_id = $1
			 ORDER BY started_at DESC
			 LIMIT $2`,
			[userId, limit],
		);
		return (result.rows as SessionRow[]).map((r) => ({
			sessionId: r.session_id,
			title: r.summary ?? `Session ${r.session_id.slice(0, 8)}`,
			channelId: r.channel_id,
			turnCount: r.turn_count,
			startedAt: r.started_at,
			endedAt: r.ended_at ?? null,
		}));
	}

	async findUnconsolidated(
		limit: number,
	): Promise<readonly { sessionId: string; userId: string; channelId: string }[]> {
		const result = await this.pool.query(
			`SELECT session_id, user_id, channel_id
			 FROM sessions
			 WHERE ended_at IS NOT NULL AND consolidated_at IS NULL
			 ORDER BY ended_at ASC
			 LIMIT $1`,
			[limit],
		);
		return (result.rows as { session_id: string; user_id: string; channel_id: string }[]).map(
			(r) => ({
				sessionId: r.session_id,
				userId: r.user_id,
				channelId: r.channel_id,
			}),
		);
	}

	async markConsolidated(sessionId: string): Promise<void> {
		await this.pool.query(`UPDATE sessions SET consolidated_at = NOW() WHERE session_id = $1`, [
			sessionId,
		]);
	}

	async searchByContent(query: string, limit: number): Promise<readonly MessageRecord[]> {
		const result = await this.pool.query(
			`SELECT role, content, channel_id, timestamp, token_count
			 FROM messages
			 WHERE content ILIKE '%' || $1 || '%'
			 ORDER BY timestamp DESC
			 LIMIT $2`,
			[query, limit],
		);
		return (result.rows as MessageRow[]).map(toMessageRecord);
	}

	/**
	 * PERF-M4: Batch entity processing — find or create multiple entities in 1-2 queries.
	 *
	 * 1. Batch lookup: SELECT WHERE name = ANY($1)
	 * 2. Batch insert: multi-row INSERT for entities not found
	 * 3. Batch increment: UPDATE mentions for existing entities
	 *
	 * Returns entity IDs for all entities (existing + newly created).
	 */
	async processEntities(entities: readonly NewEntity[]): Promise<readonly Entity[]> {
		if (entities.length === 0) return [];

		const names = entities.map((e) => e.name);

		// 1. Batch lookup — single query for all names
		const existing = await this.pool.query(
			`SELECT entity_id, name, entity_type, mentions AS mention_count,
			        created_at, last_accessed AS updated_at, properties AS metadata
			 FROM entities
			 WHERE name = ANY($1)`,
			[names],
		);

		const existingMap = new Map<string, EntityRow>();
		for (const row of existing.rows as EntityRow[]) {
			existingMap.set(row.name, row);
		}

		// Separate into existing (need mention increment) and new (need insert)
		const toInsert: NewEntity[] = [];
		const toIncrement: string[] = [];
		for (const entity of entities) {
			const found = existingMap.get(entity.name);
			if (found) {
				toIncrement.push(found.entity_id);
			} else {
				toInsert.push(entity);
			}
		}

		// 2. Batch increment mentions for existing entities — single query
		if (toIncrement.length > 0) {
			await this.pool.query(
				`UPDATE entities
				 SET mentions = mentions + 1, last_accessed = NOW()
				 WHERE entity_id = ANY($1)`,
				[toIncrement],
			);
		}

		// 3. Batch INSERT for new entities — single multi-row query
		const newEntityRows: EntityRow[] = [];
		if (toInsert.length > 0) {
			const valueClauses: string[] = [];
			const params: unknown[] = [];
			let paramIdx = 1;

			for (const entity of toInsert) {
				const entityId = crypto.randomUUID();
				valueClauses.push(
					`($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3})`,
				);
				params.push(entityId, entity.name, entity.entityType, JSON.stringify(entity.metadata ?? {}));
				paramIdx += 4;
			}

			const insertResult = await this.pool.query(
				`INSERT INTO entities (entity_id, name, entity_type, properties)
				 VALUES ${valueClauses.join(', ')}
				 RETURNING entity_id, name, entity_type, 1 AS mention_count,
				           created_at, last_accessed AS updated_at, properties AS metadata`,
				params,
			);

			for (const row of insertResult.rows as EntityRow[]) {
				newEntityRows.push(row);
			}
		}

		// Build result: existing (with incremented mentions) + newly created
		const results: Entity[] = [];
		for (const row of existingMap.values()) {
			results.push(toEntity({ ...row, mention_count: row.mention_count + 1 }));
		}
		for (const row of newEntityRows) {
			results.push(toEntity(row));
		}

		return results;
	}

	/**
	 * PERF-M4: Batch entity lookup by names — single query.
	 */
	async findEntities(names: readonly string[]): Promise<readonly Entity[]> {
		if (names.length === 0) return [];
		const result = await this.pool.query(
			`SELECT entity_id, name, entity_type, mentions AS mention_count,
			        created_at, last_accessed AS updated_at, properties AS metadata
			 FROM entities
			 WHERE name = ANY($1)`,
			[names],
		);
		return (result.rows as EntityRow[]).map(toEntity);
	}

	async healthCheck(): Promise<ComponentHealth> {
		const start = Date.now();
		try {
			await this.pool.query('SELECT COUNT(*) FROM sessions');
			return {
				state: 'healthy',
				latencyMs: Date.now() - start,
				message: null,
				lastChecked: new Date(),
			};
		} catch (error) {
			return {
				state: 'unhealthy',
				latencyMs: Date.now() - start,
				message: error instanceof Error ? error.message : 'Unknown error',
				lastChecked: new Date(),
			};
		}
	}
}

interface SessionRow {
	session_id: string;
	summary: string | null;
	key_topics: readonly string[];
	emotional_tone: string | null;
	turn_count: number;
	channel_id: string;
	started_at: Date;
	ended_at: Date;
}

interface MessageRow {
	role: 'user' | 'assistant' | 'system' | 'tool';
	content: string;
	channel_id: string;
	timestamp: Date;
	token_count: number;
}

function toSessionSummary(row: SessionRow): SessionSummary {
	return {
		sessionId: row.session_id,
		summary: row.summary ?? '',
		keyTopics: Array.isArray(row.key_topics) ? row.key_topics : [],
		emotionalTone: row.emotional_tone ?? 'neutral',
		turnCount: row.turn_count,
		channelHistory: [row.channel_id],
		startedAt: row.started_at,
		endedAt: row.ended_at,
	};
}

function toMessageRecord(row: MessageRow): MessageRecord {
	return {
		role: row.role,
		content: row.content,
		channelId: row.channel_id,
		timestamp: row.timestamp,
		tokenCount: row.token_count,
	};
}

interface EntityRow {
	entity_id: string;
	name: string;
	entity_type: string;
	mention_count: number;
	created_at: Date;
	updated_at: Date;
	metadata: Record<string, unknown>;
}

function toEntity(row: EntityRow): Entity {
	return {
		entityId: row.entity_id,
		name: row.name,
		entityType: row.entity_type,
		mentionCount: row.mention_count,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		metadata: row.metadata ?? {},
	};
}

export { PgEpisodicMemory };
