import { describe, expect, it, vi } from 'vitest';
import type { AnthropicCountTokensClient } from '../../src/context/anthropic-token-counter.js';
import { AnthropicTokenCounter } from '../../src/context/anthropic-token-counter.js';

function mockClient(tokens = 42): AnthropicCountTokensClient {
	return {
		countTokens: vi.fn().mockResolvedValue({ input_tokens: tokens }),
	};
}

describe('AnthropicTokenCounter', () => {
	describe('count()', () => {
		it('returns token count from API', async () => {
			const client = mockClient(100);
			const counter = new AnthropicTokenCounter(client, 'claude-sonnet-4-5-20250929');
			const result = await counter.count('hello world');
			expect(result).toBe(100);
			expect(client.countTokens).toHaveBeenCalledTimes(1);
		});

		it('caches results by text hash', async () => {
			const client = mockClient(50);
			const counter = new AnthropicTokenCounter(client, 'claude-sonnet-4-5-20250929');

			await counter.count('same text');
			await counter.count('same text');

			expect(client.countTokens).toHaveBeenCalledTimes(1);
		});

		it('cache miss for different text', async () => {
			const client = mockClient(25);
			const counter = new AnthropicTokenCounter(client, 'claude-sonnet-4-5-20250929');

			await counter.count('text a');
			await counter.count('text b');

			expect(client.countTokens).toHaveBeenCalledTimes(2);
		});

		it('falls back to estimate on API error', async () => {
			const client: AnthropicCountTokensClient = {
				countTokens: vi.fn().mockRejectedValue(new Error('API error')),
			};
			const counter = new AnthropicTokenCounter(client, 'claude-sonnet-4-5-20250929');

			const result = await counter.count('hello');
			// estimate = Math.ceil(5 / 3) = 2
			expect(result).toBe(2);
		});

		it('evicts oldest entries when cache exceeds 1000', async () => {
			const client = mockClient(10);
			const counter = new AnthropicTokenCounter(client, 'claude-sonnet-4-5-20250929');

			// Fill cache with 1001 unique entries
			for (let i = 0; i < 1001; i++) {
				await counter.count(`text-${i}`);
			}

			expect(client.countTokens).toHaveBeenCalledTimes(1001);

			// First entry should be evicted; accessing it should trigger API call
			await counter.count('text-0');
			expect(client.countTokens).toHaveBeenCalledTimes(1002);
		});
	});

	describe('estimate()', () => {
		it('returns Math.ceil(text.length / 3)', () => {
			const counter = new AnthropicTokenCounter(mockClient(), 'model');
			expect(counter.estimate('hello')).toBe(2); // ceil(5/3)
			expect(counter.estimate('hello world!')).toBe(4); // ceil(12/3)
			expect(counter.estimate('')).toBe(0);
		});
	});
});
