import { decayBatch } from '@axel/core/decay';
import type { DecayInput } from '@axel/core/decay';
import type {
	DecayResult,
	DecayRunConfig,
	NewMemory,
	ScoredMemory,
	SemanticMemory,
	SemanticQuery,
} from '@axel/core/memory';
import type { ComponentHealth, Memory } from '@axel/core/types';
import type { PgPoolDriver } from './pg-pool.js';

/**
 * PostgreSQL + pgvector backed Semantic Memory (M3, ADR-013, ADR-016).
 *
 * Maps to `memories` table per migration-strategy 003.
 * Uses HNSW index with vector(1536) for cosine similarity search.
 * Hybrid scoring: 0.7 * vector_score + 0.3 * text_score (plan §3.1).
 */
class PgSemanticMemory implements SemanticMemory {
	readonly layerName = 'M3:semantic' as const;
	private readonly pool: PgPoolDriver;

	constructor(pool: PgPoolDriver) {
		this.pool = pool;
	}

	async store(newMemory: NewMemory): Promise<string> {
		const embeddingStr = float32ArrayToPgVector(newMemory.embedding);
		const result = await this.pool.query(
			`INSERT INTO memories (content, memory_type, importance, embedding,
			                       source_channel, source_session)
			 VALUES ($1, $2, $3, $4, $5, $6)
			 RETURNING uuid`,
			[
				newMemory.content,
				newMemory.memoryType,
				newMemory.importance,
				embeddingStr,
				newMemory.sourceChannel,
				newMemory.sourceSession ?? null,
			],
		);
		return (result.rows[0] as { uuid: string }).uuid;
	}

	async search(query: SemanticQuery): Promise<readonly ScoredMemory[]> {
		const embeddingStr = float32ArrayToPgVector(query.embedding);
		const conditions: string[] = [];
		const params: unknown[] = [embeddingStr, query.text];
		let paramIdx = 3;

		if (query.minImportance !== undefined) {
			conditions.push(`importance >= $${paramIdx}`);
			params.push(query.minImportance);
			paramIdx++;
		}

		if (query.memoryTypes && query.memoryTypes.length > 0) {
			conditions.push(`memory_type = ANY($${paramIdx})`);
			params.push(query.memoryTypes);
			paramIdx++;
		}

		if (query.channelFilter) {
			conditions.push(`source_channel = $${paramIdx}`);
			params.push(query.channelFilter);
			paramIdx++;
		}

		const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

		params.push(query.limit);

		const sql = `
			SELECT id, uuid, content, memory_type, importance, embedding,
			       created_at, last_accessed, access_count,
			       source_channel, channel_mentions, source_session,
			       decayed_importance, last_decayed_at,
			       1 - (embedding <=> $1) AS vector_score,
			       similarity(content, $2) AS text_score
			FROM memories
			${whereClause}
			ORDER BY (0.7 * (1 - (embedding <=> $1)) + 0.3 * similarity(content, $2)) DESC
			LIMIT $${paramIdx}
		`;

		const result = await this.pool.query(sql, params);
		return (result.rows as MemoryRow[]).map(toScoredMemory);
	}

	async decay(config: DecayRunConfig): Promise<DecayResult> {
		if (!config.decayConfig) {
			// No decay config — legacy mode: just delete below threshold
			const countResult = await this.pool.query('SELECT COUNT(*) AS cnt FROM memories');
			const processed = Number((countResult.rows[0] as { cnt: string }).cnt);
			const deleteResult = await this.pool.query('DELETE FROM memories WHERE importance < $1', [
				config.threshold,
			]);
			return { processed, deleted: deleteResult.rowCount ?? 0, minImportance: 0, maxImportance: 0, avgImportance: 0 };
		}

		// Load all memories for decay calculation
		const loadResult = await this.pool.query(
			`SELECT uuid, importance, memory_type, created_at, last_accessed,
			        access_count, channel_mentions
			 FROM memories`,
		);
		const rows = loadResult.rows as DecayMemoryRow[];

		if (rows.length === 0) {
			return { processed: 0, deleted: 0, minImportance: 0, maxImportance: 0, avgImportance: 0 };
		}

		const now = Date.now();
		const inputs: DecayInput[] = rows.map((r) => {
			const createdMs = r.created_at.getTime();
			const lastAccessedMs = r.last_accessed.getTime();
			const channelCount = r.channel_mentions ? Object.keys(r.channel_mentions).length : 0;
			return {
				importance: r.importance,
				memoryType: r.memory_type as DecayInput['memoryType'],
				hoursElapsed: (now - createdMs) / 3_600_000,
				accessCount: Math.max(1, r.access_count),
				connectionCount: 0,
				channelMentions: channelCount,
				lastAccessedHoursAgo: (now - lastAccessedMs) / 3_600_000,
				ageHours: (now - createdMs) / 3_600_000,
			};
		});

		const decayed = decayBatch(inputs, config.decayConfig);

		// Batch UPDATE + collect stats
		let deleted = 0;
		let min = Number.POSITIVE_INFINITY;
		let max = Number.NEGATIVE_INFINITY;
		let total = 0;

		for (let i = 0; i < rows.length; i++) {
			const newImportance = decayed[i]!;
			const row = rows[i]!;

			if (newImportance < config.threshold) {
				await this.pool.query('DELETE FROM memories WHERE uuid = $1', [row.uuid]);
				deleted++;
			} else {
				await this.pool.query(
					`UPDATE memories SET importance = $1, decayed_importance = $1, last_decayed_at = NOW()
					 WHERE uuid = $2`,
					[newImportance, row.uuid],
				);
				if (newImportance < min) min = newImportance;
				if (newImportance > max) max = newImportance;
				total += newImportance;
			}
		}

		const surviving = rows.length - deleted;
		return {
			processed: rows.length,
			deleted,
			minImportance: surviving > 0 ? min : 0,
			maxImportance: surviving > 0 ? max : 0,
			avgImportance: surviving > 0 ? total / surviving : 0,
		};
	}

	async delete(uuid: string): Promise<void> {
		await this.pool.query('DELETE FROM memories WHERE uuid = $1', [uuid]);
	}

	async getByUuid(uuid: string): Promise<Memory | null> {
		const result = await this.pool.query(
			`SELECT uuid, content, memory_type, importance, embedding,
			        created_at, last_accessed, access_count,
			        source_channel, channel_mentions, source_session,
			        decayed_importance, last_decayed_at
			 FROM memories WHERE uuid = $1`,
			[uuid],
		);
		if (result.rows.length === 0) return null;
		return toMemory(result.rows[0] as MemoryRow);
	}

	async updateAccess(uuid: string): Promise<void> {
		await this.pool.query(
			`UPDATE memories
			 SET access_count = access_count + 1, last_accessed = NOW()
			 WHERE uuid = $1`,
			[uuid],
		);
	}

	async healthCheck(): Promise<ComponentHealth> {
		const start = Date.now();
		try {
			await this.pool.query('SELECT COUNT(*) FROM memories');
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

interface DecayMemoryRow {
	uuid: string;
	importance: number;
	memory_type: string;
	created_at: Date;
	last_accessed: Date;
	access_count: number;
	channel_mentions: Record<string, number> | null;
}

interface MemoryRow {
	id?: number;
	uuid: string;
	content: string;
	memory_type: string;
	importance: number;
	embedding: string;
	created_at: Date;
	last_accessed: Date;
	access_count: number;
	source_channel: string | null;
	channel_mentions: Record<string, number>;
	source_session: string | null;
	decayed_importance: number | null;
	last_decayed_at: Date | null;
	vector_score?: number;
	text_score?: number;
}

function toMemory(row: MemoryRow): Memory {
	return {
		uuid: row.uuid,
		content: row.content,
		memoryType: row.memory_type as Memory['memoryType'],
		importance: row.importance,
		embedding: pgVectorToFloat32Array(row.embedding),
		createdAt: row.created_at,
		lastAccessed: row.last_accessed,
		accessCount: row.access_count,
		sourceChannel: row.source_channel,
		channelMentions: row.channel_mentions ?? {},
		sourceSession: row.source_session,
		decayedImportance: row.decayed_importance,
		lastDecayedAt: row.last_decayed_at,
	};
}

function toScoredMemory(row: MemoryRow): ScoredMemory {
	const vectorScore = row.vector_score ?? 0;
	const textScore = row.text_score ?? 0;
	return {
		memory: toMemory(row),
		vectorScore,
		textScore,
		finalScore: 0.7 * vectorScore + 0.3 * textScore,
		dbId: row.id,
	};
}

function float32ArrayToPgVector(arr: Float32Array): string {
	const parts: string[] = [];
	for (let i = 0; i < arr.length; i++) {
		parts.push(String(arr[i]));
	}
	return `[${parts.join(',')}]`;
}

function pgVectorToFloat32Array(str: string): Float32Array {
	const inner = str.replace(/^\[|\]$/g, '');
	if (inner.length === 0) return new Float32Array(0);
	const values = inner.split(',').map(Number);
	return new Float32Array(values);
}

export { PgSemanticMemory };
