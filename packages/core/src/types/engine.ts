import type { MemorySearchResult, MemoryType } from './memory.js';

/** Memory system statistics */
export interface MemoryStats {
	readonly totalMemories: number;
	readonly byType: Readonly<Record<MemoryType, number>>;
	readonly avgImportance: number;
	readonly oldestMemory: Date | null;
	readonly lastConsolidation: Date | null;
}

/** Memory Engine interface (DI target) */
export interface MemoryEngine {
	store(
		content: string,
		memoryType: MemoryType,
		importance: number,
		channelId: string | null,
	): Promise<string>;

	search(query: string, limit: number, channelId?: string): Promise<readonly MemorySearchResult[]>;

	decay(threshold: number): Promise<number>;

	consolidate(): Promise<void>;

	getStats(): Promise<MemoryStats>;
}
