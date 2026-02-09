import type { Turn, WorkingMemory } from '@axel/core/memory';
import type { ComponentHealth } from '@axel/core/types';
import { CircuitBreaker } from '../common/circuit-breaker.js';

/** Minimal Redis client interface (subset used by this adapter) */
interface RedisClient {
	rpush(key: string, value: string): Promise<number>;
	ltrim(key: string, start: number, stop: number): Promise<string>;
	expire(key: string, seconds: number): Promise<number>;
	lrange(key: string, start: number, stop: number): Promise<string[]>;
	del(key: string): Promise<number>;
	get(key: string): Promise<string | null>;
	set(key: string, value: string, mode: string, ttl: number): Promise<string>;
}

/** Minimal PG pool interface (subset used by this adapter) */
interface PgPool {
	query<T = Record<string, unknown>>(
		text: string,
		values?: readonly unknown[],
	): Promise<{ rows: T[] }>;
}

const MAX_TURNS = 20;
const TTL_SECONDS = 3600;

/**
 * Redis-backed Working Memory (ADR-003, ADR-013 M1).
 *
 * PG-first write pattern: PG is source of truth, Redis is read cache.
 * On Redis failure, transparently falls back to PG.
 */
class RedisWorkingMemory implements WorkingMemory {
	readonly layerName = 'M1:working' as const;

	private readonly redis: RedisClient;
	private readonly pg: PgPool;
	private readonly redisCircuit: CircuitBreaker;

	constructor(redis: RedisClient, pg: PgPool) {
		this.redis = redis;
		this.pg = pg;
		this.redisCircuit = new CircuitBreaker({
			failureThreshold: 5,
			cooldownMs: 60_000,
		});
	}

	async pushTurn(userId: string, turn: Turn): Promise<void> {
		// PG-first write (source of truth)
		await this.pg.query(
			'INSERT INTO messages (turn_id, session_id, role, content, channel_id, created_at, token_count) VALUES ($1, $2, $3, $4, $5, $6, $7)',
			[
				turn.turnId,
				userId,
				turn.role,
				turn.content,
				turn.channelId,
				turn.timestamp,
				turn.tokenCount,
			],
		);

		// Redis cache update (fire-and-forget on failure)
		try {
			await this.redisCircuit.execute(async () => {
				const key = `axel:working:${userId}:turns`;
				await this.redis.rpush(key, JSON.stringify(turn));
				await this.redis.ltrim(key, -MAX_TURNS, -1);
				await this.redis.expire(key, TTL_SECONDS);
			});
		} catch {
			// CircuitBreaker already recorded the failure
			// Fall through silently (PG write already succeeded)
		}
	}

	async getTurns(userId: string, limit: number): Promise<readonly Turn[]> {
		// Try Redis first
		try {
			const cached = await this.redisCircuit.execute(async () => {
				const key = `axel:working:${userId}:turns`;
				return await this.redis.lrange(key, -limit, -1);
			});

			if (cached.length > 0) {
				return cached.map((s) => JSON.parse(s) as Turn);
			}
		} catch {
			// CircuitBreaker already recorded the failure
			// Fall through to PG
		}

		// PG fallback
		const result = await this.pg.query<{
			turn_id: number;
			role: string;
			content: string;
			channel_id: string;
			created_at: Date;
			token_count: number;
		}>(
			'SELECT turn_id, role, content, channel_id, created_at, token_count FROM messages WHERE session_id = $1 ORDER BY created_at DESC LIMIT $2',
			[userId, limit],
		);

		return result.rows.reverse().map((row) => ({
			turnId: row.turn_id,
			role: row.role as Turn['role'],
			content: row.content,
			channelId: row.channel_id,
			timestamp: row.created_at,
			tokenCount: row.token_count,
		}));
	}

	async getSummary(userId: string): Promise<string | null> {
		try {
			return await this.redisCircuit.execute(async () => {
				return await this.redis.get(`axel:working:${userId}:summary`);
			});
		} catch {
			// CircuitBreaker already recorded the failure
			// Fall through to PG
		}

		// PG fallback
		const result = await this.pg.query<{ summary: string }>(
			'SELECT summary FROM session_summaries WHERE session_id = $1 ORDER BY created_at DESC LIMIT 1',
			[userId],
		);
		return result.rows[0]?.summary ?? null;
	}

	async compress(userId: string): Promise<void> {
		const key = `axel:working:${userId}:turns`;
		let turns: Turn[];

		try {
			const cached = await this.redisCircuit.execute(async () => {
				return await this.redis.lrange(key, 0, -1);
			});
			turns = cached.map((s) => JSON.parse(s) as Turn);
		} catch {
			// CircuitBreaker already recorded the failure
			// PG fallback — read turns from PG
			const result = await this.pg.query<{
				turn_id: number;
				role: string;
				content: string;
				channel_id: string;
				created_at: Date;
				token_count: number;
			}>(
				'SELECT turn_id, role, content, channel_id, created_at, token_count FROM messages WHERE session_id = $1 ORDER BY created_at ASC',
				[userId],
			);
			turns = result.rows.map((row) => ({
				turnId: row.turn_id,
				role: row.role as Turn['role'],
				content: row.content,
				channelId: row.channel_id,
				timestamp: row.created_at,
				tokenCount: row.token_count,
			}));
		}

		if (turns.length === 0) return;

		// Simple summary: concatenate content
		const summary = turns.map((t) => `${t.role}: ${t.content}`).join('\n');

		try {
			await this.redisCircuit.execute(async () => {
				await this.redis.set(`axel:working:${userId}:summary`, summary, 'EX', TTL_SECONDS);
			});
		} catch {
			// CircuitBreaker already recorded the failure
			// Fire-and-forget write failure
		}
	}

	async flush(userId: string): Promise<void> {
		// Read from Redis and ensure all are in PG
		const turnsKey = `axel:working:${userId}:turns`;
		const summaryKey = `axel:working:${userId}:summary`;

		try {
			const cached = await this.redisCircuit.execute(async () => {
				return await this.redis.lrange(turnsKey, 0, -1);
			});

			if (cached.length > 0) {
				// Batch insert to PG (idempotent — PG-first means most are already there)
				for (const serialized of cached) {
					const turn = JSON.parse(serialized) as Turn;
					await this.pg.query(
						'INSERT INTO messages (turn_id, session_id, role, content, channel_id, created_at, token_count) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING',
						[
							turn.turnId,
							userId,
							turn.role,
							turn.content,
							turn.channelId,
							turn.timestamp,
							turn.tokenCount,
						],
					);
				}
			}
		} catch {
			// If Redis read fails, data is already in PG (PG-first pattern)
			// CircuitBreaker already recorded the failure
		}

		try {
			await this.redisCircuit.execute(async () => {
				await this.redis.del(turnsKey);
				await this.redis.del(summaryKey);
			});
		} catch {
			// CircuitBreaker already recorded the failure
			// Fire-and-forget delete failure
		}
	}

	async clear(userId: string): Promise<void> {
		try {
			await this.redisCircuit.execute(async () => {
				await this.redis.del(`axel:working:${userId}:turns`);
				await this.redis.del(`axel:working:${userId}:summary`);
			});
		} catch {
			// CircuitBreaker already recorded the failure
			// Fire-and-forget clear failure
		}
	}

	async healthCheck(): Promise<ComponentHealth> {
		const now = new Date();

		if (this.redisCircuit.state === 'open') {
			return {
				state: 'degraded',
				latencyMs: null,
				message: 'Redis circuit breaker open, using PG fallback',
				lastChecked: now,
			};
		}

		try {
			const start = Date.now();
			await this.redisCircuit.execute(async () => {
				await this.redis.get('axel:health:ping');
			});
			const latencyMs = Date.now() - start;
			return { state: 'healthy', latencyMs, message: null, lastChecked: now };
		} catch {
			return {
				state: 'degraded',
				latencyMs: null,
				message: 'Redis health check failed',
				lastChecked: now,
			};
		}
	}

}

export { RedisWorkingMemory, type RedisClient, type PgPool };
