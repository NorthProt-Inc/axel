import { describe, expect, it } from 'vitest';
import type {
	AccessPattern,
	CreateSessionParams,
	DecayResult,
	Entity,
	GraphNode,
	HotMemory,
	MessageRecord,
	NewEntity,
	NewMemory,
	NewRelation,
	Relation,
	ScoredMemory,
	SemanticQuery,
	StreamEvent,
	StreamEventType,
	Turn,
} from '../../src/memory/types.js';
import type { ComponentHealth } from '../../src/types/health.js';
import type { Memory, MemorySearchResult, MemoryType } from '../../src/types/memory.js';
import type { MessageRole } from '../../src/types/message.js';
import type { SessionSummary } from '../../src/types/session.js';

describe('Memory Layer Types', () => {
	describe('StreamEvent', () => {
		it('should have all required fields', () => {
			const event: StreamEvent = {
				eventId: 'stream-001',
				type: 'typing_start',
				userId: 'user-1',
				channelId: 'discord-123',
				timestamp: new Date(),
				metadata: {},
			};
			expect(event.eventId).toBe('stream-001');
			expect(event.type).toBe('typing_start');
			expect(event.userId).toBe('user-1');
			expect(event.channelId).toBe('discord-123');
			expect(event.timestamp).toBeInstanceOf(Date);
			expect(event.metadata).toEqual({});
		});

		it('should support all stream event types', () => {
			const types: readonly StreamEventType[] = [
				'typing_start',
				'channel_switch',
				'iot_trigger',
				'presence_change',
			];
			expect(types).toHaveLength(4);
		});
	});

	describe('Turn', () => {
		it('should have all required fields', () => {
			const turn: Turn = {
				turnId: 1,
				role: 'user',
				content: 'Hello, Axel!',
				channelId: 'discord-123',
				timestamp: new Date(),
				tokenCount: 42,
			};
			expect(turn.turnId).toBe(1);
			expect(turn.role).toBe('user');
			expect(turn.content).toBe('Hello, Axel!');
			expect(turn.channelId).toBe('discord-123');
			expect(turn.tokenCount).toBe(42);
		});

		it('should support optional metadata', () => {
			const turn: Turn = {
				turnId: 1,
				role: 'assistant',
				content: 'Hello!',
				channelId: 'cli',
				timestamp: new Date(),
				tokenCount: 10,
				metadata: { model: 'claude-opus-4-6' },
			};
			expect(turn.metadata).toEqual({ model: 'claude-opus-4-6' });
		});

		it('should support all message roles', () => {
			const roles: readonly MessageRole[] = ['user', 'assistant', 'system', 'tool'];
			roles.forEach((role) => {
				const turn: Turn = {
					turnId: 0,
					role,
					content: '',
					channelId: '',
					timestamp: new Date(),
					tokenCount: 0,
				};
				expect(turn.role).toBe(role);
			});
		});
	});

	describe('CreateSessionParams', () => {
		it('should have required fields', () => {
			const params: CreateSessionParams = {
				userId: 'user-1',
				channelId: 'discord-123',
			};
			expect(params.userId).toBe('user-1');
			expect(params.channelId).toBe('discord-123');
		});

		it('should support optional metadata', () => {
			const params: CreateSessionParams = {
				userId: 'user-1',
				channelId: 'discord-123',
				metadata: { source: 'dm' },
			};
			expect(params.metadata).toEqual({ source: 'dm' });
		});
	});

	describe('MessageRecord', () => {
		it('should have all required fields', () => {
			const record: MessageRecord = {
				role: 'user',
				content: 'What is the weather?',
				channelId: 'telegram-456',
				timestamp: new Date(),
				tokenCount: 15,
			};
			expect(record.role).toBe('user');
			expect(record.content).toBe('What is the weather?');
			expect(record.channelId).toBe('telegram-456');
			expect(record.tokenCount).toBe(15);
		});
	});

	describe('SemanticQuery', () => {
		it('should have all required fields', () => {
			const query: SemanticQuery = {
				text: 'user preferences for music',
				embedding: new Float32Array(1536),
				limit: 10,
			};
			expect(query.text).toBe('user preferences for music');
			expect(query.embedding).toHaveLength(1536);
			expect(query.limit).toBe(10);
		});

		it('should support optional filter fields', () => {
			const query: SemanticQuery = {
				text: 'test',
				embedding: new Float32Array(1536),
				limit: 5,
				minImportance: 0.3,
				memoryTypes: ['fact', 'preference'],
				channelFilter: 'discord',
				hybridSearch: true,
			};
			expect(query.minImportance).toBe(0.3);
			expect(query.memoryTypes).toEqual(['fact', 'preference']);
			expect(query.channelFilter).toBe('discord');
			expect(query.hybridSearch).toBe(true);
		});
	});

	describe('ScoredMemory', () => {
		it('should contain memory with scoring breakdown', () => {
			const memory: Memory = {
				uuid: 'mem-001',
				content: 'User likes jazz',
				memoryType: 'preference',
				importance: 0.8,
				embedding: new Float32Array(1536),
				createdAt: new Date(),
				lastAccessed: new Date(),
				accessCount: 5,
				sourceChannel: 'discord',
				channelMentions: { discord: 3, telegram: 2 },
				sourceSession: 'sess-001',
				decayedImportance: 0.75,
				lastDecayedAt: new Date(),
			};
			const scored: ScoredMemory = {
				memory,
				vectorScore: 0.92,
				textScore: 0.78,
				finalScore: 0.878,
			};
			expect(scored.vectorScore).toBe(0.92);
			expect(scored.textScore).toBe(0.78);
			expect(scored.finalScore).toBe(0.878);
		});
	});

	describe('DecayResult', () => {
		it('should contain decay processing summary', () => {
			const result: DecayResult = {
				processed: 100,
				deleted: 5,
				minImportance: 0.04,
				maxImportance: 0.95,
				avgImportance: 0.42,
			};
			expect(result.processed).toBe(100);
			expect(result.deleted).toBe(5);
		});
	});

	describe('Entity types', () => {
		it('should create NewEntity', () => {
			const entity: NewEntity = {
				name: 'TypeScript',
				entityType: 'technology',
			};
			expect(entity.name).toBe('TypeScript');
			expect(entity.entityType).toBe('technology');
		});

		it('should create NewEntity with optional metadata', () => {
			const entity: NewEntity = {
				name: 'Mark',
				entityType: 'person',
				metadata: { role: 'operator' },
			};
			expect(entity.metadata).toEqual({ role: 'operator' });
		});

		it('should create Entity with all fields', () => {
			const entity: Entity = {
				entityId: 'ent-001',
				name: 'TypeScript',
				entityType: 'technology',
				mentionCount: 42,
				createdAt: new Date(),
				updatedAt: new Date(),
				metadata: {},
			};
			expect(entity.entityId).toBe('ent-001');
			expect(entity.mentionCount).toBe(42);
		});
	});

	describe('Relation types', () => {
		it('should create NewRelation', () => {
			const relation: NewRelation = {
				sourceId: 'ent-001',
				targetId: 'ent-002',
				relationType: 'uses',
				weight: 0.8,
			};
			expect(relation.sourceId).toBe('ent-001');
			expect(relation.relationType).toBe('uses');
			expect(relation.weight).toBe(0.8);
		});

		it('should create Relation with all fields', () => {
			const relation: Relation = {
				sourceId: 'ent-001',
				targetId: 'ent-002',
				relationType: 'uses',
				weight: 0.8,
				createdAt: new Date(),
			};
			expect(relation.createdAt).toBeInstanceOf(Date);
		});
	});

	describe('GraphNode', () => {
		it('should contain entity with traversal info', () => {
			const node: GraphNode = {
				entity: {
					entityId: 'ent-002',
					name: 'Node.js',
					entityType: 'technology',
					mentionCount: 10,
					createdAt: new Date(),
					updatedAt: new Date(),
					metadata: {},
				},
				relationType: 'runs_on',
				weight: 0.7,
				depth: 1,
			};
			expect(node.entity.name).toBe('Node.js');
			expect(node.depth).toBe(1);
		});
	});

	describe('AccessPattern', () => {
		it('should have all required fields', () => {
			const pattern: AccessPattern = {
				queryText: 'user music preferences',
				matchedMemoryIds: [1, 2, 3],
				relevanceScores: [0.95, 0.87, 0.72],
				channelId: 'discord-123',
			};
			expect(pattern.queryText).toBe('user music preferences');
			expect(pattern.matchedMemoryIds).toHaveLength(3);
			expect(pattern.relevanceScores).toHaveLength(3);
		});
	});

	describe('HotMemory', () => {
		it('should have all required fields', () => {
			const hot: HotMemory = {
				memoryId: 42,
				uuid: 'mem-042',
				content: 'Frequently accessed memory',
				accessCount: 150,
				channelDiversity: 3,
			};
			expect(hot.memoryId).toBe(42);
			expect(hot.accessCount).toBe(150);
			expect(hot.channelDiversity).toBe(3);
		});
	});

	describe('NewMemory', () => {
		it('should have required fields for creating a memory', () => {
			const newMem: NewMemory = {
				content: 'User prefers dark mode',
				memoryType: 'preference',
				importance: 0.7,
				embedding: new Float32Array(1536),
				sourceChannel: 'cli',
			};
			expect(newMem.content).toBe('User prefers dark mode');
			expect(newMem.memoryType).toBe('preference');
			expect(newMem.importance).toBe(0.7);
			expect(newMem.sourceChannel).toBe('cli');
		});

		it('should support optional sourceSession', () => {
			const newMem: NewMemory = {
				content: 'Test',
				memoryType: 'fact',
				importance: 0.5,
				embedding: new Float32Array(1536),
				sourceChannel: null,
				sourceSession: 'sess-001',
			};
			expect(newMem.sourceSession).toBe('sess-001');
		});
	});
});
