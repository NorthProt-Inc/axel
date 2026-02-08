import type { ComponentHealth } from '../types/health.js';
import type {
	ConceptualMemory,
	Entity,
	GraphNode,
	NewEntity,
	NewRelation,
	Relation,
} from './types.js';

/** In-memory stub for M4 Conceptual Memory (ADR-013). Production uses PostgreSQL. */
export class InMemoryConceptualMemory implements ConceptualMemory {
	readonly layerName = 'M4:conceptual' as const;
	private readonly entities = new Map<string, Entity>();
	private readonly relations: Relation[] = [];
	private nextId = 0;

	async addEntity(input: NewEntity): Promise<string> {
		const entityId = `ent-${++this.nextId}`;
		const now = new Date();
		this.entities.set(entityId, {
			entityId,
			name: input.name,
			entityType: input.entityType,
			mentionCount: 0,
			createdAt: now,
			updatedAt: now,
			metadata: input.metadata ?? {},
		});
		return entityId;
	}

	async addRelation(input: NewRelation): Promise<void> {
		this.relations.push({
			sourceId: input.sourceId,
			targetId: input.targetId,
			relationType: input.relationType,
			weight: input.weight,
			createdAt: new Date(),
		});
	}

	async traverse(entityId: string, maxDepth: number): Promise<readonly GraphNode[]> {
		const visited = new Set<string>([entityId]);
		const result: GraphNode[] = [];
		let frontier = [entityId];

		for (let depth = 1; depth <= maxDepth; depth++) {
			const nextFrontier = this.expandFrontier(frontier, visited, result, depth);
			frontier = nextFrontier;
		}

		return result;
	}

	private expandFrontier(
		frontier: readonly string[],
		visited: Set<string>,
		result: GraphNode[],
		depth: number,
	): string[] {
		const nextFrontier: string[] = [];
		for (const sourceId of frontier) {
			for (const rel of this.relations) {
				if (rel.sourceId !== sourceId || visited.has(rel.targetId)) continue;
				visited.add(rel.targetId);
				const entity = this.entities.get(rel.targetId);
				if (!entity) continue;
				result.push({ entity, relationType: rel.relationType, weight: rel.weight, depth });
				nextFrontier.push(rel.targetId);
			}
		}
		return nextFrontier;
	}

	async findEntity(name: string): Promise<Entity | null> {
		for (const entity of this.entities.values()) {
			if (entity.name === name) {
				return entity;
			}
		}
		return null;
	}

	async getRelated(entityId: string, relationType?: string): Promise<readonly Entity[]> {
		const related: Entity[] = [];
		for (const rel of this.relations) {
			if (rel.sourceId !== entityId) continue;
			if (relationType && rel.relationType !== relationType) continue;
			const entity = this.entities.get(rel.targetId);
			if (entity) {
				related.push(entity);
			}
		}
		return related;
	}

	async incrementMentions(entityId: string): Promise<void> {
		const entity = this.entities.get(entityId);
		if (!entity) return;
		this.entities.set(entityId, {
			...entity,
			mentionCount: entity.mentionCount + 1,
			updatedAt: new Date(),
		});
	}

	async healthCheck(): Promise<ComponentHealth> {
		return {
			state: 'healthy',
			latencyMs: 0,
			message: null,
			lastChecked: new Date(),
		};
	}
}
