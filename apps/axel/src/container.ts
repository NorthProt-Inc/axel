import type { ContextDataProvider, TokenCounter } from '@axel/core/context';
import { ContextAssembler } from '@axel/core/context';
import type { Logger } from '@axel/core/logging';
import { NoopLogger } from '@axel/core/logging';
import type {
	ConceptualMemory,
	Entity,
	EpisodicMemory,
	MetaMemory,
	SemanticMemory,
	StreamBuffer,
	WorkingMemory,
} from '@axel/core/memory';
import type { LlmProvider, SessionStore, ToolExecutor } from '@axel/core/orchestrator';
import { SessionRouter } from '@axel/core/orchestrator';
import type { MemorySearchResult } from '@axel/core/types';
import {
	AnthropicLlmProvider,
	AnthropicTokenCounter,
	AxelPgPool,
	EntityExtractor,
	FallbackLlmProvider,
	GeminiEmbeddingService,
	type GoogleGenAIClient,
	GoogleLlmProvider,
	McpToolExecutor,
	PgConceptualMemory,
	PgEpisodicMemory,
	PgMetaMemory,
	type PgPoolDriver,
	PgSemanticMemory,
	PgSessionStore,
	RedisStreamBuffer,
	RedisWorkingMemory,
	SemanticMemoryWriter,
	ToolRegistry,
} from '@axel/infra';
import type { AxelConfig } from './config.js';
import type { HealthCheckTarget } from './lifecycle.js';

export type { HealthCheckTarget };

/**
 * PG pool interface compatible with both PgPoolDriver (AxelPgPool, Pg* adapters)
 * and RedisWorkingMemory's generic PgPool interface.
 * pg.Pool natively supports generic query<T>, so real pg.Pool satisfies this.
 */
interface ContainerPgPool extends PgPoolDriver {
	query<T = Record<string, unknown>>(
		text: string,
		params?: readonly unknown[],
	): Promise<{ rows: T[]; rowCount: number | null }>;
}

/** External dependencies injected into the container builder */
export interface ContainerDeps {
	readonly logger?: Logger;
	readonly pgPool: ContainerPgPool;
	readonly redis: {
		rpush(key: string, value: string): Promise<number>;
		ltrim(key: string, start: number, stop: number): Promise<string>;
		expire(key: string, seconds: number): Promise<number>;
		lrange(key: string, start: number, stop: number): Promise<string[]>;
		del(key: string): Promise<number>;
		get(key: string): Promise<string | null>;
		set(key: string, value: string, mode: string, ttl: number): Promise<string>;
		xadd(key: string, id: string, ...fieldValues: string[]): Promise<string>;
		xrange(
			key: string,
			start: string,
			end: string,
			...args: (string | number)[]
		): Promise<[string, string[]][]>;
		xtrim(key: string, strategy: string, approx: string, maxLen: number): Promise<number>;
		xlen(key: string): Promise<number>;
		quit(): Promise<string>;
	};
	readonly anthropicClient: {
		messages: {
			create(params: Record<string, unknown>): AsyncIterable<{
				readonly type: string;
				readonly index?: number;
				readonly delta?: {
					readonly type: string;
					readonly text?: string;
					readonly thinking?: string;
					readonly partial_json?: string;
				};
				readonly content_block?: {
					readonly type: string;
					readonly id?: string;
					readonly name?: string;
				};
			}>;
		};
		countTokens(params: {
			model: string;
			messages: readonly { role: string; content: string }[];
		}): Promise<{ input_tokens: number }>;
	};
	readonly googleClient: GoogleGenAIClient;
	readonly embeddingClient: {
		embedContent(params: { content: { parts: { text: string }[] }; taskType: string }): Promise<{
			embedding: { values: readonly number[] };
		}>;
		batchEmbedContents(params: {
			requests: readonly { content: { parts: { text: string }[] }; taskType: string }[];
		}): Promise<{ embeddings: readonly { values: readonly number[] }[] }>;
	};
}

/** Assembled DI container with all services */
export interface Container {
	readonly logger: Logger;
	readonly pgPool: AxelPgPool;
	readonly streamBuffer: StreamBuffer;
	readonly workingMemory: WorkingMemory;
	readonly episodicMemory: EpisodicMemory;
	readonly semanticMemory: SemanticMemory;
	readonly conceptualMemory: ConceptualMemory;
	readonly metaMemory: MetaMemory;
	readonly semanticMemoryWriter: SemanticMemoryWriter;
	readonly entityExtractor: EntityExtractor;
	readonly sessionStore: SessionStore;
	readonly sessionRouter: SessionRouter;
	readonly llmProvider: LlmProvider;
	readonly anthropicProvider: LlmProvider;
	readonly googleProvider: LlmProvider;
	readonly embeddingService: GeminiEmbeddingService;
	readonly toolRegistry: ToolRegistry;
	readonly toolExecutor: ToolExecutor;
	readonly contextAssembler: ContextAssembler;
	readonly tokenCounter: TokenCounter;
	readonly healthCheckTargets: readonly HealthCheckTarget[];
}


/**
 * Minimal ContextDataProvider that delegates to memory layers.
 *
 * Full adapter logic (embedding generation for semantic search,
 * GraphNode→Entity conversion, etc.) will be implemented when
 * the end-to-end message flow is wired up.
 */
class MemoryContextDataProvider implements ContextDataProvider {
	constructor(
		private readonly wm: WorkingMemory,
		private readonly em: EpisodicMemory,
		private readonly sm: SemanticMemory,
		private readonly cm: ConceptualMemory,
		private readonly mm: MetaMemory,
		private readonly tr: ToolRegistry,
		private readonly embeddingService: GeminiEmbeddingService,
	) {}

	async getWorkingMemory(userId: string, limit: number) {
		return this.wm.getTurns(userId, limit);
	}

	async searchSemantic(query: string, limit: number) {
		const embedding = await this.embeddingService.embed(query, 'RETRIEVAL_QUERY');
		const scored = await this.sm.search({ text: query, embedding, limit });
		const results: MemorySearchResult[] = scored.map((s) => ({
			memory: s.memory,
			score: s.finalScore,
			source: 'semantic' as const,
		}));

		// M5: Record access pattern
		if (results.length > 0) {
			this.mm
				.recordAccess({
					queryText: query,
					matchedMemoryIds: results.map((r) => r.memory.accessCount),
					relevanceScores: results.map((r) => r.score),
					channelId: 'context-assembler',
				})
				.catch(() => {
					// Silent — meta memory recording must not break search
				});
		}

		return results;
	}

	async traverseGraph(entityId: string, depth: number) {
		const nodes = await this.cm.traverse(entityId, depth);
		return nodes.map((n) => n.entity);
	}

	async searchEntities(query: string): Promise<Entity | null> {
		return this.cm.findEntity(query);
	}

	async getSessionArchive(userId: string, _days: number) {
		return this.em.getRecentSessions(userId, 10);
	}

	async getStreamBuffer(_userId: string) {
		// Stream buffer consume is an async generator — deferred
		return [];
	}

	async getMetaMemory(_userId: string) {
		return this.mm.getHotMemories(10);
	}

	getToolDefinitions() {
		return this.tr.listAll();
	}
}

const DEFAULT_PG_CONFIG = {
	host: 'localhost',
	port: 5432,
	database: 'axel',
	user: 'axel',
	password: '',
	maxConnections: 10,
	idleTimeoutMs: 30_000,
	connectionTimeoutMs: 5_000,
} as const;

const EMBEDDING_BASE_CONFIG = {
	batchSize: 100,
	maxRetries: 3,
	retryBaseMs: 200,
} as const;

const GOOGLE_BASE_CONFIG = {
	maxTokens: 8192,
} as const;

/**
 * Create the DI container with all services wired together.
 *
 * Follows plan lines 308-338: manual constructor injection, ~20 services.
 * No DI framework (ADR-006).
 */
export function createContainer(deps: ContainerDeps, llmConfig: AxelConfig['llm']): Container {
	// Logger (fallback to NoopLogger if not provided)
	const logger: Logger = deps.logger ?? new NoopLogger();

	// Infrastructure layer
	const pgPool = new AxelPgPool(deps.pgPool, DEFAULT_PG_CONFIG);
	const streamBuffer = new RedisStreamBuffer(deps.redis);
	const workingMemory = new RedisWorkingMemory(deps.redis, deps.pgPool);
	const episodicMemory = new PgEpisodicMemory(deps.pgPool);
	const semanticMemory = new PgSemanticMemory(deps.pgPool);
	const conceptualMemory = new PgConceptualMemory(deps.pgPool);
	const metaMemory = new PgMetaMemory(deps.pgPool);

	// Session management (ADR-014)
	const sessionStore = new PgSessionStore(deps.pgPool);
	const sessionRouter = new SessionRouter(sessionStore);

	// LLM providers (ADR-020)
	const anthropicProvider = new AnthropicLlmProvider(deps.anthropicClient, {
		model: llmConfig.anthropic.model,
		maxTokens: llmConfig.anthropic.maxTokens,
	});
	const googleProvider = new GoogleLlmProvider(deps.googleClient, {
		...GOOGLE_BASE_CONFIG,
		model: llmConfig.google.flashModel,
	});

	// LLM fallback chain (GAP-03)
	const llmProvider = new FallbackLlmProvider(
		llmConfig.fallbackChain
			.map((name) => {
				if (name === 'anthropic') return { name, provider: anthropicProvider };
				if (name === 'google') return { name, provider: googleProvider };
				return null;
			})
			.filter((p): p is { name: string; provider: LlmProvider } => p !== null),
		logger,
	);

	// Embedding service (ADR-016)
	const embeddingService = new GeminiEmbeddingService(deps.embeddingClient, {
		...EMBEDDING_BASE_CONFIG,
		model: llmConfig.google.embeddingModel,
		dimension: llmConfig.google.embeddingDimension,
	});

	// Semantic Memory Writer (M3 write path)
	const semanticMemoryWriter = new SemanticMemoryWriter(
		{ embed: (text: string) => embeddingService.embed(text, 'RETRIEVAL_DOCUMENT') },
		semanticMemory,
	);

	// Entity Extractor (M4 write path)
	const entityExtractor = new EntityExtractor(deps.googleClient, llmConfig.google.flashModel);

	// Tool system (ADR-010)
	const toolRegistry = new ToolRegistry();
	const toolExecutor = new McpToolExecutor(toolRegistry);

	// Context assembly (ADR-012, ADR-018 2-tier)
	const tokenCounter = new AnthropicTokenCounter(
		deps.anthropicClient,
		llmConfig.anthropic.model,
		logger,
	);
	const contextDataProvider = new MemoryContextDataProvider(
		workingMemory,
		episodicMemory,
		semanticMemory,
		conceptualMemory,
		metaMemory,
		toolRegistry,
		embeddingService,
	);
	const contextAssembler = new ContextAssembler(contextDataProvider, tokenCounter);

	// Health check targets
	const healthCheckTargets: HealthCheckTarget[] = [
		{ name: 'postgresql', check: () => pgPool.healthCheck() },
		{ name: 'stream-buffer', check: () => streamBuffer.healthCheck() },
		{ name: 'working-memory', check: () => workingMemory.healthCheck() },
		{ name: 'episodic-memory', check: () => episodicMemory.healthCheck() },
		{ name: 'semantic-memory', check: () => semanticMemory.healthCheck() },
		{ name: 'conceptual-memory', check: () => conceptualMemory.healthCheck() },
		{ name: 'meta-memory', check: () => metaMemory.healthCheck() },
		{ name: 'embedding', check: () => embeddingService.healthCheck() },
	];

	return {
		logger,
		pgPool,
		streamBuffer,
		workingMemory,
		episodicMemory,
		semanticMemory,
		conceptualMemory,
		metaMemory,
		semanticMemoryWriter,
		entityExtractor,
		sessionStore,
		sessionRouter,
		llmProvider,
		anthropicProvider,
		googleProvider,
		embeddingService,
		toolRegistry,
		toolExecutor,
		contextAssembler,
		tokenCounter,
		healthCheckTargets,
	};
}
