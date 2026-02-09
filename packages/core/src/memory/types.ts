import type { ComponentHealth } from '../types/health.js';
import type { Memory, MemoryType } from '../types/memory.js';
import type { MessageRole } from '../types/message.js';
import type { SessionSummary } from '../types/session.js';

// ─── Common Memory Layer Contract (ADR-013) ───

/** Layer name identifier for the 6-layer memory architecture */
export type MemoryLayerName =
	| 'M0:stream'
	| 'M1:working'
	| 'M2:episodic'
	| 'M3:semantic'
	| 'M4:conceptual'
	| 'M5:meta';

// ─── M0: Stream Buffer Types ───

/** Stream event type classification */
export type StreamEventType = 'typing_start' | 'channel_switch' | 'iot_trigger' | 'presence_change';

/** Real-time event in the stream buffer (M0) */
export interface StreamEvent {
	readonly eventId: string;
	readonly type: StreamEventType;
	readonly userId: string;
	readonly channelId: string;
	readonly timestamp: Date;
	readonly metadata: Readonly<Record<string, unknown>>;
}

/** M0 Stream Buffer interface (ADR-013) */
export interface StreamBuffer {
	readonly layerName: 'M0:stream';
	push(event: Omit<StreamEvent, 'eventId'>): Promise<string>;
	consume(count: number): AsyncGenerator<StreamEvent>;
	trim(maxLen: number): Promise<number>;
	healthCheck(): Promise<ComponentHealth>;
}

// ─── M1: Working Memory Types ───

/** Single conversation turn in working memory */
export interface Turn {
	readonly turnId: number;
	readonly role: MessageRole;
	readonly content: string;
	readonly channelId: string;
	readonly timestamp: Date;
	readonly tokenCount: number;
	readonly metadata?: Readonly<Record<string, unknown>>;
}

/** M1 Working Memory interface (ADR-013, ADR-003) */
export interface WorkingMemory {
	readonly layerName: 'M1:working';
	pushTurn(userId: string, turn: Turn): Promise<void>;
	getTurns(userId: string, limit: number): Promise<readonly Turn[]>;
	getSummary(userId: string): Promise<string | null>;
	compress(userId: string): Promise<void>;
	flush(userId: string): Promise<void>;
	clear(userId: string): Promise<void>;
	healthCheck(): Promise<ComponentHealth>;
}

// ─── M2: Episodic Memory Types ───

/** Parameters for creating a new session */
export interface CreateSessionParams {
	readonly userId: string;
	readonly channelId: string;
	readonly metadata?: Readonly<Record<string, unknown>>;
}

/** Message record for episodic storage */
export interface MessageRecord {
	readonly role: MessageRole;
	readonly content: string;
	readonly channelId: string;
	readonly timestamp: Date;
	readonly tokenCount: number;
}

/** Session list entry for UI display */
export interface SessionListInfo {
	readonly sessionId: string;
	readonly title: string;
	readonly channelId: string;
	readonly turnCount: number;
	readonly startedAt: Date;
	readonly endedAt: Date | null;
}

/** M2 Episodic Memory interface (ADR-013) */
export interface EpisodicMemory {
	readonly layerName: 'M2:episodic';
	createSession(params: CreateSessionParams): Promise<string>;
	endSession(sessionId: string, summary: string): Promise<void>;
	addMessage(sessionId: string, message: MessageRecord): Promise<void>;
	getRecentSessions(userId: string, limit: number): Promise<readonly SessionSummary[]>;
	getSessionMessages(sessionId: string): Promise<readonly MessageRecord[]>;
	listSessions(userId: string, limit?: number): Promise<readonly SessionListInfo[]>;
	searchByTopic(topic: string, limit: number): Promise<readonly SessionSummary[]>;
	searchByContent(query: string, limit: number): Promise<readonly MessageRecord[]>;
	healthCheck(): Promise<ComponentHealth>;
}

// ─── M3: Semantic Memory Types ───

/** Input for creating a new semantic memory */
export interface NewMemory {
	readonly content: string;
	readonly memoryType: MemoryType;
	readonly importance: number;
	readonly embedding: Float32Array;
	readonly sourceChannel: string | null;
	readonly sourceSession?: string | null;
}

/** Query parameters for semantic search */
export interface SemanticQuery {
	readonly text: string;
	readonly embedding: Float32Array;
	readonly limit: number;
	readonly minImportance?: number;
	readonly memoryTypes?: readonly MemoryType[];
	readonly channelFilter?: string;
	readonly hybridSearch?: boolean;
}

/** Memory with relevance scoring breakdown */
export interface ScoredMemory {
	readonly memory: Memory;
	readonly vectorScore: number;
	readonly textScore: number;
	readonly finalScore: number;
}

/** Result of a decay processing run */
export interface DecayResult {
	readonly processed: number;
	readonly deleted: number;
	readonly minImportance: number;
	readonly maxImportance: number;
	readonly avgImportance: number;
}

/** Decay run configuration */
export interface DecayRunConfig {
	readonly threshold: number;
}

/** M3 Semantic Memory interface (ADR-013, ADR-016) */
export interface SemanticMemory {
	readonly layerName: 'M3:semantic';
	store(memory: NewMemory): Promise<string>;
	search(query: SemanticQuery): Promise<readonly ScoredMemory[]>;
	decay(config: DecayRunConfig): Promise<DecayResult>;
	delete(uuid: string): Promise<void>;
	getByUuid(uuid: string): Promise<Memory | null>;
	updateAccess(uuid: string): Promise<void>;
	healthCheck(): Promise<ComponentHealth>;
}

// ─── M4: Conceptual Memory Types ───

/** Input for creating a new entity */
export interface NewEntity {
	readonly name: string;
	readonly entityType: string;
	readonly metadata?: Readonly<Record<string, unknown>>;
}

/** Stored entity with full metadata */
export interface Entity {
	readonly entityId: string;
	readonly name: string;
	readonly entityType: string;
	readonly mentionCount: number;
	readonly createdAt: Date;
	readonly updatedAt: Date;
	readonly metadata: Readonly<Record<string, unknown>>;
}

/** Input for creating a relation between entities */
export interface NewRelation {
	readonly sourceId: string;
	readonly targetId: string;
	readonly relationType: string;
	readonly weight: number;
}

/** Stored relation */
export interface Relation {
	readonly sourceId: string;
	readonly targetId: string;
	readonly relationType: string;
	readonly weight: number;
	readonly createdAt: Date;
}

/** Node in a graph traversal result */
export interface GraphNode {
	readonly entity: Entity;
	readonly relationType: string;
	readonly weight: number;
	readonly depth: number;
}

/** M4 Conceptual Memory interface (ADR-013) */
export interface ConceptualMemory {
	readonly layerName: 'M4:conceptual';
	addEntity(entity: NewEntity): Promise<string>;
	addRelation(relation: NewRelation): Promise<void>;
	traverse(entityId: string, maxDepth: number): Promise<readonly GraphNode[]>;
	findEntity(name: string): Promise<Entity | null>;
	getRelated(entityId: string, relationType?: string): Promise<readonly Entity[]>;
	incrementMentions(entityId: string): Promise<void>;
	healthCheck(): Promise<ComponentHealth>;
}

// ─── M5: Meta Memory Types ───

/** Recorded search access pattern */
export interface AccessPattern {
	readonly queryText: string;
	readonly matchedMemoryIds: readonly number[];
	readonly relevanceScores: readonly number[];
	readonly channelId: string;
}

/** Frequently accessed memory (from materialized view) */
export interface HotMemory {
	readonly memoryId: number;
	readonly uuid: string;
	readonly content: string;
	readonly accessCount: number;
	readonly channelDiversity: number;
}

/** M5 Meta Memory interface (ADR-013) */
export interface MetaMemory {
	readonly layerName: 'M5:meta';
	recordAccess(pattern: AccessPattern): Promise<void>;
	getHotMemories(limit: number): Promise<readonly HotMemory[]>;
	getPrefetchCandidates(userId: string, channelId: string): Promise<readonly string[]>;
	refreshView(): Promise<void>;
	pruneOldPatterns(olderThanDays: number): Promise<number>;
	healthCheck(): Promise<ComponentHealth>;
}
