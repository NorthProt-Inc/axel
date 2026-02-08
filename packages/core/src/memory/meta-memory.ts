import type { ComponentHealth } from '../types/health.js';
import type { MetaMemory, AccessPattern, HotMemory } from './types.js';

interface MemoryAccessStats {
	accessCount: number;
	channels: Set<string>;
}

/** In-memory stub for M5 Meta Memory (ADR-013). Production uses PostgreSQL MV. */
export class InMemoryMetaMemory implements MetaMemory {
	readonly layerName = 'M5:meta' as const;
	private readonly patterns: AccessPattern[] = [];
	private readonly memoryStats = new Map<number, MemoryAccessStats>();

	async recordAccess(pattern: AccessPattern): Promise<void> {
		this.patterns.push(pattern);
		for (const memId of pattern.matchedMemoryIds) {
			const stats = this.memoryStats.get(memId);
			if (stats) {
				stats.accessCount++;
				stats.channels.add(pattern.channelId);
			} else {
				this.memoryStats.set(memId, {
					accessCount: 1,
					channels: new Set([pattern.channelId]),
				});
			}
		}
	}

	async getHotMemories(limit: number): Promise<readonly HotMemory[]> {
		const entries = [...this.memoryStats.entries()]
			.sort((a, b) => b[1].accessCount - a[1].accessCount)
			.slice(0, limit);

		return entries.map(([memoryId, stats]) => ({
			memoryId,
			uuid: `mem-${memoryId}`,
			content: '',
			accessCount: stats.accessCount,
			channelDiversity: stats.channels.size,
		}));
	}

	async getPrefetchCandidates(
		_userId: string,
		_channelId: string,
	): Promise<readonly string[]> {
		// In-memory stub: return memory UUIDs from recent patterns
		if (this.patterns.length === 0) return [];
		const recentIds = new Set<string>();
		const recent = this.patterns.slice(-5);
		for (const p of recent) {
			for (const id of p.matchedMemoryIds) {
				recentIds.add(`mem-${id}`);
			}
		}
		return [...recentIds];
	}

	async refreshView(): Promise<void> {
		// No-op in memory stub. Production: REFRESH MATERIALIZED VIEW CONCURRENTLY.
	}

	async pruneOldPatterns(_olderThanDays: number): Promise<number> {
		// In-memory stub: no timestamp tracking, return 0
		return 0;
	}

	async healthCheck(): Promise<ComponentHealth> {
		return {
			state: 'healthy',
			latencyMs: 0,
			message: null,
			lastChecked: new Date(),
		};
	}
}
