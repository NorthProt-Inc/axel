// Stub — will be implemented in GREEN phase
export function validateSourceSessions(_sessions: readonly unknown[]): unknown {
	throw new Error('Not implemented');
}

export function validateSourceMessages(
	_messages: readonly unknown[],
	_sessionIds: ReadonlySet<string>,
): unknown {
	throw new Error('Not implemented');
}

export function validateKnowledgeGraph(
	_entities: readonly unknown[],
	_relations: readonly unknown[],
): unknown {
	throw new Error('Not implemented');
}

export function validateChromaMemories(_memories: readonly unknown[]): unknown {
	throw new Error('Not implemented');
}

export function filterOrphanedRelations(
	_relations: readonly unknown[],
	_entityIds: ReadonlySet<string>,
): readonly unknown[] {
	throw new Error('Not implemented');
}
