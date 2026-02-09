import { describe, expect, it, vi } from 'vitest';
import type { AxelConfig } from '../src/config.js';
import { type Container, type ContainerDeps, createContainer } from '../src/container.js';

function createMockDeps(): ContainerDeps {
	const mockPgPool = {
		query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
		connect: vi.fn().mockResolvedValue({ query: vi.fn(), release: vi.fn() }),
		end: vi.fn().mockResolvedValue(undefined),
	};

	const mockRedis = {
		rpush: vi.fn().mockResolvedValue(1),
		ltrim: vi.fn().mockResolvedValue('OK'),
		expire: vi.fn().mockResolvedValue(1),
		lrange: vi.fn().mockResolvedValue([]),
		del: vi.fn().mockResolvedValue(1),
		get: vi.fn().mockResolvedValue(null),
		set: vi.fn().mockResolvedValue('OK'),
		xadd: vi.fn().mockResolvedValue('0-1'),
		xrange: vi.fn().mockResolvedValue([]),
		xtrim: vi.fn().mockResolvedValue(0),
		xlen: vi.fn().mockResolvedValue(0),
		quit: vi.fn().mockResolvedValue('OK'),
	};

	const mockAnthropicClient = {
		messages: {
			create: vi.fn(),
		},
	};

	const mockGoogleClient = {
		generateContentStream: vi.fn(),
	};

	const mockEmbeddingClient = {
		embedContent: vi.fn().mockResolvedValue({
			embedding: { values: new Array(3072).fill(0) },
		}),
		batchEmbedContents: vi.fn().mockResolvedValue({
			embeddings: [],
		}),
	};

	return {
		pgPool: mockPgPool,
		redis: mockRedis,
		anthropicClient: mockAnthropicClient,
		googleClient: mockGoogleClient,
		embeddingClient: mockEmbeddingClient,
	};
}

function createMockLlmConfig(): AxelConfig['llm'] {
	return {
		anthropic: {
			apiKey: 'test',
			model: 'claude-sonnet-4-5-20250929',
			thinkingBudget: 10000,
			maxTokens: 16384,
		},
		google: {
			apiKey: 'test',
			flashModel: 'gemini-3-flash-preview',
			embeddingModel: 'gemini-embedding-001',
			embeddingDimension: 1536,
		},
		fallbackChain: ['anthropic', 'google'],
	};
}

describe('Container', () => {
	describe('createContainer', () => {
		it('creates a container with all required services', () => {
			const deps = createMockDeps();
			const container = createContainer(deps, createMockLlmConfig());

			expect(container).toBeDefined();
			expect(container.pgPool).toBeDefined();
			expect(container.sessionRouter).toBeDefined();
			expect(container.contextAssembler).toBeDefined();
			expect(container.toolRegistry).toBeDefined();
			expect(container.toolExecutor).toBeDefined();
		});

		it('provides all 6 memory layers', () => {
			const deps = createMockDeps();
			const container = createContainer(deps, createMockLlmConfig());

			expect(container.streamBuffer).toBeDefined();
			expect(container.workingMemory).toBeDefined();
			expect(container.episodicMemory).toBeDefined();
			expect(container.semanticMemory).toBeDefined();
			expect(container.conceptualMemory).toBeDefined();
			expect(container.metaMemory).toBeDefined();
		});

		it('provides LLM providers', () => {
			const deps = createMockDeps();
			const container = createContainer(deps, createMockLlmConfig());

			expect(container.anthropicProvider).toBeDefined();
			expect(container.googleProvider).toBeDefined();
		});

		it('provides embedding service', () => {
			const deps = createMockDeps();
			const container = createContainer(deps, createMockLlmConfig());

			expect(container.embeddingService).toBeDefined();
		});

		it('provides session store and router', () => {
			const deps = createMockDeps();
			const container = createContainer(deps, createMockLlmConfig());

			expect(container.sessionStore).toBeDefined();
			expect(container.sessionRouter).toBeDefined();
		});

		it('provides context assembler with token counter', () => {
			const deps = createMockDeps();
			const container = createContainer(deps, createMockLlmConfig());

			expect(container.contextAssembler).toBeDefined();
			expect(container.tokenCounter).toBeDefined();
		});
	});

	describe('Container type', () => {
		it('exposes healthCheckable components', () => {
			const deps = createMockDeps();
			const container = createContainer(deps, createMockLlmConfig());

			expect(container.healthCheckTargets).toBeDefined();
			expect(Array.isArray(container.healthCheckTargets)).toBe(true);
			expect(container.healthCheckTargets.length).toBeGreaterThan(0);

			for (const target of container.healthCheckTargets) {
				expect(target.name).toBeDefined();
				expect(typeof target.name).toBe('string');
				expect(target.check).toBeDefined();
				expect(typeof target.check).toBe('function');
			}
		});
	});
});
