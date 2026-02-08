import type { AccessPattern, HotMemory, MetaMemory } from '@axel/core/memory';
import type { ComponentHealth } from '@axel/core/types';
import type { PgPoolDriver } from './pg-pool.js';

/**
 * PostgreSQL-backed Meta Memory (M5, ADR-013).
 *
 * Maps to `memory_access_patterns` table and `hot_memories` materialized view
 * per migration-strategy 005.
 */
class PgMetaMemory implements MetaMemory {
	readonly layerName = 'M5:meta' as const;
	private readonly pool: PgPoolDriver;

	constructor(pool: PgPoolDriver) {
		this.pool = pool;
	}

	async recordAccess(pattern: AccessPattern): Promise<void> {
		await this.pool.query(
			`INSERT INTO memory_access_patterns
			 (query_text, matched_memory_ids, relevance_scores, channel_id)
			 VALUES ($1, $2, $3, $4)`,
			[pattern.queryText, pattern.matchedMemoryIds, pattern.relevanceScores, pattern.channelId],
		);
	}

	async getHotMemories(limit: number): Promise<readonly HotMemory[]> {
		const result = await this.pool.query(
			`SELECT id, uuid, content, access_count, channel_diversity
			 FROM hot_memories
			 ORDER BY access_count DESC
			 LIMIT $1`,
			[limit],
		);
		return (result.rows as HotMemoryRow[]).map(toHotMemory);
	}

	async getPrefetchCandidates(_userId: string, channelId: string): Promise<readonly string[]> {
		const result = await this.pool.query(
			`SELECT DISTINCT m.uuid
			 FROM memory_access_patterns p,
			      LATERAL unnest(p.matched_memory_ids) AS mid
			 JOIN memories m ON m.id = mid
			 WHERE p.channel_id = $1
			 ORDER BY m.uuid
			 LIMIT 20`,
			[channelId],
		);
		return (result.rows as { uuid: string }[]).map((r) => r.uuid);
	}

	async refreshView(): Promise<void> {
		await this.pool.query('REFRESH MATERIALIZED VIEW CONCURRENTLY hot_memories');
	}

	async pruneOldPatterns(olderThanDays: number): Promise<number> {
		const result = await this.pool.query(
			`DELETE FROM memory_access_patterns
			 WHERE created_at < NOW() - MAKE_INTERVAL(days => $1)`,
			[olderThanDays],
		);
		return result.rowCount ?? 0;
	}

	async healthCheck(): Promise<ComponentHealth> {
		const start = Date.now();
		try {
			await this.pool.query('SELECT COUNT(*) FROM memory_access_patterns');
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

interface HotMemoryRow {
	id: number;
	uuid: string;
	content: string;
	access_count: number;
	channel_diversity: number;
}

function toHotMemory(row: HotMemoryRow): HotMemory {
	return {
		memoryId: row.id,
		uuid: row.uuid,
		content: row.content,
		accessCount: row.access_count,
		channelDiversity: row.channel_diversity,
	};
}

export { PgMetaMemory };
