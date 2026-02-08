import type { ComponentHealth } from '../../../core/src/types/health.js';
import type {
	ConceptualMemory,
	NewEntity,
	NewRelation,
	Entity,
	GraphNode,
} from '../../../core/src/memory/types.js';
import type { PgPoolDriver } from './pg-pool.js';

/**
 * PostgreSQL-backed Conceptual Memory (M4, ADR-013).
 *
 * Maps to `entities` and `relations` tables per migration-strategy 004.
 * Uses recursive CTE for BFS graph traversal.
 */
class PgConceptualMemory implements ConceptualMemory {
	readonly layerName = 'M4:conceptual' as const;
	private readonly pool: PgPoolDriver;

	constructor(pool: PgPoolDriver) {
		this.pool = pool;
	}

	async addEntity(entity: NewEntity): Promise<string> {
		const entityId = crypto.randomUUID();
		await this.pool.query(
			`INSERT INTO entities (entity_id, name, entity_type, properties)
			 VALUES ($1, $2, $3, $4)
			 RETURNING entity_id`,
			[entityId, entity.name, entity.entityType, JSON.stringify(entity.metadata ?? {})],
		);
		return entityId;
	}

	async addRelation(relation: NewRelation): Promise<void> {
		await this.pool.query(
			`INSERT INTO relations (source_id, target_id, relation_type, weight)
			 VALUES ($1, $2, $3, $4)
			 ON CONFLICT (source_id, target_id, relation_type)
			 DO UPDATE SET weight = EXCLUDED.weight`,
			[relation.sourceId, relation.targetId, relation.relationType, relation.weight],
		);
	}

	async traverse(
		entityId: string,
		maxDepth: number,
	): Promise<readonly GraphNode[]> {
		const result = await this.pool.query(
			`WITH RECURSIVE traversal AS (
				SELECT r.target_id, r.relation_type, r.weight, 1 AS depth
				FROM relations r
				WHERE r.source_id = $1
				UNION ALL
				SELECT r.target_id, r.relation_type, r.weight, t.depth + 1
				FROM relations r
				JOIN traversal t ON r.source_id = t.target_id
				WHERE t.depth < $2
			)
			SELECT e.entity_id, e.name, e.entity_type, e.mentions AS mention_count,
			       e.created_at, e.last_accessed AS updated_at, e.properties AS metadata,
			       t.relation_type, t.weight, t.depth
			FROM traversal t
			JOIN entities e ON e.entity_id = t.target_id
			ORDER BY t.depth ASC`,
			[entityId, maxDepth],
		);
		return (result.rows as TraversalRow[]).map(toGraphNode);
	}

	async findEntity(name: string): Promise<Entity | null> {
		const result = await this.pool.query(
			`SELECT entity_id, name, entity_type, mentions AS mention_count,
			        created_at, last_accessed AS updated_at, properties AS metadata
			 FROM entities
			 WHERE name = $1
			 LIMIT 1`,
			[name],
		);
		if (result.rows.length === 0) return null;
		return toEntity(result.rows[0] as EntityRow);
	}

	async getRelated(
		entityId: string,
		relationType?: string,
	): Promise<readonly Entity[]> {
		const params: unknown[] = [entityId];
		let sql = `
			SELECT e.entity_id, e.name, e.entity_type, e.mentions AS mention_count,
			       e.created_at, e.last_accessed AS updated_at, e.properties AS metadata
			FROM relations r
			JOIN entities e ON e.entity_id = r.target_id
			WHERE r.source_id = $1`;

		if (relationType !== undefined) {
			sql += ` AND r.relation_type = $2`;
			params.push(relationType);
		}

		const result = await this.pool.query(sql, params);
		return (result.rows as EntityRow[]).map(toEntity);
	}

	async incrementMentions(entityId: string): Promise<void> {
		await this.pool.query(
			`UPDATE entities
			 SET mentions = mentions + 1, last_accessed = NOW()
			 WHERE entity_id = $1`,
			[entityId],
		);
	}

	async healthCheck(): Promise<ComponentHealth> {
		const start = Date.now();
		try {
			await this.pool.query('SELECT COUNT(*) FROM entities');
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

interface EntityRow {
	entity_id: string;
	name: string;
	entity_type: string;
	mention_count: number;
	created_at: Date;
	updated_at: Date;
	metadata: Record<string, unknown>;
}

interface TraversalRow extends EntityRow {
	relation_type: string;
	weight: number;
	depth: number;
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

function toGraphNode(row: TraversalRow): GraphNode {
	return {
		entity: toEntity(row),
		relationType: row.relation_type,
		weight: row.weight,
		depth: row.depth,
	};
}

export { PgConceptualMemory };
