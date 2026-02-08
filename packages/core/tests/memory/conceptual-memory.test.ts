import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryConceptualMemory } from '../../src/memory/conceptual-memory.js';

describe('InMemoryConceptualMemory', () => {
	let conceptual: InMemoryConceptualMemory;

	beforeEach(() => {
		conceptual = new InMemoryConceptualMemory();
	});

	describe('layerName', () => {
		it('should be "M4:conceptual"', () => {
			expect(conceptual.layerName).toBe('M4:conceptual');
		});
	});

	describe('addEntity / findEntity', () => {
		it('should add entity and return ID', async () => {
			const id = await conceptual.addEntity({
				name: 'TypeScript',
				entityType: 'technology',
			});
			expect(typeof id).toBe('string');
			expect(id.length).toBeGreaterThan(0);
		});

		it('should find entity by name', async () => {
			await conceptual.addEntity({
				name: 'TypeScript',
				entityType: 'technology',
			});

			const entity = await conceptual.findEntity('TypeScript');
			expect(entity).not.toBeNull();
			expect(entity?.name).toBe('TypeScript');
			expect(entity?.entityType).toBe('technology');
		});

		it('should return null for non-existent entity', async () => {
			const entity = await conceptual.findEntity('NonExistent');
			expect(entity).toBeNull();
		});

		it('should support entity with metadata', async () => {
			await conceptual.addEntity({
				name: 'Mark',
				entityType: 'person',
				metadata: { role: 'operator' },
			});

			const entity = await conceptual.findEntity('Mark');
			expect(entity?.metadata).toEqual({ role: 'operator' });
		});
	});

	describe('addRelation / getRelated', () => {
		it('should create relation between entities', async () => {
			const id1 = await conceptual.addEntity({
				name: 'TypeScript',
				entityType: 'technology',
			});
			const id2 = await conceptual.addEntity({
				name: 'Node.js',
				entityType: 'platform',
			});

			await conceptual.addRelation({
				sourceId: id1,
				targetId: id2,
				relationType: 'runs_on',
				weight: 0.9,
			});

			const related = await conceptual.getRelated(id1);
			expect(related).toHaveLength(1);
			expect(related[0]?.name).toBe('Node.js');
		});

		it('should filter by relation type', async () => {
			const id1 = await conceptual.addEntity({
				name: 'TypeScript',
				entityType: 'technology',
			});
			const id2 = await conceptual.addEntity({
				name: 'Node.js',
				entityType: 'platform',
			});
			const id3 = await conceptual.addEntity({
				name: 'Deno',
				entityType: 'platform',
			});

			await conceptual.addRelation({
				sourceId: id1,
				targetId: id2,
				relationType: 'runs_on',
				weight: 0.9,
			});
			await conceptual.addRelation({
				sourceId: id1,
				targetId: id3,
				relationType: 'compiles_to',
				weight: 0.5,
			});

			const runsOn = await conceptual.getRelated(id1, 'runs_on');
			expect(runsOn).toHaveLength(1);
			expect(runsOn[0]?.name).toBe('Node.js');
		});
	});

	describe('traverse', () => {
		it('should traverse graph to specified depth', async () => {
			const idA = await conceptual.addEntity({ name: 'A', entityType: 'test' });
			const idB = await conceptual.addEntity({ name: 'B', entityType: 'test' });
			const idC = await conceptual.addEntity({ name: 'C', entityType: 'test' });

			await conceptual.addRelation({
				sourceId: idA,
				targetId: idB,
				relationType: 'links_to',
				weight: 0.8,
			});
			await conceptual.addRelation({
				sourceId: idB,
				targetId: idC,
				relationType: 'links_to',
				weight: 0.7,
			});

			// Depth 1: only B
			const depth1 = await conceptual.traverse(idA, 1);
			expect(depth1).toHaveLength(1);
			expect(depth1[0]?.entity.name).toBe('B');
			expect(depth1[0]?.depth).toBe(1);

			// Depth 2: B and C
			const depth2 = await conceptual.traverse(idA, 2);
			expect(depth2).toHaveLength(2);
			const names = depth2.map((n) => n.entity.name);
			expect(names).toContain('B');
			expect(names).toContain('C');
		});

		it('should return empty for entity with no relations', async () => {
			const id = await conceptual.addEntity({ name: 'Isolated', entityType: 'test' });
			const nodes = await conceptual.traverse(id, 2);
			expect(nodes).toHaveLength(0);
		});

		it('should not include duplicate entities in traversal', async () => {
			const idA = await conceptual.addEntity({ name: 'A', entityType: 'test' });
			const idB = await conceptual.addEntity({ name: 'B', entityType: 'test' });

			// A -> B and B -> A (cycle)
			await conceptual.addRelation({
				sourceId: idA,
				targetId: idB,
				relationType: 'links_to',
				weight: 0.8,
			});
			await conceptual.addRelation({
				sourceId: idB,
				targetId: idA,
				relationType: 'links_to',
				weight: 0.8,
			});

			const nodes = await conceptual.traverse(idA, 3);
			const ids = nodes.map((n) => n.entity.entityId);
			const uniqueIds = new Set(ids);
			expect(ids.length).toBe(uniqueIds.size);
		});
	});

	describe('traverse - edge cases', () => {
		it('should handle relation to non-existent entity', async () => {
			const idA = await conceptual.addEntity({ name: 'A', entityType: 'test' });
			// Add relation to non-existent target
			await conceptual.addRelation({
				sourceId: idA,
				targetId: 'nonexistent',
				relationType: 'links_to',
				weight: 0.5,
			});

			const nodes = await conceptual.traverse(idA, 1);
			expect(nodes).toHaveLength(0);
		});
	});

	describe('getRelated - edge cases', () => {
		it('should return empty for entity with no outgoing relations', async () => {
			const id = await conceptual.addEntity({ name: 'Lonely', entityType: 'test' });
			const related = await conceptual.getRelated(id);
			expect(related).toHaveLength(0);
		});

		it('should not return relations where entity is target only', async () => {
			const id1 = await conceptual.addEntity({ name: 'Source', entityType: 'test' });
			const id2 = await conceptual.addEntity({ name: 'Target', entityType: 'test' });
			await conceptual.addRelation({
				sourceId: id1,
				targetId: id2,
				relationType: 'links_to',
				weight: 0.8,
			});

			// id2 is only a target, not a source
			const related = await conceptual.getRelated(id2);
			expect(related).toHaveLength(0);
		});
	});

	describe('incrementMentions', () => {
		it('should increment mention count', async () => {
			const id = await conceptual.addEntity({
				name: 'TypeScript',
				entityType: 'technology',
			});

			await conceptual.incrementMentions(id);
			await conceptual.incrementMentions(id);

			const entity = await conceptual.findEntity('TypeScript');
			expect(entity?.mentionCount).toBe(2);
		});

		it('should no-op for non-existent entity', async () => {
			await expect(conceptual.incrementMentions('nonexistent')).resolves.not.toThrow();
		});
	});

	describe('healthCheck', () => {
		it('should return healthy status', async () => {
			const health = await conceptual.healthCheck();
			expect(health.state).toBe('healthy');
			expect(health.lastChecked).toBeInstanceOf(Date);
		});
	});
});
