import type { EpisodicMemory, WorkingMemory } from '../memory/types.js';

/**
 * Memory persistence module — extracted from inbound-handler.ts per FIX-FILESIZE-001.
 *
 * Handles writing to all memory layers (M1-M4) after a conversation turn completes.
 */

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

/**
 * Persist user message and assistant response to M1 (WorkingMemory) and M2 (EpisodicMemory).
 *
 * Failures are silently caught — memory persistence must not break the response flow.
 * The response has already been sent to the user at this point.
 */
export async function persistToMemory(
	workingMemory: WorkingMemory,
	episodicMemory: EpisodicMemory,
	userId: string,
	sessionId: string,
	channelId: string,
	userContent: string,
	userTimestamp: Date,
	assistantContent: string,
	assistantTimestamp: Date,
	baseTurnId: number,
	semanticMemoryWriter?: SemanticMemoryWriterLike,
	entityExtractor?: EntityExtractorLike,
	conceptualMemory?: ConceptualMemoryLike,
): Promise<void> {
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

	// Store entities (upsert: find existing or create new)
	const entityIdMap = new Map<string, string>();
	for (const entity of extracted.entities) {
		const existing = await conceptualMemory.findEntity(entity.name);
		if (existing) {
			await conceptualMemory.incrementMentions(existing.entityId);
			entityIdMap.set(entity.name, existing.entityId);
		} else {
			const entityId = await conceptualMemory.addEntity({
				name: entity.name,
				entityType: entity.type,
				metadata: entity.properties,
			});
			entityIdMap.set(entity.name, entityId);
		}
	}

	// Store relations
	for (const relation of extracted.relations) {
		const sourceId = entityIdMap.get(relation.source);
		const targetId = entityIdMap.get(relation.target);
		if (sourceId && targetId) {
			await conceptualMemory.addRelation({
				sourceId,
				targetId,
				relationType: relation.type,
				weight: 1.0,
			});
		}
	}
}

/** Estimate token count for a string (~3 chars per token, conservative per ADR-018) */
function estimateTokenCount(text: string): number {
	return Math.ceil(text.length / 3);
}
