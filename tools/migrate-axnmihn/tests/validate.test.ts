import { describe, it, expect } from 'vitest';
import {
	validateSourceSessions,
	validateSourceMessages,
	validateKnowledgeGraph,
	validateChromaMemories,
	filterOrphanedRelations,
} from '../src/validate.js';
import type {
	AxnmihnSession,
	AxnmihnMessage,
	ChromaMemory,
	KnowledgeGraphEntity,
	KnowledgeGraphRelation,
} from '../src/types.js';

describe('validate', () => {
	describe('validateSourceSessions', () => {
		it('should pass for valid sessions', () => {
			const sessions: readonly AxnmihnSession[] = [
				{
					id: 1,
					session_id: 'sess-001',
					summary: 'Test',
					key_topics: null,
					emotional_tone: null,
					turn_count: 5,
					started_at: '2026-01-15T10:00:00',
					ended_at: '2026-01-15T11:00:00',
					created_at: '2026-01-15T10:00:00',
				},
			];
			const result = validateSourceSessions(sessions);
			expect(result.valid).toBe(true);
			expect(result.errors).toHaveLength(0);
		});

		it('should detect duplicate session_ids', () => {
			const sessions: readonly AxnmihnSession[] = [
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
				{
					id: 2,
					session_id: 'sess-001',
					summary: null,
					key_topics: null,
					emotional_tone: null,
					turn_count: 0,
					started_at: '2026-01-16T10:00:00',
					ended_at: null,
					created_at: '2026-01-16T10:00:00',
				},
			];
			const result = validateSourceSessions(sessions);
			expect(result.valid).toBe(false);
			expect(result.errors).toContainEqual(
				expect.objectContaining({ type: 'duplicate_session_id' }),
			);
		});

		it('should detect empty session_id', () => {
			const sessions: readonly AxnmihnSession[] = [
				{
					id: 1,
					session_id: '',
					summary: null,
					key_topics: null,
					emotional_tone: null,
					turn_count: 0,
					started_at: '2026-01-15T10:00:00',
					ended_at: null,
					created_at: '2026-01-15T10:00:00',
				},
			];
			const result = validateSourceSessions(sessions);
			expect(result.valid).toBe(false);
			expect(result.errors).toContainEqual(
				expect.objectContaining({ type: 'empty_session_id' }),
			);
		});
	});

	describe('validateSourceMessages', () => {
		it('should pass for messages with valid session references', () => {
			const sessionIds = new Set(['sess-001']);
			const messages: readonly AxnmihnMessage[] = [
				{
					id: 1,
					session_id: 'sess-001',
					turn_id: 1,
					role: 'Mark',
					content: 'Hello',
					timestamp: '2026-01-15T10:05:00',
					emotional_context: null,
				},
			];
			const result = validateSourceMessages(messages, sessionIds);
			expect(result.valid).toBe(true);
			expect(result.errors).toHaveLength(0);
		});

		it('should detect orphaned messages', () => {
			const sessionIds = new Set(['sess-001']);
			const messages: readonly AxnmihnMessage[] = [
				{
					id: 1,
					session_id: 'sess-999',
					turn_id: 1,
					role: 'Mark',
					content: 'Hello',
					timestamp: '2026-01-15T10:05:00',
					emotional_context: null,
				},
			];
			const result = validateSourceMessages(messages, sessionIds);
			expect(result.valid).toBe(false);
			expect(result.errors).toContainEqual(
				expect.objectContaining({ type: 'orphaned_message' }),
			);
		});

		it('should detect empty content', () => {
			const sessionIds = new Set(['sess-001']);
			const messages: readonly AxnmihnMessage[] = [
				{
					id: 1,
					session_id: 'sess-001',
					turn_id: 1,
					role: 'Mark',
					content: '',
					timestamp: '2026-01-15T10:05:00',
					emotional_context: null,
				},
			];
			const result = validateSourceMessages(messages, sessionIds);
			expect(result.valid).toBe(false);
			expect(result.errors).toContainEqual(
				expect.objectContaining({ type: 'empty_content' }),
			);
		});
	});

	describe('validateKnowledgeGraph', () => {
		it('should pass for valid graph', () => {
			const entities: readonly KnowledgeGraphEntity[] = [
				{
					entity_id: 'mark',
					name: 'Mark',
					entity_type: 'person',
					properties: {},
					mentions: 1,
					created_at: '2026-01-01T00:00:00',
					last_accessed: '2026-01-01T00:00:00',
				},
				{
					entity_id: 'typescript',
					name: 'TypeScript',
					entity_type: 'technology',
					properties: {},
					mentions: 1,
					created_at: '2026-01-01T00:00:00',
					last_accessed: '2026-01-01T00:00:00',
				},
			];
			const relations: readonly KnowledgeGraphRelation[] = [
				{
					source_id: 'mark',
					target_id: 'typescript',
					relation_type: 'prefers',
					weight: 0.9,
					created_at: '2026-01-01T00:00:00',
				},
			];
			const result = validateKnowledgeGraph(entities, relations);
			expect(result.valid).toBe(true);
			expect(result.orphanedRelations).toBe(0);
		});

		it('should detect duplicate entity_ids', () => {
			const entities: readonly KnowledgeGraphEntity[] = [
				{
					entity_id: 'mark',
					name: 'Mark',
					entity_type: 'person',
					properties: {},
					mentions: 1,
					created_at: '2026-01-01T00:00:00',
					last_accessed: '2026-01-01T00:00:00',
				},
				{
					entity_id: 'mark',
					name: 'Mark 2',
					entity_type: 'person',
					properties: {},
					mentions: 1,
					created_at: '2026-01-01T00:00:00',
					last_accessed: '2026-01-01T00:00:00',
				},
			];
			const result = validateKnowledgeGraph(entities, []);
			expect(result.valid).toBe(false);
			expect(result.duplicateEntities).toBe(1);
		});

		it('should count orphaned relations', () => {
			const entities: readonly KnowledgeGraphEntity[] = [
				{
					entity_id: 'mark',
					name: 'Mark',
					entity_type: 'person',
					properties: {},
					mentions: 1,
					created_at: '2026-01-01T00:00:00',
					last_accessed: '2026-01-01T00:00:00',
				},
			];
			const relations: readonly KnowledgeGraphRelation[] = [
				{
					source_id: 'mark',
					target_id: 'nonexistent',
					relation_type: 'knows',
					weight: 0.5,
					created_at: '2026-01-01T00:00:00',
				},
			];
			const result = validateKnowledgeGraph(entities, relations);
			expect(result.orphanedRelations).toBe(1);
		});
	});

	describe('filterOrphanedRelations', () => {
		it('should remove relations with missing entity references', () => {
			const entityIds = new Set(['mark', 'typescript']);
			const relations: readonly KnowledgeGraphRelation[] = [
				{
					source_id: 'mark',
					target_id: 'typescript',
					relation_type: 'prefers',
					weight: 0.9,
					created_at: '2026-01-01T00:00:00',
				},
				{
					source_id: 'mark',
					target_id: 'nonexistent',
					relation_type: 'knows',
					weight: 0.5,
					created_at: '2026-01-01T00:00:00',
				},
				{
					source_id: 'nonexistent',
					target_id: 'mark',
					relation_type: 'follows',
					weight: 0.3,
					created_at: '2026-01-01T00:00:00',
				},
			];
			const result = filterOrphanedRelations(relations, entityIds);
			expect(result).toHaveLength(1);
			expect(result[0]!.relation_type).toBe('prefers');
		});

		it('should return all relations when none are orphaned', () => {
			const entityIds = new Set(['a', 'b']);
			const relations: readonly KnowledgeGraphRelation[] = [
				{
					source_id: 'a',
					target_id: 'b',
					relation_type: 'knows',
					weight: 1.0,
					created_at: '2026-01-01T00:00:00',
				},
			];
			const result = filterOrphanedRelations(relations, entityIds);
			expect(result).toHaveLength(1);
		});
	});

	describe('validateChromaMemories', () => {
		it('should pass for valid memories', () => {
			const memories: readonly ChromaMemory[] = [
				{
					id: 'mem-001',
					content: 'Valid memory content',
					metadata: { memory_type: 'fact', importance: 0.8 },
				},
			];
			const result = validateChromaMemories(memories);
			expect(result.valid).toBe(true);
			expect(result.emptyContent).toBe(0);
		});

		it('should detect empty content', () => {
			const memories: readonly ChromaMemory[] = [
				{
					id: 'mem-001',
					content: '',
					metadata: {},
				},
			];
			const result = validateChromaMemories(memories);
			expect(result.emptyContent).toBe(1);
		});

		it('should detect invalid importance values', () => {
			const memories: readonly ChromaMemory[] = [
				{
					id: 'mem-001',
					content: 'Valid',
					metadata: { importance: 1.5 },
				},
				{
					id: 'mem-002',
					content: 'Valid',
					metadata: { importance: -0.1 },
				},
			];
			const result = validateChromaMemories(memories);
			expect(result.invalidImportance).toBe(2);
		});

		it('should detect invalid memory_type values', () => {
			const memories: readonly ChromaMemory[] = [
				{
					id: 'mem-001',
					content: 'Valid',
					metadata: { memory_type: 'invalid_type' },
				},
			];
			const result = validateChromaMemories(memories);
			expect(result.invalidType).toBe(1);
		});
	});
});
