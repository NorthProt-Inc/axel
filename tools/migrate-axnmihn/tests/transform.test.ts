import { describe, expect, it } from 'vitest';
import {
	estimateTokenCount,
	parseKeyTopics,
	transformEntity,
	transformInteractionLog,
	transformMemory,
	transformMessage,
	transformRelation,
	transformRole,
	transformSession,
	transformSessionSummary,
} from '../src/transform.js';
import type {
	AxnmihnInteractionLog,
	AxnmihnMessage,
	AxnmihnSession,
	ChromaMemory,
	KnowledgeGraphEntity,
	KnowledgeGraphRelation,
} from '../src/types.js';

describe('transform', () => {
	describe('transformRole', () => {
		it('should convert Mark to user', () => {
			expect(transformRole('Mark')).toBe('user');
		});

		it('should convert Axel to assistant', () => {
			expect(transformRole('Axel')).toBe('assistant');
		});

		it('should fallback unknown roles to system', () => {
			expect(transformRole('system')).toBe('system');
			expect(transformRole('tool')).toBe('tool');
			expect(transformRole('unknown')).toBe('system');
		});
	});

	describe('estimateTokenCount', () => {
		it('should estimate tokens as length / 3 with minimum 1', () => {
			expect(estimateTokenCount('hello')).toBe(2); // 5/3 = 1.67 → 2
			expect(estimateTokenCount('')).toBe(1); // minimum 1
			expect(estimateTokenCount('a')).toBe(1); // 1/3 = 0.33 → 1
		});

		it('should handle long content', () => {
			const content = 'a'.repeat(300);
			expect(estimateTokenCount(content)).toBe(100); // 300/3 = 100
		});
	});

	describe('parseKeyTopics', () => {
		it('should parse JSON array string', () => {
			expect(parseKeyTopics('["topic1","topic2"]')).toEqual(['topic1', 'topic2']);
		});

		it('should wrap single string as array', () => {
			expect(parseKeyTopics('single topic')).toEqual(['single topic']);
		});

		it('should return empty array for null', () => {
			expect(parseKeyTopics(null)).toEqual([]);
		});

		it('should return empty array for empty string', () => {
			expect(parseKeyTopics('')).toEqual([]);
		});

		it('should handle comma-separated string', () => {
			// If not valid JSON array, treat as single value
			expect(parseKeyTopics('topic1, topic2')).toEqual(['topic1, topic2']);
		});
	});

	describe('transformSession', () => {
		const sourceSession: AxnmihnSession = {
			id: 1,
			session_id: 'sess-001',
			summary: 'A test session',
			key_topics: '["TypeScript","Axel"]',
			emotional_tone: 'positive',
			turn_count: 10,
			started_at: '2026-01-15T10:00:00',
			ended_at: '2026-01-15T11:00:00',
			created_at: '2026-01-15T10:00:00',
		};

		it('should map session fields to Axel schema', () => {
			const result = transformSession(sourceSession);
			expect(result.session_id).toBe('sess-001');
			expect(result.user_id).toBe('mark');
			expect(result.channel_id).toBe('cli');
			expect(result.channel_history).toEqual(['cli']);
			expect(result.turn_count).toBe(10);
		});

		it('should derive last_activity_at from ended_at', () => {
			const result = transformSession(sourceSession);
			expect(result.last_activity_at).toBe('2026-01-15T11:00:00');
		});

		it('should use started_at as last_activity_at when ended_at is null', () => {
			const openSession: AxnmihnSession = {
				...sourceSession,
				ended_at: null,
			};
			const result = transformSession(openSession);
			expect(result.last_activity_at).toBe('2026-01-15T10:00:00');
		});
	});

	describe('transformSessionSummary', () => {
		it('should extract summary fields from source session', () => {
			const source: AxnmihnSession = {
				id: 1,
				session_id: 'sess-001',
				summary: 'Test summary',
				key_topics: '["topic1"]',
				emotional_tone: 'neutral',
				turn_count: 5,
				started_at: '2026-01-15T10:00:00',
				ended_at: null,
				created_at: '2026-01-15T10:00:00',
			};
			const result = transformSessionSummary(source);
			expect(result).not.toBeNull();
			expect(result?.session_id).toBe('sess-001');
			expect(result?.summary).toBe('Test summary');
			expect(result?.key_topics).toEqual(['topic1']);
			expect(result?.emotional_tone).toBe('neutral');
		});

		it('should return null when no summary data exists', () => {
			const source: AxnmihnSession = {
				id: 1,
				session_id: 'sess-001',
				summary: null,
				key_topics: null,
				emotional_tone: null,
				turn_count: 5,
				started_at: '2026-01-15T10:00:00',
				ended_at: null,
				created_at: '2026-01-15T10:00:00',
			};
			const result = transformSessionSummary(source);
			expect(result).toBeNull();
		});
	});

	describe('transformMessage', () => {
		const sourceMessage: AxnmihnMessage = {
			id: 1,
			session_id: 'sess-001',
			turn_id: 1,
			role: 'Mark',
			content: 'Hello, Axel! How are you today?',
			timestamp: '2026-01-15T10:05:00',
			emotional_context: 'happy',
		};

		it('should transform role from Mark to user', () => {
			const result = transformMessage(sourceMessage);
			expect(result.role).toBe('user');
		});

		it('should map all fields correctly', () => {
			const result = transformMessage(sourceMessage);
			expect(result.session_id).toBe('sess-001');
			expect(result.turn_id).toBe(1);
			expect(result.content).toBe('Hello, Axel! How are you today?');
			expect(result.channel_id).toBe('cli');
			expect(result.emotional_context).toBe('happy');
		});

		it('should estimate token count from content', () => {
			const result = transformMessage(sourceMessage);
			expect(result.token_count).toBeGreaterThanOrEqual(1);
		});

		it('should default emotional_context to neutral when null', () => {
			const msg: AxnmihnMessage = {
				...sourceMessage,
				emotional_context: null,
			};
			const result = transformMessage(msg);
			expect(result.emotional_context).toBe('neutral');
		});

		it('should set created_at from timestamp', () => {
			const result = transformMessage(sourceMessage);
			expect(result.created_at).toBe(sourceMessage.timestamp);
		});
	});

	describe('transformInteractionLog', () => {
		const sourceLog: AxnmihnInteractionLog = {
			id: 1,
			ts: '2026-01-15T10:05:00',
			conversation_id: 'sess-001',
			turn_id: 1,
			effective_model: 'claude-3-haiku',
			tier: 'haiku',
			router_reason: 'simple query',
			latency_ms: 450,
			ttft_ms: 120,
			tokens_in: 500,
			tokens_out: 200,
			tool_calls_json: '[{"name":"search","args":{}}]',
		};

		it('should rename conversation_id to session_id', () => {
			const result = transformInteractionLog(sourceLog);
			expect(result.session_id).toBe('sess-001');
		});

		it('should parse tool_calls_json to JSONB-ready array', () => {
			const result = transformInteractionLog(sourceLog);
			expect(result.tool_calls).toEqual([{ name: 'search', args: {} }]);
		});

		it('should default tool_calls to empty array when null', () => {
			const log: AxnmihnInteractionLog = {
				...sourceLog,
				tool_calls_json: null,
			};
			const result = transformInteractionLog(log);
			expect(result.tool_calls).toEqual([]);
		});

		it('should default tool_calls to empty array when empty string', () => {
			const log: AxnmihnInteractionLog = {
				...sourceLog,
				tool_calls_json: '',
			};
			const result = transformInteractionLog(log);
			expect(result.tool_calls).toEqual([]);
		});

		it('should set channel_id to cli', () => {
			const result = transformInteractionLog(sourceLog);
			expect(result.channel_id).toBe('cli');
		});

		it('should handle null conversation_id', () => {
			const log: AxnmihnInteractionLog = {
				...sourceLog,
				conversation_id: null,
			};
			const result = transformInteractionLog(log);
			expect(result.session_id).toBeNull();
		});
	});

	describe('transformMemory', () => {
		const sourceMemory: ChromaMemory = {
			id: 'mem-001',
			content: 'Mark prefers TypeScript',
			metadata: {
				memory_type: 'preference',
				importance: 0.8,
				created_at: '2026-01-10T12:00:00',
				last_accessed: '2026-02-01T08:00:00',
				access_count: 5,
			},
		};

		it('should map content and metadata', () => {
			const embedding = new Float32Array(1536);
			const result = transformMemory(sourceMemory, embedding);
			expect(result.content).toBe('Mark prefers TypeScript');
			expect(result.memory_type).toBe('preference');
			expect(result.importance).toBe(0.8);
		});

		it('should include new 1536d embedding', () => {
			const embedding = new Float32Array(1536);
			embedding[0] = 0.1;
			const result = transformMemory(sourceMemory, embedding);
			expect(result.embedding).toBe(embedding);
			expect(result.embedding.length).toBe(1536);
		});

		it('should set source_channel to cli', () => {
			const embedding = new Float32Array(1536);
			const result = transformMemory(sourceMemory, embedding);
			expect(result.source_channel).toBe('cli');
		});

		it('should handle missing metadata fields with defaults', () => {
			const sparse: ChromaMemory = {
				id: 'mem-002',
				content: 'Some memory',
				metadata: {},
			};
			const embedding = new Float32Array(1536);
			const result = transformMemory(sparse, embedding);
			expect(result.memory_type).toBe('conversation');
			expect(result.importance).toBe(0.5);
			expect(result.access_count).toBe(1);
		});
	});

	describe('transformEntity', () => {
		const sourceEntity: KnowledgeGraphEntity = {
			entity_id: 'mark',
			name: 'Mark',
			entity_type: 'person',
			properties: { role: 'developer' },
			mentions: 42,
			created_at: '2026-01-01T00:00:00',
			last_accessed: '2026-02-01T00:00:00',
		};

		it('should pass through entity fields', () => {
			const result = transformEntity(sourceEntity);
			expect(result.entity_id).toBe('mark');
			expect(result.name).toBe('Mark');
			expect(result.entity_type).toBe('person');
			expect(result.properties).toEqual({ role: 'developer' });
			expect(result.mentions).toBe(42);
		});
	});

	describe('transformRelation', () => {
		const sourceRelation: KnowledgeGraphRelation = {
			source_id: 'mark',
			target_id: 'typescript',
			relation_type: 'prefers',
			weight: 0.9,
			context: 'programming language preference',
			created_at: '2026-01-05T00:00:00',
		};

		it('should pass through relation fields', () => {
			const result = transformRelation(sourceRelation);
			expect(result.source_id).toBe('mark');
			expect(result.target_id).toBe('typescript');
			expect(result.relation_type).toBe('prefers');
			expect(result.weight).toBe(0.9);
			expect(result.context).toBe('programming language preference');
		});

		it('should handle null context', () => {
			const rel: KnowledgeGraphRelation = {
				...sourceRelation,
				context: undefined,
			};
			const result = transformRelation(rel);
			expect(result.context).toBeNull();
		});
	});
});
