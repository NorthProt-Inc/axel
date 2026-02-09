import {
	transformEntity,
	transformInteractionLog,
	transformMemory,
	transformMessage,
	transformRelation,
	transformSession,
	transformSessionSummary,
} from './transform.js';
import type {
	AxelEntity,
	AxelInteractionLog,
	AxelMemory,
	AxelMessage,
	AxelRelation,
	AxelSession,
	AxelSessionSummary,
	AxnmihnInteractionLog,
	AxnmihnMessage,
	AxnmihnSession,
	ChromaMemory,
	KnowledgeGraphData,
} from './types.js';
import { filterOrphanedRelations } from './validate.js';

export interface MigratorDeps {
	readonly extractSessions: () => Promise<readonly AxnmihnSession[]>;
	readonly extractMessages: () => Promise<readonly AxnmihnMessage[]>;
	readonly extractInteractionLogs: () => Promise<readonly AxnmihnInteractionLog[]>;
	readonly extractChromaMemories: () => Promise<readonly ChromaMemory[]>;
	readonly loadKnowledgeGraph: () => Promise<KnowledgeGraphData>;
	readonly embedBatch: (
		texts: readonly string[],
		taskType: string,
	) => Promise<readonly Float32Array[]>;
	readonly insertSessions: (sessions: readonly AxelSession[]) => Promise<number>;
	readonly insertSessionSummaries: (summaries: readonly AxelSessionSummary[]) => Promise<number>;
	readonly insertMessages: (messages: readonly AxelMessage[]) => Promise<number>;
	readonly insertInteractionLogs: (logs: readonly AxelInteractionLog[]) => Promise<number>;
	readonly insertMemories: (memories: readonly AxelMemory[]) => Promise<number>;
	readonly insertEntities: (entities: readonly AxelEntity[]) => Promise<number>;
	readonly insertRelations: (relations: readonly AxelRelation[]) => Promise<number>;
	readonly log: (message: string) => void;
}

export interface MigrationResult {
	readonly success: boolean;
	readonly sessions: number;
	readonly sessionSummaries: number;
	readonly messages: number;
	readonly interactionLogs: number;
	readonly memories: number;
	readonly entities: number;
	readonly relations: number;
	readonly orphanedRelations: number;
}

export interface DryRunResult {
	readonly sessions: number;
	readonly messages: number;
	readonly interactionLogs: number;
	readonly memories: number;
	readonly entities: number;
	readonly relations: number;
}

export interface Migrator {
	run(): Promise<MigrationResult>;
	dryRun(): Promise<DryRunResult>;
}

/** Create a migrator with all I/O injected via deps. */
export function createMigrator(deps: MigratorDeps): Migrator {
	async function extractAll() {
		deps.log('[1/6] Extracting SQLite data...');
		const sessions = await deps.extractSessions();
		const messages = await deps.extractMessages();
		const interactionLogs = await deps.extractInteractionLogs();

		deps.log('[2/6] Extracting ChromaDB embeddings...');
		const chromaMemories = await deps.extractChromaMemories();

		deps.log('[3/6] Loading Knowledge Graph...');
		const knowledgeGraph = await deps.loadKnowledgeGraph();

		return { sessions, messages, interactionLogs, chromaMemories, knowledgeGraph };
	}

	function transformAll(data: {
		sessions: readonly AxnmihnSession[];
		messages: readonly AxnmihnMessage[];
		interactionLogs: readonly AxnmihnInteractionLog[];
		knowledgeGraph: KnowledgeGraphData;
	}) {
		const axelSessions = data.sessions.map(transformSession);
		const axelSummaries = data.sessions
			.map(transformSessionSummary)
			.filter((s): s is AxelSessionSummary => s !== null);
		const axelMessages = data.messages.map(transformMessage);
		const axelLogs = data.interactionLogs.map(transformInteractionLog);
		const axelEntities = data.knowledgeGraph.entities.map(transformEntity);

		const entityIds = new Set(data.knowledgeGraph.entities.map((e) => e.entity_id));
		const validRelations = filterOrphanedRelations(data.knowledgeGraph.relations, entityIds);
		const orphanedCount = data.knowledgeGraph.relations.length - validRelations.length;
		const axelRelations = validRelations.map(transformRelation);

		return {
			axelSessions,
			axelSummaries,
			axelMessages,
			axelLogs,
			axelEntities,
			axelRelations,
			orphanedCount,
		};
	}

	return {
		async run(): Promise<MigrationResult> {
			const extracted = await extractAll();
			const transformed = transformAll(extracted);

			// Re-embed memories if any exist
			let axelMemories: AxelMemory[] = [];
			if (extracted.chromaMemories.length > 0) {
				deps.log(`[5/6] Re-embedding memories (${extracted.chromaMemories.length} x 1536d)...`);
				const texts = extracted.chromaMemories.map((m) => m.content);
				const embeddings = await deps.embedBatch(texts, 'RETRIEVAL_DOCUMENT');
				axelMemories = extracted.chromaMemories.map((memory, i) =>
					transformMemory(memory, embeddings[i]!),
				);
			}

			// Insert in dependency order
			deps.log('[4/6] Migrating sessions, messages, interaction_logs...');
			const sessionsCount = await deps.insertSessions(transformed.axelSessions);
			const summariesCount = await deps.insertSessionSummaries(transformed.axelSummaries);
			const messagesCount = await deps.insertMessages(transformed.axelMessages);
			const logsCount = await deps.insertInteractionLogs(transformed.axelLogs);

			const memoriesCount = await deps.insertMemories(axelMemories);

			deps.log(
				`[6/6] Migrating Knowledge Graph (${transformed.axelEntities.length} entities + ${transformed.axelRelations.length} relations)...`,
			);
			const entitiesCount = await deps.insertEntities(transformed.axelEntities);
			const relationsCount = await deps.insertRelations(transformed.axelRelations);

			return {
				success: true,
				sessions: sessionsCount,
				sessionSummaries: summariesCount,
				messages: messagesCount,
				interactionLogs: logsCount,
				memories: memoriesCount,
				entities: entitiesCount,
				relations: relationsCount,
				orphanedRelations: transformed.orphanedCount,
			};
		},

		async dryRun(): Promise<DryRunResult> {
			const extracted = await extractAll();
			const transformed = transformAll(extracted);

			return {
				sessions: transformed.axelSessions.length,
				messages: transformed.axelMessages.length,
				interactionLogs: transformed.axelLogs.length,
				memories: extracted.chromaMemories.length,
				entities: transformed.axelEntities.length,
				relations: transformed.axelRelations.length,
			};
		},
	};
}
