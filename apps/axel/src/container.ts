import type { ContextDataProvider, TokenCounter } from '@axel/core/context';
import { ContextAssembler } from '@axel/core/context';
import type {
	ConceptualMemory,
	EpisodicMemory,
	MetaMemory,
	SemanticMemory,
	StreamBuffer,
	WorkingMemory,
} from '@axel/core/memory';
import type { LlmProvider, SessionStore, ToolExecutor } from '@axel/core/orchestrator';
import { SessionRouter } from '@axel/core/orchestrator';
import type { ComponentHealth } from '@axel/core/types';
import {
	AnthropicLlmProvider,
	AxelPgPool,
	GeminiEmbeddingService,
	GoogleLlmProvider,
	McpToolExecutor,
	PgConceptualMemory,
	PgEpisodicMemory,
	PgMetaMemory,
	PgSemanticMemory,
	PgSessionStore,
	RedisStreamBuffer,
	RedisWorkingMemory,
	ToolRegistry,
} from '@axel/infra';

/** Health check target for startup/runtime monitoring */
export interface HealthCheckTarget {
	readonly name: string;
	readonly check: () => Promise<ComponentHealth>;
}

/** External dependencies injected into the container builder */
export interface ContainerDeps {
	readonly pgPool: {
		query(
			text: string,
			params?: readonly unknown[],
		): Promise<{ rows: unknown[]; rowCount: number | null }>;
		connect(): Promise<{
			query(
				text: string,
				params?: readonly unknown[],
			): Promise<{ rows: unknown[]; rowCount: number | null }>;
			release(): void;
		}>;
		end(): Promise<void>;
	};
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
		messages: { create: (...args: unknown[]) => unknown };
	};
	readonly googleClient: {
		generateContentStream: (...args: unknown[]) => unknown;
	};
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
	readonly pgPool: AxelPgPool;
	readonly streamBuffer: StreamBuffer;
	readonly workingMemory: WorkingMemory;
	readonly episodicMemory: EpisodicMemory;
	readonly semanticMemory: SemanticMemory;
	readonly conceptualMemory: ConceptualMemory;
	readonly metaMemory: MetaMemory;
	readonly sessionStore: SessionStore;
	readonly sessionRouter: SessionRouter;
	readonly anthropicProvider: LlmProvider;
	readonly googleProvider: LlmProvider;
	readonly embeddingService: GeminiEmbeddingService;
	readonly toolRegistry: ToolRegistry;
	readonly toolExecutor: ToolExecutor;
	readonly contextAssembler: ContextAssembler;
	readonly tokenCounter: TokenCounter;
	readonly healthCheckTargets: readonly HealthCheckTarget[];
}

/** Minimal TokenCounter using heuristic estimation */
class EstimateTokenCounter implements TokenCounter {
	async count(text: string): Promise<number> {
		return this.estimate(text);
	}

	estimate(text: string): number {
		return Math.ceil(text.length / 4);
	}
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
		private readonly mm: MetaMemory,
		private readonly tr: ToolRegistry,
	) {}

	async getWorkingMemory(userId: string, limit: number) {
		return this.wm.getTurns(userId, limit);
	}

	async searchSemantic(_query: string, _limit: number) {
		// Requires embedding generation — deferred to message flow wiring
		return [];
	}

	async traverseGraph(_entityId: string, _depth: number) {
		// Requires GraphNode→Entity conversion — deferred
		return [];
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

const DEFAULT_EMBEDDING_CONFIG = {
	model: 'gemini-embedding-001',
	dimension: 3072,
	batchSize: 100,
	maxRetries: 3,
	retryBaseMs: 200,
} as const;

const DEFAULT_ANTHROPIC_CONFIG = {
	model: 'claude-sonnet-4-5-20250929',
	maxTokens: 16384,
} as const;

const DEFAULT_GOOGLE_CONFIG = {
	model: 'gemini-3-flash-preview',
	maxTokens: 8192,
} as const;

/**
 * Create the DI container with all services wired together.
 *
 * Follows plan lines 308-338: manual constructor injection, ~20 services.
 * No DI framework (ADR-006).
 */
export function createContainer(deps: ContainerDeps): Container {
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
	const anthropicProvider = new AnthropicLlmProvider(
		deps.anthropicClient as Parameters<typeof AnthropicLlmProvider.prototype.constructor>[0],
		DEFAULT_ANTHROPIC_CONFIG,
	);
	const googleProvider = new GoogleLlmProvider(
		deps.googleClient as Parameters<typeof GoogleLlmProvider.prototype.constructor>[0],
		DEFAULT_GOOGLE_CONFIG,
	);

	// Embedding service (ADR-016)
	const embeddingService = new GeminiEmbeddingService(
		deps.embeddingClient,
		DEFAULT_EMBEDDING_CONFIG,
	);

	// Tool system (ADR-010)
	const toolRegistry = new ToolRegistry();
	const toolExecutor = new McpToolExecutor(toolRegistry);

	// Context assembly (ADR-012)
	const tokenCounter = new EstimateTokenCounter();
	const contextDataProvider = new MemoryContextDataProvider(
		workingMemory,
		episodicMemory,
		metaMemory,
		toolRegistry,
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
		pgPool,
		streamBuffer,
		workingMemory,
		episodicMemory,
		semanticMemory,
		conceptualMemory,
		metaMemory,
		sessionStore,
		sessionRouter,
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
