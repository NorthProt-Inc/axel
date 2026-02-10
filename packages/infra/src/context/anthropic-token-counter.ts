import { createHash } from 'node:crypto';
import type { TokenCounter } from '@axel/core/context';
import type { Logger } from '@axel/core/logging';
import { NoopLogger } from '@axel/core/logging';
import { LRUCache } from 'lru-cache';

/** Subset of Anthropic SDK for countTokens */
export interface AnthropicCountTokensClient {
	countTokens(params: {
		model: string;
		messages: readonly { role: string; content: string }[];
	}): Promise<{ input_tokens: number }>;
}

/**
 * Token counter using Anthropic countTokens API with LRU cache (ADR-018).
 *
 * - count(): API call with SHA-256 cache key, fallback to estimate on error
 * - estimate(): Fast local heuristic (text.length / 3)
 */
export class AnthropicTokenCounter implements TokenCounter {
	private readonly client: AnthropicCountTokensClient;
	private readonly model: string;
	private readonly logger: Logger;
	private readonly cache: LRUCache<string, number>;

	constructor(client: AnthropicCountTokensClient, model: string, logger?: Logger) {
		this.client = client;
		this.model = model;
		this.logger = logger ?? new NoopLogger();
		this.cache = new LRUCache<string, number>({ max: 1000 });
	}

	async count(text: string): Promise<number> {
		const key = createHash('sha256').update(text).digest('hex');

		const cached = this.cache.get(key);
		if (cached !== undefined) {
			return cached;
		}

		try {
			const result = await this.client.countTokens({
				model: this.model,
				messages: [{ role: 'user', content: text }],
			});
			const tokens = result.input_tokens;
			this.cache.set(key, tokens);
			return tokens;
		} catch (err: unknown) {
			this.logger.warn('countTokens API failed, falling back to estimate', {
				error: err instanceof Error ? err.message : String(err),
			});
			return this.estimate(text);
		}
	}

	estimate(text: string): number {
		return Math.ceil(text.length / 3);
	}
}
