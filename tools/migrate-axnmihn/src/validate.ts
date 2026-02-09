import type {
	AxnmihnSession,
	AxnmihnMessage,
	ChromaMemory,
	KnowledgeGraphEntity,
	KnowledgeGraphRelation,
	ValidationResult,
	ValidationError,
} from './types.js';

const VALID_MEMORY_TYPES = new Set(['fact', 'preference', 'insight', 'conversation']);

/** Validate source sessions for duplicates and empty IDs. */
export function validateSourceSessions(sessions: readonly AxnmihnSession[]): ValidationResult {
	const errors: ValidationError[] = [];
	const seenIds = new Set<string>();

	for (const session of sessions) {
		if (session.session_id === '') {
			errors.push({
				type: 'empty_session_id',
				message: `Session id=${session.id} has empty session_id`,
			});
			continue;
		}
		if (seenIds.has(session.session_id)) {
			errors.push({
				type: 'duplicate_session_id',
				message: `Duplicate session_id: ${session.session_id}`,
				context: { session_id: session.session_id },
			});
		}
		seenIds.add(session.session_id);
	}

	return { valid: errors.length === 0, errors };
}

/** Validate source messages for orphaned references and empty content. */
export function validateSourceMessages(
	messages: readonly AxnmihnMessage[],
	sessionIds: ReadonlySet<string>,
): ValidationResult {
	const errors: ValidationError[] = [];

	for (const message of messages) {
		if (!sessionIds.has(message.session_id)) {
			errors.push({
				type: 'orphaned_message',
				message: `Message id=${message.id} references unknown session_id: ${message.session_id}`,
				context: { session_id: message.session_id, message_id: message.id },
			});
		}
		if (message.content === '') {
			errors.push({
				type: 'empty_content',
				message: `Message id=${message.id} has empty content`,
				context: { message_id: message.id },
			});
		}
	}

	return { valid: errors.length === 0, errors };
}

interface KnowledgeGraphValidation {
	readonly valid: boolean;
	readonly duplicateEntities: number;
	readonly orphanedRelations: number;
}

/** Validate knowledge graph for duplicate entities and orphaned relations. */
export function validateKnowledgeGraph(
	entities: readonly KnowledgeGraphEntity[],
	relations: readonly KnowledgeGraphRelation[],
): KnowledgeGraphValidation {
	const entityIds = new Set<string>();
	let duplicateEntities = 0;

	for (const entity of entities) {
		if (entityIds.has(entity.entity_id)) {
			duplicateEntities++;
		}
		entityIds.add(entity.entity_id);
	}

	let orphanedRelations = 0;
	for (const relation of relations) {
		if (!entityIds.has(relation.source_id) || !entityIds.has(relation.target_id)) {
			orphanedRelations++;
		}
	}

	return {
		valid: duplicateEntities === 0,
		duplicateEntities,
		orphanedRelations,
	};
}

/** Filter out relations that reference non-existent entities. */
export function filterOrphanedRelations(
	relations: readonly KnowledgeGraphRelation[],
	entityIds: ReadonlySet<string>,
): readonly KnowledgeGraphRelation[] {
	return relations.filter((r) => entityIds.has(r.source_id) && entityIds.has(r.target_id));
}

interface ChromaValidation {
	readonly valid: boolean;
	readonly emptyContent: number;
	readonly invalidImportance: number;
	readonly invalidType: number;
}

/** Validate ChromaDB memories for data quality. */
export function validateChromaMemories(memories: readonly ChromaMemory[]): ChromaValidation {
	let emptyContent = 0;
	let invalidImportance = 0;
	let invalidType = 0;

	for (const memory of memories) {
		if (memory.content === '') {
			emptyContent++;
		}
		const importance = memory.metadata.importance;
		if (
			importance !== undefined &&
			(typeof importance !== 'number' || importance < 0 || importance > 1)
		) {
			invalidImportance++;
		}
		const memoryType = memory.metadata.memory_type;
		if (memoryType !== undefined && !VALID_MEMORY_TYPES.has(memoryType)) {
			invalidType++;
		}
	}

	return {
		valid: emptyContent === 0 && invalidImportance === 0 && invalidType === 0,
		emptyContent,
		invalidImportance,
		invalidType,
	};
}
