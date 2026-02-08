/** Memory type classification */
export type MemoryType = 'fact' | 'preference' | 'insight' | 'conversation';

/** Semantic Memory unit (Layer 3) */
export interface Memory {
	readonly uuid: string;
	readonly content: string;
	readonly memoryType: MemoryType;
	readonly importance: number;
	readonly embedding: Float32Array;
	readonly createdAt: Date;
	readonly lastAccessed: Date;
	readonly accessCount: number;
	readonly sourceChannel: string | null;
	readonly channelMentions: Readonly<Record<string, number>>;
	readonly sourceSession: string | null;
	readonly decayedImportance: number | null;
	readonly lastDecayedAt: Date | null;
}

/** Memory search result with relevance scoring */
export interface MemorySearchResult {
	readonly memory: Memory;
	readonly score: number;
	readonly source: 'semantic' | 'graph' | 'prefetch';
}
