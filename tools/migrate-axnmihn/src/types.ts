/** Source session from axnmihn SQLite */
export interface AxnmihnSession {
	readonly id: number;
	readonly session_id: string;
	readonly summary: string | null;
	readonly key_topics: string | null;
	readonly emotional_tone: string | null;
	readonly turn_count: number;
	readonly started_at: string;
	readonly ended_at: string | null;
	readonly created_at: string;
}

/** Source message from axnmihn SQLite */
export interface AxnmihnMessage {
	readonly id: number;
	readonly session_id: string;
	readonly turn_id: number;
	readonly role: string;
	readonly content: string;
	readonly timestamp: string;
	readonly emotional_context: string | null;
}

/** Source interaction log from axnmihn SQLite */
export interface AxnmihnInteractionLog {
	readonly id: number;
	readonly ts: string;
	readonly conversation_id: string | null;
	readonly turn_id: number | null;
	readonly effective_model: string;
	readonly tier: string;
	readonly router_reason: string;
	readonly latency_ms: number | null;
	readonly ttft_ms: number | null;
	readonly tokens_in: number | null;
	readonly tokens_out: number | null;
	readonly tool_calls_json: string | null;
}

/** Memory extracted from ChromaDB */
export interface ChromaMemory {
	readonly id: string;
	readonly content: string;
	readonly metadata: {
		readonly memory_type?: string;
		readonly importance?: number;
		readonly created_at?: string;
		readonly last_accessed?: string;
		readonly access_count?: number;
	};
}

/** Knowledge graph entity from JSON */
export interface KnowledgeGraphEntity {
	readonly entity_id: string;
	readonly name: string;
	readonly entity_type: string;
	readonly properties: Record<string, unknown>;
	readonly mentions: number;
	readonly created_at: string;
	readonly last_accessed: string;
}

/** Knowledge graph relation from JSON */
export interface KnowledgeGraphRelation {
	readonly source_id: string;
	readonly target_id: string;
	readonly relation_type: string;
	readonly weight: number;
	readonly context?: string;
	readonly created_at: string;
}

/** Full knowledge graph data */
export interface KnowledgeGraphData {
	readonly entities: readonly KnowledgeGraphEntity[];
	readonly relations: readonly KnowledgeGraphRelation[];
}

/** Migration configuration */
export interface MigrationConfig {
	readonly axnmihnDataPath: string;
	readonly axnmihnDbPath: string;
	readonly axelDbUrl: string;
	readonly googleApiKey: string;
}

/** Transformed session for Axel PG */
export interface AxelSession {
	readonly session_id: string;
	readonly user_id: string;
	readonly channel_id: string;
	readonly channel_history: readonly string[];
	readonly turn_count: number;
	readonly started_at: string;
	readonly ended_at: string | null;
	readonly last_activity_at: string;
	readonly created_at: string;
}

/** Transformed session summary for Axel PG */
export interface AxelSessionSummary {
	readonly session_id: string;
	readonly summary: string | null;
	readonly key_topics: readonly string[];
	readonly emotional_tone: string | null;
	readonly created_at: string;
}

/** Transformed message for Axel PG */
export interface AxelMessage {
	readonly session_id: string;
	readonly turn_id: number;
	readonly role: string;
	readonly content: string;
	readonly channel_id: string;
	readonly timestamp: string;
	readonly created_at: string;
	readonly token_count: number;
	readonly emotional_context: string;
	readonly metadata: Record<string, unknown>;
}

/** Transformed interaction log for Axel PG */
export interface AxelInteractionLog {
	readonly ts: string;
	readonly session_id: string | null;
	readonly channel_id: string;
	readonly turn_id: number | null;
	readonly effective_model: string;
	readonly tier: string;
	readonly router_reason: string;
	readonly latency_ms: number | null;
	readonly ttft_ms: number | null;
	readonly tokens_in: number | null;
	readonly tokens_out: number | null;
	readonly tool_calls: unknown[];
	readonly error: string | null;
}

/** Transformed memory for Axel PG */
export interface AxelMemory {
	readonly content: string;
	readonly memory_type: string;
	readonly importance: number;
	readonly embedding: Float32Array;
	readonly created_at: string;
	readonly last_accessed: string;
	readonly access_count: number;
	readonly source_channel: string;
	readonly channel_mentions: Record<string, unknown>;
	readonly source_session: string | null;
}

/** Transformed entity for Axel PG */
export interface AxelEntity {
	readonly entity_id: string;
	readonly name: string;
	readonly entity_type: string;
	readonly properties: Record<string, unknown>;
	readonly mentions: number;
	readonly created_at: string;
	readonly last_accessed: string;
}

/** Transformed relation for Axel PG */
export interface AxelRelation {
	readonly source_id: string;
	readonly target_id: string;
	readonly relation_type: string;
	readonly weight: number;
	readonly context: string | null;
	readonly created_at: string;
}

/** Validation result */
export interface ValidationResult {
	readonly valid: boolean;
	readonly errors: readonly ValidationError[];
}

/** Single validation error */
export interface ValidationError {
	readonly type: string;
	readonly message: string;
	readonly context?: Record<string, unknown>;
}
