import { describe, expect, it, vi } from 'vitest';
import type { IntentClassifier } from '@axel/core/types';
import { GeminiIntentClassifier, type IntentLlmClient } from '../../src/intent/index.js';
import { KeywordIntentClassifier } from '../../src/intent/keyword-intent-classifier.js';
import { createFallbackClassifier } from '../../src/intent/fallback-chain.js';

/**
 * FEAT-INTENT-002b: Intent classification integration tests
 *
 * Tests GeminiIntentClassifier → KeywordIntentClassifier fallback chain.
 * Verifies the two classifiers can be composed as primary+fallback.
 */

// =====================================================
// TESTS
// =====================================================

describe('Intent Classification Fallback Chain', () => {
	describe('primary succeeds', () => {
		it('should use primary (LLM) result when available', async () => {
			const mockLlm: IntentLlmClient = {
				generateStructured: vi.fn().mockResolvedValue({
					intent: 'search',
					confidence: 0.92,
					reasoning: 'User wants to find info',
				}),
			};
			const primary = new GeminiIntentClassifier(mockLlm);
			const fallback = new KeywordIntentClassifier();
			const classifier = createFallbackClassifier(primary, fallback);

			const result = await classifier.classify('오늘 날씨 알려줘');
			expect(result.intent).toBe('search');
			expect(result.confidence).toBeGreaterThanOrEqual(0.9);
		});
	});

	describe('primary fails → fallback activates', () => {
		it('should fall back to keyword classifier when LLM throws', async () => {
			const mockLlm: IntentLlmClient = {
				generateStructured: vi.fn().mockRejectedValue(new Error('API rate limited')),
			};
			const primary = new GeminiIntentClassifier(mockLlm);
			const fallback = new KeywordIntentClassifier();
			const classifier = createFallbackClassifier(primary, fallback);

			const result = await classifier.classify('파일 읽어줘');
			// keyword fallback should detect tool_use keywords
			expect(result.intent).toBe('tool_use');
		});

		it('should use keyword classifier for search when LLM unavailable', async () => {
			const mockLlm: IntentLlmClient = {
				generateStructured: vi.fn().mockRejectedValue(new Error('timeout')),
			};
			const primary = new GeminiIntentClassifier(mockLlm);
			const fallback = new KeywordIntentClassifier();
			const classifier = createFallbackClassifier(primary, fallback);

			const result = await classifier.classify('검색해줘 맛집');
			expect(result.intent).toBe('search');
		});
	});

	describe('consistency', () => {
		it('should classify slash commands the same regardless of primary/fallback', async () => {
			const mockLlm: IntentLlmClient = {
				generateStructured: vi.fn().mockResolvedValue({
					intent: 'command',
					confidence: 0.99,
				}),
			};
			const primary = new GeminiIntentClassifier(mockLlm);
			const fallback = new KeywordIntentClassifier();

			const primaryResult = await primary.classify('/help');
			const fallbackResult = await fallback.classify('/help');

			expect(primaryResult.intent).toBe('command');
			expect(fallbackResult.intent).toBe('command');
		});
	});
});
