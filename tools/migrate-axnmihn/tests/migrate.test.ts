import { describe, it, expect, vi } from 'vitest';
import {
	createMigrator,
	type MigratorDeps,
	type MigrationResult,
} from '../src/migrate.js';
import type {
	AxnmihnSession,
	AxnmihnMessage,
	AxnmihnInteractionLog,
	ChromaMemory,
	KnowledgeGraphData,
} from '../src/types.js';

function createMockDeps(overrides?: Partial<MigratorDeps>): MigratorDeps {
	return {
		extractSessions: vi.fn().mockResolvedValue([
			{
				id: 1,
				session_id: 'sess-001',
				summary: 'Test session',
				key_topics: '["test"]',
				emotional_tone: 'neutral',
				turn_count: 2,
				started_at: '2026-01-15T10:00:00',
				ended_at: '2026-01-15T11:00:00',
				created_at: '2026-01-15T10:00:00',
			},
		] satisfies AxnmihnSession[]),
		extractMessages: vi.fn().mockResolvedValue([
			{
				id: 1,
				session_id: 'sess-001',
				turn_id: 1,
				role: 'Mark',
				content: 'Hello',
				timestamp: '2026-01-15T10:05:00',
				emotional_context: 'happy',
			},
			{
				id: 2,
				session_id: 'sess-001',
				turn_id: 1,
				role: 'Axel',
				content: 'Hi Mark! How can I help?',
				timestamp: '2026-01-15T10:05:10',
				emotional_context: 'friendly',
			},
		] satisfies AxnmihnMessage[]),
		extractInteractionLogs: vi.fn().mockResolvedValue([
			{
				id: 1,
				ts: '2026-01-15T10:05:10',
				conversation_id: 'sess-001',
				turn_id: 1,
				effective_model: 'claude-3-haiku',
				tier: 'haiku',
				router_reason: 'simple',
				latency_ms: 300,
				ttft_ms: 80,
				tokens_in: 100,
				tokens_out: 50,
				tool_calls_json: null,
			},
		] satisfies AxnmihnInteractionLog[]),
		extractChromaMemories: vi.fn().mockResolvedValue([
			{
				id: 'mem-001',
				content: 'Mark prefers TypeScript',
				metadata: {
					memory_type: 'preference',
					importance: 0.8,
					created_at: '2026-01-10T00:00:00',
					last_accessed: '2026-02-01T00:00:00',
					access_count: 5,
				},
			},
		] satisfies ChromaMemory[]),
		loadKnowledgeGraph: vi.fn().mockResolvedValue({
			entities: [
				{
					entity_id: 'mark',
					name: 'Mark',
					entity_type: 'person',
					properties: {},
					mentions: 10,
					created_at: '2026-01-01T00:00:00',
					last_accessed: '2026-02-01T00:00:00',
				},
			],
			relations: [
				{
					source_id: 'mark',
					target_id: 'mark',
					relation_type: 'self',
					weight: 1.0,
					created_at: '2026-01-01T00:00:00',
				},
			],
		} satisfies KnowledgeGraphData),
		embedBatch: vi.fn().mockResolvedValue([new Float32Array(1536)]),
		insertSessions: vi.fn().mockResolvedValue(1),
		insertSessionSummaries: vi.fn().mockResolvedValue(1),
		insertMessages: vi.fn().mockResolvedValue(2),
		insertInteractionLogs: vi.fn().mockResolvedValue(1),
		insertMemories: vi.fn().mockResolvedValue(1),
		insertEntities: vi.fn().mockResolvedValue(1),
		insertRelations: vi.fn().mockResolvedValue(1),
		log: vi.fn(),
		...overrides,
	};
}

describe('migrate', () => {
	describe('createMigrator', () => {
		it('should execute full migration pipeline', async () => {
			const deps = createMockDeps();
			const migrator = createMigrator(deps);
			const result = await migrator.run();

			expect(result.success).toBe(true);
			expect(result.sessions).toBe(1);
			expect(result.messages).toBe(2);
			expect(result.interactionLogs).toBe(1);
			expect(result.memories).toBe(1);
			expect(result.entities).toBe(1);
			expect(result.relations).toBe(1);
		});

		it('should call extract functions in order', async () => {
			const deps = createMockDeps();
			const migrator = createMigrator(deps);
			await migrator.run();

			expect(deps.extractSessions).toHaveBeenCalledOnce();
			expect(deps.extractMessages).toHaveBeenCalledOnce();
			expect(deps.extractInteractionLogs).toHaveBeenCalledOnce();
			expect(deps.extractChromaMemories).toHaveBeenCalledOnce();
			expect(deps.loadKnowledgeGraph).toHaveBeenCalledOnce();
		});

		it('should call embedBatch with memory contents', async () => {
			const deps = createMockDeps();
			const migrator = createMigrator(deps);
			await migrator.run();

			expect(deps.embedBatch).toHaveBeenCalledWith(
				['Mark prefers TypeScript'],
				'RETRIEVAL_DOCUMENT',
			);
		});

		it('should call insert functions with transformed data', async () => {
			const deps = createMockDeps();
			const migrator = createMigrator(deps);
			await migrator.run();

			expect(deps.insertSessions).toHaveBeenCalledOnce();
			expect(deps.insertSessionSummaries).toHaveBeenCalledOnce();
			expect(deps.insertMessages).toHaveBeenCalledOnce();
			expect(deps.insertInteractionLogs).toHaveBeenCalledOnce();
			expect(deps.insertMemories).toHaveBeenCalledOnce();
			expect(deps.insertEntities).toHaveBeenCalledOnce();
			expect(deps.insertRelations).toHaveBeenCalledOnce();
		});

		it('should filter orphaned relations before insert', async () => {
			const deps = createMockDeps({
				loadKnowledgeGraph: vi.fn().mockResolvedValue({
					entities: [
						{
							entity_id: 'mark',
							name: 'Mark',
							entity_type: 'person',
							properties: {},
							mentions: 1,
							created_at: '2026-01-01T00:00:00',
							last_accessed: '2026-01-01T00:00:00',
						},
					],
					relations: [
						{
							source_id: 'mark',
							target_id: 'nonexistent',
							relation_type: 'knows',
							weight: 0.5,
							created_at: '2026-01-01T00:00:00',
						},
						{
							source_id: 'mark',
							target_id: 'mark',
							relation_type: 'self',
							weight: 1.0,
							created_at: '2026-01-01T00:00:00',
						},
					],
				} satisfies KnowledgeGraphData),
				insertRelations: vi.fn().mockResolvedValue(1),
			});
			const migrator = createMigrator(deps);
			const result = await migrator.run();

			// Only 1 relation should be inserted (orphan filtered)
			expect(result.relations).toBe(1);
			expect(result.orphanedRelations).toBe(1);
		});

		it('should handle empty chroma memories', async () => {
			const deps = createMockDeps({
				extractChromaMemories: vi.fn().mockResolvedValue([]),
				embedBatch: vi.fn().mockResolvedValue([]),
				insertMemories: vi.fn().mockResolvedValue(0),
			});
			const migrator = createMigrator(deps);
			const result = await migrator.run();

			expect(result.success).toBe(true);
			expect(result.memories).toBe(0);
			expect(deps.embedBatch).not.toHaveBeenCalled();
		});

		it('should handle empty knowledge graph', async () => {
			const deps = createMockDeps({
				loadKnowledgeGraph: vi.fn().mockResolvedValue({
					entities: [],
					relations: [],
				} satisfies KnowledgeGraphData),
				insertEntities: vi.fn().mockResolvedValue(0),
				insertRelations: vi.fn().mockResolvedValue(0),
			});
			const migrator = createMigrator(deps);
			const result = await migrator.run();

			expect(result.success).toBe(true);
			expect(result.entities).toBe(0);
			expect(result.relations).toBe(0);
		});

		it('should propagate extraction errors', async () => {
			const deps = createMockDeps({
				extractSessions: vi.fn().mockRejectedValue(new Error('SQLite read failed')),
			});
			const migrator = createMigrator(deps);

			await expect(migrator.run()).rejects.toThrow('SQLite read failed');
		});

		it('should propagate embedding errors', async () => {
			const deps = createMockDeps({
				embedBatch: vi.fn().mockRejectedValue(new Error('API rate limited')),
			});
			const migrator = createMigrator(deps);

			await expect(migrator.run()).rejects.toThrow('API rate limited');
		});

		it('should propagate insert errors', async () => {
			const deps = createMockDeps({
				insertSessions: vi.fn().mockRejectedValue(new Error('PG connection failed')),
			});
			const migrator = createMigrator(deps);

			await expect(migrator.run()).rejects.toThrow('PG connection failed');
		});

		it('should skip session summaries when no summaries exist', async () => {
			const deps = createMockDeps({
				extractSessions: vi.fn().mockResolvedValue([
					{
						id: 1,
						session_id: 'sess-001',
						summary: null,
						key_topics: null,
						emotional_tone: null,
						turn_count: 0,
						started_at: '2026-01-15T10:00:00',
						ended_at: null,
						created_at: '2026-01-15T10:00:00',
					},
				] satisfies AxnmihnSession[]),
				insertSessionSummaries: vi.fn().mockResolvedValue(0),
			});
			const migrator = createMigrator(deps);
			const result = await migrator.run();

			expect(result.sessionSummaries).toBe(0);
		});

		it('should log progress messages', async () => {
			const deps = createMockDeps();
			const migrator = createMigrator(deps);
			await migrator.run();

			expect(deps.log).toHaveBeenCalledWith(expect.stringContaining('Extracting'));
		});
	});

	describe('dry-run mode', () => {
		it('should validate without inserting', async () => {
			const deps = createMockDeps();
			const migrator = createMigrator(deps);
			const result = await migrator.dryRun();

			expect(result.sessions).toBe(1);
			expect(result.messages).toBe(2);
			expect(result.memories).toBe(1);
			expect(result.entities).toBe(1);

			// Insert functions should NOT be called
			expect(deps.insertSessions).not.toHaveBeenCalled();
			expect(deps.insertMessages).not.toHaveBeenCalled();
			expect(deps.insertMemories).not.toHaveBeenCalled();
			expect(deps.insertEntities).not.toHaveBeenCalled();
			expect(deps.insertRelations).not.toHaveBeenCalled();
		});
	});
});
