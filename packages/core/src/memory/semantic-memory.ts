import type { ComponentHealth } from '../types/health.js';
import type { Memory } from '../types/memory.js';
import type {
	DecayResult,
	DecayRunConfig,
	NewMemory,
	ScoredMemory,
	SemanticMemory,
	SemanticQuery,
} from './types.js';

/** In-memory stub for M3 Semantic Memory (ADR-013, ADR-016). Production uses pgvector. */
export class InMemorySemanticMemory implements SemanticMemory {
	readonly layerName = 'M3:semantic' as const;
	private readonly memories = new Map<string, Memory>();
	private nextId = 0;

	async store(newMemory: NewMemory): Promise<string> {
		const uuid = `mem-${++this.nextId}`;
		const now = new Date();
		const memory: Memory = {
			uuid,
			content: newMemory.content,
			memoryType: newMemory.memoryType,
			importance: newMemory.importance,
			embedding: newMemory.embedding,
			createdAt: now,
			lastAccessed: now,
			accessCount: 0,
			sourceChannel: newMemory.sourceChannel,
			channelMentions: {},
			sourceSession: newMemory.sourceSession ?? null,
			decayedImportance: null,
			lastDecayedAt: null,
		};
		this.memories.set(uuid, memory);
		return uuid;
	}

	async search(query: SemanticQuery): Promise<readonly ScoredMemory[]> {
		let results = [...this.memories.values()];

		if (query.minImportance !== undefined) {
			const min = query.minImportance;
			results = results.filter((m) => m.importance >= min);
		}

		if (query.memoryTypes && query.memoryTypes.length > 0) {
			const typeSet = new Set(query.memoryTypes);
			results = results.filter((m) => typeSet.has(m.memoryType));
		}

		if (query.channelFilter) {
			results = results.filter((m) => m.sourceChannel === query.channelFilter);
		}

		return results.slice(0, query.limit).map((memory) => {
			const textScore = this.textSimilarity(memory.content, query.text);
			const vectorScore = this.cosineSimilarity(memory.embedding, query.embedding);
			return {
				memory,
				vectorScore,
				textScore,
				finalScore: 0.7 * vectorScore + 0.3 * textScore,
			};
		});
	}

	async decay(config: DecayRunConfig): Promise<DecayResult> {
		const all = [...this.memories.values()];
		let deleted = 0;
		let minImportance = Number.POSITIVE_INFINITY;
		let maxImportance = Number.NEGATIVE_INFINITY;
		let totalImportance = 0;

		for (const memory of all) {
			if (memory.importance < config.threshold) {
				this.memories.delete(memory.uuid);
				deleted++;
			}
			if (memory.importance < minImportance) minImportance = memory.importance;
			if (memory.importance > maxImportance) maxImportance = memory.importance;
			totalImportance += memory.importance;
		}

		return {
			processed: all.length,
			deleted,
			minImportance: all.length > 0 ? minImportance : 0,
			maxImportance: all.length > 0 ? maxImportance : 0,
			avgImportance: all.length > 0 ? totalImportance / all.length : 0,
		};
	}

	async delete(uuid: string): Promise<void> {
		this.memories.delete(uuid);
	}

	async getByUuid(uuid: string): Promise<Memory | null> {
		return this.memories.get(uuid) ?? null;
	}

	async updateAccess(uuid: string): Promise<void> {
		const memory = this.memories.get(uuid);
		if (!memory) return;
		// Replace with updated memory (readonly interface, internal mutation)
		this.memories.set(uuid, {
			...memory,
			accessCount: memory.accessCount + 1,
			lastAccessed: new Date(),
		});
	}

	async healthCheck(): Promise<ComponentHealth> {
		return {
			state: 'healthy',
			latencyMs: 0,
			message: null,
			lastChecked: new Date(),
		};
	}

	private textSimilarity(content: string, query: string): number {
		const lower = content.toLowerCase();
		const lowerQuery = query.toLowerCase();
		if (lower.includes(lowerQuery)) return 1.0;
		const words = lowerQuery.split(/\s+/);
		const matches = words.filter((w) => lower.includes(w)).length;
		return words.length > 0 ? matches / words.length : 0;
	}

	private cosineSimilarity(a: Float32Array, b: Float32Array): number {
		if (a.length !== b.length || a.length === 0) return 0;
		let dot = 0;
		let normA = 0;
		let normB = 0;
		for (let i = 0; i < a.length; i++) {
			const ai = a[i] ?? 0;
			const bi = b[i] ?? 0;
			dot += ai * bi;
			normA += ai * ai;
			normB += bi * bi;
		}
		const denom = Math.sqrt(normA) * Math.sqrt(normB);
		return denom > 0 ? dot / denom : 0;
	}
}
