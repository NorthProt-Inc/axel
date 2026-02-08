import type { ComponentHealth } from '@axel/core/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Types for the Embedding Service (will be implemented in src) ───

/** Task type for asymmetric embedding (ADR-016) */
type EmbeddingTaskType = 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY';

/** Configuration for the embedding service */
interface EmbeddingConfig {
	readonly model: string;
	readonly dimension: number;
	readonly batchSize: number;
	readonly maxRetries: number;
	readonly retryBaseMs: number;
}

/** Embedding service interface */
interface EmbeddingService {
	embed(text: string, taskType: EmbeddingTaskType): Promise<Float32Array>;
	embedBatch(
		texts: readonly string[],
		taskType: EmbeddingTaskType,
	): Promise<readonly Float32Array[]>;
	healthCheck(): Promise<ComponentHealth>;
}

/** Circuit breaker state */
type CircuitState = 'closed' | 'open' | 'half_open';

// ─── Mock Gemini Client ───

interface MockGeminiResponse {
	readonly embedding: { readonly values: readonly number[] };
}

interface MockGeminiBatchResponse {
	readonly embeddings: readonly { readonly values: readonly number[] }[];
}

function createMockGeminiClient() {
	return {
		embedContent:
			vi.fn<
				(params: {
					content: { parts: { text: string }[] };
					taskType: string;
				}) => Promise<MockGeminiResponse>
			>(),
		batchEmbedContents:
			vi.fn<
				(params: {
					requests: readonly {
						content: { parts: { text: string }[] };
						taskType: string;
					}[];
				}) => Promise<MockGeminiBatchResponse>
			>(),
	};
}

function makeFakeEmbedding(dim: number): number[] {
	const values: number[] = [];
	for (let i = 0; i < dim; i++) {
		values.push(Math.random() * 2 - 1);
	}
	return values;
}

// ─── Tests ───

describe('GeminiEmbeddingService', () => {
	const DEFAULT_CONFIG: EmbeddingConfig = {
		model: 'gemini-embedding-001',
		dimension: 3072,
		batchSize: 100,
		maxRetries: 3,
		retryBaseMs: 100,
	};

	let mockClient: ReturnType<typeof createMockGeminiClient>;

	beforeEach(() => {
		mockClient = createMockGeminiClient();
		vi.clearAllMocks();
	});

	describe('embed() — single text', () => {
		it('should return a Float32Array of the correct dimension', async () => {
			const fakeValues = makeFakeEmbedding(3072);
			mockClient.embedContent.mockResolvedValue({
				embedding: { values: fakeValues },
			});

			const { GeminiEmbeddingService } = await import('../../src/embedding/index.js');
			const service: EmbeddingService = new GeminiEmbeddingService(mockClient, DEFAULT_CONFIG);

			const result = await service.embed('hello world', 'RETRIEVAL_DOCUMENT');

			expect(result).toBeInstanceOf(Float32Array);
			expect(result.length).toBe(3072);
		});

		it('should pass the correct task type to the API', async () => {
			const fakeValues = makeFakeEmbedding(3072);
			mockClient.embedContent.mockResolvedValue({
				embedding: { values: fakeValues },
			});

			const { GeminiEmbeddingService } = await import('../../src/embedding/index.js');
			const service: EmbeddingService = new GeminiEmbeddingService(mockClient, DEFAULT_CONFIG);

			await service.embed('test query', 'RETRIEVAL_QUERY');

			expect(mockClient.embedContent).toHaveBeenCalledWith(
				expect.objectContaining({
					taskType: 'RETRIEVAL_QUERY',
				}),
			);
		});

		it('should reject empty text', async () => {
			const { GeminiEmbeddingService } = await import('../../src/embedding/index.js');
			const service: EmbeddingService = new GeminiEmbeddingService(mockClient, DEFAULT_CONFIG);

			await expect(service.embed('', 'RETRIEVAL_DOCUMENT')).rejects.toThrow();
		});

		it('should retry on transient API errors', async () => {
			const fakeValues = makeFakeEmbedding(3072);
			mockClient.embedContent
				.mockRejectedValueOnce(new Error('503 Service Unavailable'))
				.mockResolvedValueOnce({ embedding: { values: fakeValues } });

			const { GeminiEmbeddingService } = await import('../../src/embedding/index.js');
			const service: EmbeddingService = new GeminiEmbeddingService(mockClient, {
				...DEFAULT_CONFIG,
				retryBaseMs: 1,
			});

			const result = await service.embed('hello', 'RETRIEVAL_DOCUMENT');

			expect(result).toBeInstanceOf(Float32Array);
			expect(mockClient.embedContent).toHaveBeenCalledTimes(2);
		});

		it('should throw ProviderError after max retries exhausted', async () => {
			mockClient.embedContent.mockRejectedValue(new Error('503 Service Unavailable'));

			const { GeminiEmbeddingService } = await import('../../src/embedding/index.js');
			const service: EmbeddingService = new GeminiEmbeddingService(mockClient, {
				...DEFAULT_CONFIG,
				maxRetries: 2,
				retryBaseMs: 1,
			});

			await expect(service.embed('hello', 'RETRIEVAL_DOCUMENT')).rejects.toThrow();
		});

		it('should not retry on non-retryable errors (e.g., 400)', async () => {
			mockClient.embedContent.mockRejectedValue(new Error('400 Bad Request'));

			const { GeminiEmbeddingService } = await import('../../src/embedding/index.js');
			const service: EmbeddingService = new GeminiEmbeddingService(mockClient, {
				...DEFAULT_CONFIG,
				retryBaseMs: 1,
			});

			await expect(service.embed('hello', 'RETRIEVAL_DOCUMENT')).rejects.toThrow();
			expect(mockClient.embedContent).toHaveBeenCalledTimes(1);
		});
	});

	describe('embedBatch() — multiple texts', () => {
		it('should embed multiple texts in a single batch call', async () => {
			const texts = ['text one', 'text two', 'text three'];
			const fakeEmbeddings = texts.map(() => makeFakeEmbedding(3072));
			mockClient.batchEmbedContents.mockResolvedValue({
				embeddings: fakeEmbeddings.map((v) => ({ values: v })),
			});

			const { GeminiEmbeddingService } = await import('../../src/embedding/index.js');
			const service: EmbeddingService = new GeminiEmbeddingService(mockClient, DEFAULT_CONFIG);

			const results = await service.embedBatch(texts, 'RETRIEVAL_DOCUMENT');

			expect(results).toHaveLength(3);
			for (const r of results) {
				expect(r).toBeInstanceOf(Float32Array);
				expect(r.length).toBe(3072);
			}
			expect(mockClient.batchEmbedContents).toHaveBeenCalledTimes(1);
		});

		it('should split large batches into chunks of batchSize', async () => {
			const batchSize = 2;
			const texts = ['a', 'b', 'c', 'd', 'e'];
			const fakeEmbedding = makeFakeEmbedding(3072);

			mockClient.batchEmbedContents.mockImplementation(async (params) => {
				return {
					embeddings: params.requests.map(() => ({
						values: fakeEmbedding,
					})),
				};
			});

			const { GeminiEmbeddingService } = await import('../../src/embedding/index.js');
			const service: EmbeddingService = new GeminiEmbeddingService(mockClient, {
				...DEFAULT_CONFIG,
				batchSize,
			});

			const results = await service.embedBatch(texts, 'RETRIEVAL_DOCUMENT');

			expect(results).toHaveLength(5);
			// 5 texts with batchSize 2 → 3 batch calls (2+2+1)
			expect(mockClient.batchEmbedContents).toHaveBeenCalledTimes(3);
		});

		it('should reject empty array', async () => {
			const { GeminiEmbeddingService } = await import('../../src/embedding/index.js');
			const service: EmbeddingService = new GeminiEmbeddingService(mockClient, DEFAULT_CONFIG);

			await expect(service.embedBatch([], 'RETRIEVAL_DOCUMENT')).rejects.toThrow();
		});

		it('should reject batch with any empty text', async () => {
			const { GeminiEmbeddingService } = await import('../../src/embedding/index.js');
			const service: EmbeddingService = new GeminiEmbeddingService(mockClient, DEFAULT_CONFIG);

			await expect(
				service.embedBatch(['hello', '', 'world'], 'RETRIEVAL_DOCUMENT'),
			).rejects.toThrow();
		});

		it('should retry failed batch chunks', async () => {
			const fakeEmbedding = makeFakeEmbedding(3072);
			mockClient.batchEmbedContents
				.mockRejectedValueOnce(new Error('503 Service Unavailable'))
				.mockResolvedValueOnce({
					embeddings: [{ values: fakeEmbedding }, { values: fakeEmbedding }],
				});

			const { GeminiEmbeddingService } = await import('../../src/embedding/index.js');
			const service: EmbeddingService = new GeminiEmbeddingService(mockClient, {
				...DEFAULT_CONFIG,
				retryBaseMs: 1,
			});

			const results = await service.embedBatch(['hello', 'world'], 'RETRIEVAL_DOCUMENT');

			expect(results).toHaveLength(2);
			expect(mockClient.batchEmbedContents).toHaveBeenCalledTimes(2);
		});
	});

	describe('Circuit Breaker', () => {
		it('should open circuit after consecutive failures exceed threshold', async () => {
			mockClient.embedContent.mockRejectedValue(new Error('503 Service Unavailable'));

			const { GeminiEmbeddingService } = await import('../../src/embedding/index.js');
			const service: EmbeddingService = new GeminiEmbeddingService(mockClient, {
				...DEFAULT_CONFIG,
				maxRetries: 1,
				retryBaseMs: 1,
			});

			// Exhaust circuit breaker threshold (5 failures)
			for (let i = 0; i < 5; i++) {
				await service.embed('test', 'RETRIEVAL_DOCUMENT').catch(() => {});
			}

			// Next call should fail fast with circuit open
			await expect(service.embed('test', 'RETRIEVAL_DOCUMENT')).rejects.toThrow(/circuit/i);
		});

		it('should report degraded health when circuit is open', async () => {
			mockClient.embedContent.mockRejectedValue(new Error('503 Service Unavailable'));

			const { GeminiEmbeddingService } = await import('../../src/embedding/index.js');
			const service: EmbeddingService = new GeminiEmbeddingService(mockClient, {
				...DEFAULT_CONFIG,
				maxRetries: 1,
				retryBaseMs: 1,
			});

			// Trigger circuit open
			for (let i = 0; i < 5; i++) {
				await service.embed('test', 'RETRIEVAL_DOCUMENT').catch(() => {});
			}

			const health = await service.healthCheck();
			expect(health.state).toBe('unhealthy');
		});
	});

	describe('healthCheck()', () => {
		it('should return healthy when service is operational', async () => {
			const { GeminiEmbeddingService } = await import('../../src/embedding/index.js');
			const service: EmbeddingService = new GeminiEmbeddingService(mockClient, DEFAULT_CONFIG);

			const health = await service.healthCheck();

			expect(health.state).toBe('healthy');
			expect(health.lastChecked).toBeInstanceOf(Date);
		});
	});

	describe('dimension validation', () => {
		it('should truncate embedding to configured dimension if API returns more', async () => {
			const overSizedValues = makeFakeEmbedding(4096);
			mockClient.embedContent.mockResolvedValue({
				embedding: { values: overSizedValues },
			});

			const { GeminiEmbeddingService } = await import('../../src/embedding/index.js');
			const service: EmbeddingService = new GeminiEmbeddingService(mockClient, DEFAULT_CONFIG);

			const result = await service.embed('hello', 'RETRIEVAL_DOCUMENT');
			expect(result.length).toBe(3072);
		});

		it('should throw if API returns fewer dimensions than configured', async () => {
			const underSizedValues = makeFakeEmbedding(768);
			mockClient.embedContent.mockResolvedValue({
				embedding: { values: underSizedValues },
			});

			const { GeminiEmbeddingService } = await import('../../src/embedding/index.js');
			const service: EmbeddingService = new GeminiEmbeddingService(mockClient, DEFAULT_CONFIG);

			await expect(service.embed('hello', 'RETRIEVAL_DOCUMENT')).rejects.toThrow(/dimension/i);
		});
	});
});
