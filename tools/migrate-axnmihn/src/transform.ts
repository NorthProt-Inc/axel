import type {
	AxnmihnSession,
	AxnmihnMessage,
	AxnmihnInteractionLog,
	ChromaMemory,
	KnowledgeGraphEntity,
	KnowledgeGraphRelation,
	AxelSession,
	AxelSessionSummary,
	AxelMessage,
	AxelInteractionLog,
	AxelMemory,
	AxelEntity,
	AxelRelation,
} from './types.js';

const VALID_MEMORY_TYPES = new Set(['fact', 'preference', 'insight', 'conversation']);

/** Map axnmihn role names to Axel standard roles. */
export function transformRole(role: string): string {
	switch (role) {
		case 'Mark':
			return 'user';
		case 'Axel':
			return 'assistant';
		case 'system':
			return 'system';
		case 'tool':
			return 'tool';
		default:
			return 'system';
	}
}

/** Estimate token count as ceil(length / 3) with minimum 1. */
export function estimateTokenCount(content: string): number {
	return Math.max(1, Math.ceil(content.length / 3));
}

/** Parse key_topics from various source formats. */
export function parseKeyTopics(raw: string | null): readonly string[] {
	if (raw === null || raw === '') return [];
	if (raw.startsWith('[')) {
		try {
			const parsed: unknown = JSON.parse(raw);
			if (Array.isArray(parsed)) {
				return parsed.filter((item): item is string => typeof item === 'string');
			}
		} catch {
			// Fall through to single-value treatment
		}
	}
	return [raw];
}

/** Transform a source session to Axel PG schema. */
export function transformSession(session: AxnmihnSession): AxelSession {
	return {
		session_id: session.session_id,
		user_id: 'mark',
		channel_id: 'cli',
		channel_history: ['cli'],
		turn_count: session.turn_count,
		started_at: session.started_at,
		ended_at: session.ended_at,
		last_activity_at: session.ended_at ?? session.started_at,
		created_at: session.created_at,
	};
}

/** Extract session summary if any summary data exists. Returns null if no data. */
export function transformSessionSummary(
	session: AxnmihnSession,
): AxelSessionSummary | null {
	if (
		session.summary === null &&
		session.key_topics === null &&
		session.emotional_tone === null
	) {
		return null;
	}
	return {
		session_id: session.session_id,
		summary: session.summary,
		key_topics: parseKeyTopics(session.key_topics),
		emotional_tone: session.emotional_tone,
		created_at: session.created_at,
	};
}

/** Transform a source message to Axel PG schema. */
export function transformMessage(message: AxnmihnMessage): AxelMessage {
	return {
		session_id: message.session_id,
		turn_id: message.turn_id,
		role: transformRole(message.role),
		content: message.content,
		channel_id: 'cli',
		timestamp: message.timestamp,
		created_at: message.timestamp,
		token_count: estimateTokenCount(message.content),
		emotional_context: message.emotional_context ?? 'neutral',
		metadata: {},
	};
}

/** Transform a source interaction log to Axel PG schema. */
export function transformInteractionLog(
	log: AxnmihnInteractionLog,
): AxelInteractionLog {
	let toolCalls: unknown[] = [];
	if (log.tool_calls_json !== null && log.tool_calls_json !== '') {
		try {
			const parsed: unknown = JSON.parse(log.tool_calls_json);
			if (Array.isArray(parsed)) {
				toolCalls = parsed;
			}
		} catch {
			toolCalls = [];
		}
	}

	return {
		ts: log.ts,
		session_id: log.conversation_id,
		channel_id: 'cli',
		turn_id: log.turn_id,
		effective_model: log.effective_model,
		tier: log.tier,
		router_reason: log.router_reason,
		latency_ms: log.latency_ms,
		ttft_ms: log.ttft_ms,
		tokens_in: log.tokens_in,
		tokens_out: log.tokens_out,
		tool_calls: toolCalls,
		error: null,
	};
}

/** Transform a ChromaDB memory + new embedding to Axel PG schema. */
export function transformMemory(
	memory: ChromaMemory,
	embedding: Float32Array,
): AxelMemory {
	const memoryType = memory.metadata.memory_type;
	return {
		content: memory.content,
		memory_type:
			typeof memoryType === 'string' && VALID_MEMORY_TYPES.has(memoryType)
				? memoryType
				: 'conversation',
		importance: memory.metadata.importance ?? 0.5,
		embedding,
		created_at: memory.metadata.created_at ?? new Date().toISOString(),
		last_accessed: memory.metadata.last_accessed ?? new Date().toISOString(),
		access_count: memory.metadata.access_count ?? 1,
		source_channel: 'cli',
		channel_mentions: {},
		source_session: null,
	};
}

/** Transform a knowledge graph entity to Axel PG schema. */
export function transformEntity(entity: KnowledgeGraphEntity): AxelEntity {
	return {
		entity_id: entity.entity_id,
		name: entity.name,
		entity_type: entity.entity_type,
		properties: entity.properties,
		mentions: entity.mentions,
		created_at: entity.created_at,
		last_accessed: entity.last_accessed,
	};
}

/** Transform a knowledge graph relation to Axel PG schema. */
export function transformRelation(relation: KnowledgeGraphRelation): AxelRelation {
	return {
		source_id: relation.source_id,
		target_id: relation.target_id,
		relation_type: relation.relation_type,
		weight: relation.weight,
		context: relation.context ?? null,
		created_at: relation.created_at,
	};
}
