import { describe, expect, it } from 'vitest';
import type { TokenUsage } from '../../src/types/common.js';

describe('Common types', () => {
	describe('TokenUsage', () => {
		it('represents full token usage with cache', () => {
			const usage: TokenUsage = {
				inputTokens: 2000,
				outputTokens: 800,
				cacheReadTokens: 500,
				cacheCreationTokens: 100,
			};

			expect(usage.inputTokens).toBe(2000);
			expect(usage.outputTokens).toBe(800);
			expect(usage.cacheReadTokens).toBe(500);
			expect(usage.cacheCreationTokens).toBe(100);
		});

		it('represents usage with no caching', () => {
			const usage: TokenUsage = {
				inputTokens: 1000,
				outputTokens: 300,
				cacheReadTokens: 0,
				cacheCreationTokens: 0,
			};

			expect(usage.cacheReadTokens).toBe(0);
			expect(usage.cacheCreationTokens).toBe(0);
		});

		it('calculates total tokens correctly', () => {
			const usage: TokenUsage = {
				inputTokens: 1500,
				outputTokens: 500,
				cacheReadTokens: 200,
				cacheCreationTokens: 50,
			};

			const total = usage.inputTokens + usage.outputTokens;
			expect(total).toBe(2000);
		});
	});
});
