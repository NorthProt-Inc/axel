import type { NewMemory, SemanticMemory } from '@axel/core/memory';

/**
 * Minimal embedding provider interface (subset of GeminiEmbeddingService).
 *
 * Decoupled from concrete Gemini types to allow testing with mocks
 * and future provider swaps.
 */
export interface EmbeddingProvider {
	embed(text: string): Promise<Float32Array>;
}

/** Heuristic configuration for importance scoring */
export interface ImportanceConfig {
	readonly minContentLength: number;
	readonly keywords: readonly string[];
	readonly baseImportance: number;
	readonly keywordBoost: number;
	readonly lengthBoost: number;
	readonly lengthThreshold: number;
}

/** Input parameters for storing a conversation memory */
export interface StoreConversationParams {
	readonly userContent: string;
	readonly assistantContent: string;
	readonly channelId: string;
	readonly sessionId: string;
}

const DEFAULT_IMPORTANCE_CONFIG: ImportanceConfig = {
	minContentLength: 100,
	keywords: ['remember', 'important', '기억', '중요'],
	baseImportance: 0.5,
	keywordBoost: 0.2,
	lengthBoost: 0.1,
	lengthThreshold: 500,
};

/**
 * Bridges embedding generation and semantic memory storage (M3).
 *
 * Resolves RES-007 ROOT CAUSE #3: M3 semantic store write path
 * was completely disconnected. This adapter provides a simple
 * `storeConversationMemory()` entry point that:
 *
 * 1. Evaluates importance heuristic (length + keywords)
 * 2. Generates embedding via EmbeddingProvider
 * 3. Stores to SemanticMemory (PG pgvector)
 *
 * Failures are caught and reported via optional onError callback —
 * memory persistence must never break the response flow.
 */
class SemanticMemoryWriter {
	private readonly embeddingProvider: EmbeddingProvider;
	private readonly semanticMemory: SemanticMemory;
	private readonly config: ImportanceConfig;
	private readonly onError: ((error: unknown) => void) | undefined;

	constructor(
		embeddingProvider: EmbeddingProvider,
		semanticMemory: SemanticMemory,
		config?: ImportanceConfig,
		onError?: (error: unknown) => void,
	) {
		this.embeddingProvider = embeddingProvider;
		this.semanticMemory = semanticMemory;
		this.config = config ?? DEFAULT_IMPORTANCE_CONFIG;
		this.onError = onError;
	}

	/**
	 * Evaluate and store a conversation turn to M3 semantic memory.
	 *
	 * Returns the stored memory UUID, or null if the content was
	 * deemed unimportant or if an error occurred.
	 */
	async storeConversationMemory(params: StoreConversationParams): Promise<string | null> {
		const { userContent, assistantContent, channelId, sessionId } = params;

		const importance = this.calculateImportance(userContent);
		if (!this.shouldStore(userContent, importance)) {
			return null;
		}

		try {
			const combinedText = `${userContent}\n\n${assistantContent}`;
			const embedding = await this.embeddingProvider.embed(combinedText);

			const newMemory: NewMemory = {
				content: combinedText,
				memoryType: 'conversation',
				importance,
				embedding,
				sourceChannel: channelId,
				sourceSession: sessionId,
			};

			return await this.semanticMemory.store(newMemory);
		} catch (error: unknown) {
			this.reportError(error);
			return null;
		}
	}

	private shouldStore(content: string, importance: number): boolean {
		if (content.length >= this.config.minContentLength) {
			return true;
		}
		return importance > this.config.baseImportance;
	}

	private calculateImportance(content: string): number {
		let importance = this.config.baseImportance;
		const lowerContent = content.toLowerCase();

		for (const keyword of this.config.keywords) {
			if (lowerContent.includes(keyword.toLowerCase())) {
				importance += this.config.keywordBoost;
			}
		}

		if (content.length >= this.config.lengthThreshold) {
			importance += this.config.lengthBoost;
		}

		return Math.min(importance, 1.0);
	}

	private reportError(error: unknown): void {
		if (!this.onError) return;
		try {
			this.onError(error);
		} catch {
			// onError itself failed — silently ignore
		}
	}
}

export { SemanticMemoryWriter, DEFAULT_IMPORTANCE_CONFIG };
