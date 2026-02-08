import type { ComponentHealth } from '../../core/src/types/health.js';
import { CircuitBreaker, type CircuitBreakerConfig } from '../common/circuit-breaker.js';

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

/** Gemini API client interface (subset used by this adapter) */
interface GeminiEmbeddingClient {
	embedContent(params: {
		content: { parts: { text: string }[] };
		taskType: string;
	}): Promise<{ embedding: { values: readonly number[] } }>;
	batchEmbedContents(params: {
		requests: readonly {
			content: { parts: { text: string }[] };
			taskType: string;
		}[];
	}): Promise<{
		embeddings: readonly { values: readonly number[] }[];
	}>;
}

const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

function isRetryableError(error: unknown): boolean {
	if (!(error instanceof Error)) return false;
	const msg = error.message;
	for (const code of RETRYABLE_STATUS_CODES) {
		if (msg.includes(String(code))) return true;
	}
	return msg.includes('ECONNRESET') || msg.includes('ETIMEDOUT');
}

/**
 * Gemini Embedding Service (ADR-016).
 *
 * Uses gemini-embedding-001 with 3072d full dimension.
 * Supports single and batch embedding with retry and circuit breaker.
 */
class GeminiEmbeddingService {
	private readonly client: GeminiEmbeddingClient;
	private readonly config: EmbeddingConfig;
	private readonly circuitBreaker: CircuitBreaker;

	constructor(
		client: GeminiEmbeddingClient,
		config: EmbeddingConfig,
		circuitBreakerConfig?: Partial<CircuitBreakerConfig>,
	) {
		this.client = client;
		this.config = config;
		this.circuitBreaker = new CircuitBreaker(circuitBreakerConfig);
	}

	async embed(text: string, taskType: EmbeddingTaskType): Promise<Float32Array> {
		if (text.length === 0) {
			throw new Error('Text must not be empty');
		}

		return this.circuitBreaker.execute(async () => {
			const response = await this.withRetry(() =>
				this.client.embedContent({
					content: { parts: [{ text }] },
					taskType,
				}),
			);
			return this.toFloat32Array(response.embedding.values);
		});
	}

	async embedBatch(
		texts: readonly string[],
		taskType: EmbeddingTaskType,
	): Promise<readonly Float32Array[]> {
		if (texts.length === 0) {
			throw new Error('Texts array must not be empty');
		}
		for (const text of texts) {
			if (text.length === 0) {
				throw new Error('All texts must be non-empty');
			}
		}

		const results: Float32Array[] = [];
		const chunks = this.chunkArray(texts, this.config.batchSize);

		for (const chunk of chunks) {
			const chunkResults = await this.circuitBreaker.execute(async () => {
				const response = await this.withRetry(() =>
					this.client.batchEmbedContents({
						requests: chunk.map((text) => ({
							content: { parts: [{ text }] },
							taskType,
						})),
					}),
				);
				return response.embeddings.map((e) => this.toFloat32Array(e.values));
			});
			results.push(...chunkResults);
		}

		return results;
	}

	async healthCheck(): Promise<ComponentHealth> {
		const now = new Date();
		if (this.circuitBreaker.state === 'open') {
			return {
				state: 'unhealthy',
				latencyMs: null,
				message: 'Circuit breaker is open',
				lastChecked: now,
			};
		}
		return {
			state: this.circuitBreaker.state === 'half_open' ? 'degraded' : 'healthy',
			latencyMs: null,
			message: null,
			lastChecked: now,
		};
	}

	private toFloat32Array(values: readonly number[]): Float32Array {
		const dim = this.config.dimension;
		if (values.length < dim) {
			throw new Error(`Embedding dimension mismatch: expected ${dim}, got ${values.length}`);
		}
		const arr = new Float32Array(dim);
		for (let i = 0; i < dim; i++) {
			arr[i] = values[i]!;
		}
		return arr;
	}

	private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
		let lastError: Error | null = null;
		for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
			try {
				return await fn();
			} catch (error) {
				lastError = error instanceof Error ? error : new Error(String(error));
				if (!isRetryableError(error) || attempt === this.config.maxRetries) {
					throw lastError;
				}
				const delay = this.config.retryBaseMs * 2 ** attempt;
				await this.sleep(delay);
			}
		}
		throw lastError;
	}

	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	private chunkArray<T>(arr: readonly T[], size: number): readonly (readonly T[])[] {
		const chunks: T[][] = [];
		for (let i = 0; i < arr.length; i += size) {
			chunks.push(arr.slice(i, i + size) as T[]);
		}
		return chunks;
	}
}

export {
	GeminiEmbeddingService,
	type EmbeddingConfig,
	type EmbeddingTaskType,
	type GeminiEmbeddingClient,
};
