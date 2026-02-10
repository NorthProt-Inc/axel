import type { Logger } from '@axel/core/logging';
import { NoopLogger } from '@axel/core/logging';
import type { EpisodicMemory, SemanticMemory } from '@axel/core/memory';
import {
	type ConsolidationConfig,
	DEFAULT_CONSOLIDATION_CONFIG,
	EXTRACTION_PROMPT,
	formatSessionForExtraction,
	parseExtractedMemories,
	shouldConsolidate,
} from '@axel/core/memory';

/** LLM client interface for consolidation (Gemini Flash) */
export interface ConsolidationLlm {
	getGenerativeModel(config: { model: string }): {
		generateContent(params: Record<string, unknown>): Promise<{
			response: { text(): string };
		}>;
	};
}

/** Embedding service interface */
export interface ConsolidationEmbedding {
	embed(text: string, taskType: string): Promise<Float32Array>;
}

export interface ConsolidationResult {
	readonly sessionsProcessed: number;
	readonly memoriesExtracted: number;
	readonly memoriesStored: number;
	readonly memoriesUpdated: number;
}

/**
 * L2→L3 Memory Consolidation Service (ADR-021 §3).
 *
 * Extracts facts/preferences/insights from ended sessions
 * and stores them as semantic memories, deduplicating by similarity.
 */
export class ConsolidationService {
	private readonly episodicMemory: EpisodicMemory;
	private readonly semanticMemory: SemanticMemory;
	private readonly embeddingService: ConsolidationEmbedding;
	private readonly llmClient: ConsolidationLlm;
	private readonly model: string;
	private readonly logger: Logger;
	private readonly config: ConsolidationConfig;

	constructor(deps: {
		readonly episodicMemory: EpisodicMemory;
		readonly semanticMemory: SemanticMemory;
		readonly embeddingService: ConsolidationEmbedding;
		readonly llmClient: ConsolidationLlm;
		readonly model: string;
		readonly logger?: Logger;
		readonly config?: ConsolidationConfig;
	}) {
		this.episodicMemory = deps.episodicMemory;
		this.semanticMemory = deps.semanticMemory;
		this.embeddingService = deps.embeddingService;
		this.llmClient = deps.llmClient;
		this.model = deps.model;
		this.logger = deps.logger ?? new NoopLogger();
		this.config = deps.config ?? DEFAULT_CONSOLIDATION_CONFIG;
	}

	async consolidate(batchSize = 50): Promise<ConsolidationResult> {
		const sessions = await this.episodicMemory.findUnconsolidated(batchSize);
		let memoriesExtracted = 0;
		let memoriesStored = 0;
		let memoriesUpdated = 0;

		for (const session of sessions) {
			try {
				const messages = await this.episodicMemory.getSessionMessages(session.sessionId);

				if (!shouldConsolidate(messages.length, this.config)) {
					await this.episodicMemory.markConsolidated(session.sessionId);
					continue;
				}

				const conversationText = formatSessionForExtraction(messages);
				const generativeModel = this.llmClient.getGenerativeModel({ model: this.model });

				const result = await generativeModel.generateContent({
					contents: [{ role: 'user', parts: [{ text: conversationText }] }],
					systemInstruction: { parts: [{ text: EXTRACTION_PROMPT }] },
				});

				const extracted = parseExtractedMemories(
					result.response.text(),
					session.sessionId,
					session.channelId,
				);
				memoriesExtracted += extracted.length;

				for (const memory of extracted) {
					const embedding = await this.embeddingService.embed(memory.content, 'RETRIEVAL_DOCUMENT');

					// Deduplicate: search for similar existing memories
					const similar = await this.semanticMemory.search({
						text: memory.content,
						embedding,
						limit: 1,
						minImportance: 0,
					});

					const topMatch = similar[0];
					if (topMatch && topMatch.finalScore >= this.config.similarityThreshold) {
						await this.semanticMemory.updateAccess(topMatch.memory.uuid);
						memoriesUpdated++;
					} else {
						await this.semanticMemory.store({
							content: memory.content,
							memoryType: memory.memoryType,
							importance: memory.importance,
							embedding,
							sourceChannel: memory.sourceChannel,
							sourceSession: memory.sourceSession,
						});
						memoriesStored++;
					}
				}

				await this.episodicMemory.markConsolidated(session.sessionId);
			} catch (err: unknown) {
				this.logger.warn('Failed to consolidate session', {
					sessionId: session.sessionId,
					error: err instanceof Error ? err.message : String(err),
				});
			}
		}

		this.logger.info('Consolidation batch complete', {
			sessionsProcessed: sessions.length,
			memoriesExtracted,
			memoriesStored,
			memoriesUpdated,
		});

		return {
			sessionsProcessed: sessions.length,
			memoriesExtracted,
			memoriesStored,
			memoriesUpdated,
		};
	}
}
