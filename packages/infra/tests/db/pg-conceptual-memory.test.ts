import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
	ConceptualMemory,
	Entity,
	GraphNode,
	NewEntity,
	NewRelation,
} from '@axel/core/memory';

// ─── Mock PG Pool ───

function createMockPool() {
	return {
		query: vi.fn(),
		connect: vi.fn(),
	};
}

// ─── Tests ───

describe('PgConceptualMemory', () => {
	let mockPool: ReturnType<typeof createMockPool>;

	beforeEach(() => {
		mockPool = createMockPool();
		vi.clearAllMocks();
	});

	describe('implements ConceptualMemory interface', () => {
		it('should have layerName M4:conceptual', async () => {
			const { PgConceptualMemory } = await import('../../src/db/index.js');
			const mem: ConceptualMemory = new PgConceptualMemory(mockPool as any);
			expect(mem.layerName).toBe('M4:conceptual');
		});
	});

	describe('addEntity()', () => {
		it('should insert an entity and return entity ID', async () => {
			mockPool.query.mockResolvedValue({
				rows: [{ entity_id: 'ent-abc123' }],
				rowCount: 1,
			});

			const { PgConceptualMemory } = await import('../../src/db/index.js');
			const mem: ConceptualMemory = new PgConceptualMemory(mockPool as any);

			const entity: NewEntity = {
				name: 'TypeScript',
				entityType: 'technology',
				metadata: { ecosystem: 'javascript' },
			};

			const entityId = await mem.addEntity(entity);

			expect(typeof entityId).toBe('string');
			expect(entityId.length).toBeGreaterThan(0);
			const [sql, params] = mockPool.query.mock.calls[0] as [string, unknown[]];
			expect(sql).toContain('INSERT INTO entities');
			expect(params).toContain('TypeScript');
			expect(params).toContain('technology');
		});
	});

	describe('addRelation()', () => {
		it('should insert a relation between entities', async () => {
			mockPool.query.mockResolvedValue({ rows: [], rowCount: 1 });

			const { PgConceptualMemory } = await import('../../src/db/index.js');
			const mem: ConceptualMemory = new PgConceptualMemory(mockPool as any);

			const relation: NewRelation = {
				sourceId: 'ent-1',
				targetId: 'ent-2',
				relationType: 'uses',
				weight: 0.9,
			};

			await mem.addRelation(relation);

			const [sql, params] = mockPool.query.mock.calls[0] as [string, unknown[]];
			expect(sql).toContain('INSERT INTO relations');
			expect(params).toContain('ent-1');
			expect(params).toContain('ent-2');
			expect(params).toContain('uses');
		});

		it('should handle duplicate relation with upsert', async () => {
			mockPool.query.mockResolvedValue({ rows: [], rowCount: 1 });

			const { PgConceptualMemory } = await import('../../src/db/index.js');
			const mem: ConceptualMemory = new PgConceptualMemory(mockPool as any);

			const relation: NewRelation = {
				sourceId: 'ent-1',
				targetId: 'ent-2',
				relationType: 'uses',
				weight: 0.9,
			};

			await mem.addRelation(relation);

			const [sql] = mockPool.query.mock.calls[0] as [string, unknown[]];
			expect(sql).toContain('ON CONFLICT');
		});
	});

	describe('traverse()', () => {
		it('should perform BFS traversal using recursive CTE', async () => {
			const now = new Date();
			mockPool.query.mockResolvedValue({
				rows: [
					{
						entity_id: 'ent-2',
						name: 'pnpm',
						entity_type: 'tool',
						mention_count: 5,
						created_at: now,
						updated_at: now,
						metadata: {},
						relation_type: 'uses',
						weight: 0.8,
						depth: 1,
					},
					{
						entity_id: 'ent-3',
						name: 'Biome',
						entity_type: 'tool',
						mention_count: 3,
						created_at: now,
						updated_at: now,
						metadata: {},
						relation_type: 'lints_with',
						weight: 0.7,
						depth: 2,
					},
				],
				rowCount: 2,
			});

			const { PgConceptualMemory } = await import('../../src/db/index.js');
			const mem: ConceptualMemory = new PgConceptualMemory(mockPool as any);

			const nodes = await mem.traverse('ent-1', 3);

			expect(nodes).toHaveLength(2);
			expect(nodes[0]?.entity.name).toBe('pnpm');
			expect(nodes[0]?.depth).toBe(1);
			expect(nodes[1]?.entity.name).toBe('Biome');
			expect(nodes[1]?.depth).toBe(2);

			const [sql] = mockPool.query.mock.calls[0] as [string, unknown[]];
			expect(sql).toContain('RECURSIVE');
		});

		it('should respect maxDepth parameter', async () => {
			mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

			const { PgConceptualMemory } = await import('../../src/db/index.js');
			const mem: ConceptualMemory = new PgConceptualMemory(mockPool as any);

			await mem.traverse('ent-1', 2);

			const [, params] = mockPool.query.mock.calls[0] as [string, unknown[]];
			expect(params).toContain(2);
		});
	});

	describe('findEntity()', () => {
		it('should find an entity by name', async () => {
			const now = new Date();
			mockPool.query.mockResolvedValue({
				rows: [
					{
						entity_id: 'ent-1',
						name: 'Mark',
						entity_type: 'person',
						mention_count: 100,
						created_at: now,
						updated_at: now,
						metadata: { role: 'owner' },
					},
				],
				rowCount: 1,
			});

			const { PgConceptualMemory } = await import('../../src/db/index.js');
			const mem: ConceptualMemory = new PgConceptualMemory(mockPool as any);

			const entity = await mem.findEntity('Mark');

			expect(entity).not.toBeNull();
			expect(entity?.name).toBe('Mark');
			expect(entity?.entityType).toBe('person');
		});

		it('should return null for unknown entity', async () => {
			mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

			const { PgConceptualMemory } = await import('../../src/db/index.js');
			const mem: ConceptualMemory = new PgConceptualMemory(mockPool as any);

			const entity = await mem.findEntity('NonExistent');
			expect(entity).toBeNull();
		});
	});

	describe('getRelated()', () => {
		it('should return related entities', async () => {
			const now = new Date();
			mockPool.query.mockResolvedValue({
				rows: [
					{
						entity_id: 'ent-2',
						name: 'TypeScript',
						entity_type: 'technology',
						mention_count: 50,
						created_at: now,
						updated_at: now,
						metadata: {},
					},
				],
				rowCount: 1,
			});

			const { PgConceptualMemory } = await import('../../src/db/index.js');
			const mem: ConceptualMemory = new PgConceptualMemory(mockPool as any);

			const related = await mem.getRelated('ent-1');

			expect(related).toHaveLength(1);
			expect(related[0]?.name).toBe('TypeScript');
		});

		it('should filter by relation type when provided', async () => {
			mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

			const { PgConceptualMemory } = await import('../../src/db/index.js');
			const mem: ConceptualMemory = new PgConceptualMemory(mockPool as any);

			await mem.getRelated('ent-1', 'uses');

			const [sql, params] = mockPool.query.mock.calls[0] as [string, unknown[]];
			expect(sql).toContain('relation_type');
			expect(params).toContain('uses');
		});
	});

	describe('incrementMentions()', () => {
		it('should increment the mention count for an entity', async () => {
			mockPool.query.mockResolvedValue({ rows: [], rowCount: 1 });

			const { PgConceptualMemory } = await import('../../src/db/index.js');
			const mem: ConceptualMemory = new PgConceptualMemory(mockPool as any);

			await mem.incrementMentions('ent-1');

			const [sql, params] = mockPool.query.mock.calls[0] as [string, unknown[]];
			expect(sql).toContain('UPDATE entities');
			expect(sql).toContain('mentions');
			expect(params).toContain('ent-1');
		});
	});

	describe('healthCheck()', () => {
		it('should return healthy when DB is accessible', async () => {
			mockPool.query.mockResolvedValue({
				rows: [{ count: '100' }],
				rowCount: 1,
			});

			const { PgConceptualMemory } = await import('../../src/db/index.js');
			const mem: ConceptualMemory = new PgConceptualMemory(mockPool as any);

			const health = await mem.healthCheck();
			expect(health.state).toBe('healthy');
		});
	});
});
