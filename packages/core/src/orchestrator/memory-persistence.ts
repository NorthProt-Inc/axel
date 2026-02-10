import type { EpisodicMemory, WorkingMemory } from '../memory/types.js';

/** Semantic memory writer interface for M3 write path */
export interface SemanticMemoryWriterLike {
	storeConversationMemory(params: {
		readonly userContent: string;
		readonly assistantContent: string;
		readonly channelId: string;
		readonly sessionId: string;
	}): Promise<string | null>;
}

/** Entity extractor interface for M4 write path */
export interface EntityExtractorLike {
	extract(
		userContent: string,
		assistantContent: string,
	): Promise<{
		readonly entities: readonly {
			readonly name: string;
			readonly type: string;
			readonly properties: Readonly<Record<string, unknown>>;
		}[];
		readonly relations: readonly {
			readonly source: string;
			readonly target: string;
			readonly type: string;
		}[];
	}>;
}

/** Conceptual memory interface for M4 write path */
export interface ConceptualMemoryLike {
	addEntity(entity: {
		readonly name: string;
		readonly entityType: string;
		readonly metadata?: Readonly<Record<string, unknown>>;
	}): Promise<string>;
	addRelation(relation: {
		readonly sourceId: string;
		readonly targetId: string;
		readonly relationType: string;
		readonly weight: number;
	}): Promise<void>;
	findEntity(name: string): Promise<{ readonly entityId: string } | null>;
	incrementMentions(entityId: string): Promise<void>;
}

/** Parameters for persistToMemory */
export interface MemoryPersistenceParams {
	readonly workingMemory: WorkingMemory;
	readonly episodicMemory: EpisodicMemory;
	readonly userId: string;
	readonly sessionId: string;
	readonly channelId: string;
	readonly userContent: string;
	readonly userTimestamp: Date;
	readonly assistantContent: string;
	readonly assistantTimestamp: Date;
	readonly baseTurnId: number;
	readonly semanticMemoryWriter?: SemanticMemoryWriterLike | undefined;
	readonly entityExtractor?: EntityExtractorLike | undefined;
	readonly conceptualMemory?: ConceptualMemoryLike | undefined;
}

/** Estimate token count for a string (~3 chars per token, conservative per ADR-018) */
export function estimateTokenCount(text: string): number {
	return Math.ceil(text.length / 3);
}

/**
 * Persist user message and assistant response to memory layers M1-M4.
 *
 * Each layer is independent — failure in one layer must not block others.
 * M3/M4 are fire-and-forget (errors silently caught).
 * The response has already been sent to the user at this point.
 */
export async function persistToMemory(params: MemoryPersistenceParams): Promise<void> {
	const {
		workingMemory,
		episodicMemory,
		userId,
		sessionId,
		channelId,
		userContent,
		userTimestamp,
		assistantContent,
		assistantTimestamp,
		baseTurnId,
		semanticMemoryWriter,
		entityExtractor,
		conceptualMemory,
	} = params;

	const userTokenCount = estimateTokenCount(userContent);
	const assistantTokenCount = estimateTokenCount(assistantContent);

	// M1: Working Memory (independent — failure must not block M2)
	try {
		await workingMemory.pushTurn(userId, {
			turnId: baseTurnId + 1,
			role: 'user',
			content: userContent,
			channelId,
			timestamp: userTimestamp,
			tokenCount: userTokenCount,
		});
		await workingMemory.pushTurn(userId, {
			turnId: baseTurnId + 2,
			role: 'assistant',
			content: assistantContent,
			channelId,
			timestamp: assistantTimestamp,
			tokenCount: assistantTokenCount,
		});
	} catch {
		// M1 failure must not block M2/M3/M4
	}

	// M2: Episodic Memory (independent)
	try {
		await episodicMemory.addMessage(sessionId, {
			role: 'user',
			content: userContent,
			channelId,
			timestamp: userTimestamp,
			tokenCount: userTokenCount,
		});
		await episodicMemory.addMessage(sessionId, {
			role: 'assistant',
			content: assistantContent,
			channelId,
			timestamp: assistantTimestamp,
			tokenCount: assistantTokenCount,
		});
	} catch {
		// M2 failure must not break the response flow
	}

	// M3: Semantic Memory (fire-and-forget)
	if (semanticMemoryWriter) {
		semanticMemoryWriter
			.storeConversationMemory({ userContent, assistantContent, channelId, sessionId })
			.catch(() => {
				// Silent — M3 persistence must not break the response flow
			});
	}

	// M4: Conceptual Memory — entity extraction (fire-and-forget)
	if (entityExtractor && conceptualMemory) {
		extractAndStoreEntities(entityExtractor, conceptualMemory, userContent, assistantContent).catch(
			() => {
				// Silent — M4 persistence must not break the response flow
			},
		);
	}
}

/** Extract entities from conversation and store to M4 conceptual memory */
async function extractAndStoreEntities(
	entityExtractor: EntityExtractorLike,
	conceptualMemory: ConceptualMemoryLike,
	userContent: string,
	assistantContent: string,
): Promise<void> {
	const extracted = await entityExtractor.extract(userContent, assistantContent);

	// PERF-C6: Parallel entity lookups (eliminates N+1 sequential findEntity calls)
	const entityIdMap = new Map<string, string>();
	const entityResults = await Promise.all(
		extracted.entities.map(async (entity) => {
			const existing = await conceptualMemory.findEntity(entity.name);
			if (existing) {
				await conceptualMemory.incrementMentions(existing.entityId);
				return { name: entity.name, entityId: existing.entityId };
			}
			const entityId = await conceptualMemory.addEntity({
				name: entity.name,
				entityType: entity.type,
				metadata: entity.properties,
			});
			return { name: entity.name, entityId };
		}),
	);
	for (const result of entityResults) {
		entityIdMap.set(result.name, result.entityId);
	}

	// PERF-C6: Parallel relation additions (eliminates sequential addRelation calls)
	await Promise.all(
		extracted.relations
			.filter((relation) => {
				const sourceId = entityIdMap.get(relation.source);
				const targetId = entityIdMap.get(relation.target);
				return sourceId != null && targetId != null;
			})
			.map(async (relation) => {
				const sourceId = entityIdMap.get(relation.source)!;
				const targetId = entityIdMap.get(relation.target)!;
				await conceptualMemory.addRelation({
					sourceId,
					targetId,
					relationType: relation.type,
					weight: 1.0,
				});
			}),
	);
}
