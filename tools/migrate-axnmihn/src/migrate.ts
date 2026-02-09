// Stub — will be implemented in GREEN phase
import type {
	AxnmihnSession,
	AxnmihnMessage,
	AxnmihnInteractionLog,
	ChromaMemory,
	KnowledgeGraphData,
	AxelSession,
	AxelSessionSummary,
	AxelMessage,
	AxelInteractionLog,
	AxelMemory,
	AxelEntity,
	AxelRelation,
} from './types.js';

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
	readonly insertSessionSummaries: (
		summaries: readonly AxelSessionSummary[],
	) => Promise<number>;
	readonly insertMessages: (messages: readonly AxelMessage[]) => Promise<number>;
	readonly insertInteractionLogs: (
		logs: readonly AxelInteractionLog[],
	) => Promise<number>;
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

export function createMigrator(_deps: MigratorDeps): Migrator {
	throw new Error('Not implemented');
}
