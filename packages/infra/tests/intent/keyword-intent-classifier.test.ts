import { describe, expect, it } from 'vitest';
import type { IntentClassifier } from '@axel/core/types';
import { KeywordIntentClassifier } from '../../src/intent/keyword-intent-classifier.js';

/**
 * FEAT-INTENT-002b: KeywordIntentClassifier tests
 *
 * Standalone keyword-based fallback classifier.
 * Used when LLM (GeminiIntentClassifier) is unavailable or circuit-broken.
 * Implements IntentClassifier interface for drop-in replacement.
 */

function createClassifier(): IntentClassifier {
	return new KeywordIntentClassifier();
}

// =====================================================
// TESTS
// =====================================================

describe('KeywordIntentClassifier', () => {
	// --- Slash Commands ---

	describe('slash commands', () => {
		it('should classify "/" prefix as command with high confidence', async () => {
			const classifier = createClassifier();
			const result = await classifier.classify('/help');
			expect(result.intent).toBe('command');
			expect(result.confidence).toBeGreaterThanOrEqual(0.8);
		});

		it('should classify "/설정" as command', async () => {
			const classifier = createClassifier();
			const result = await classifier.classify('/설정 알림');
			expect(result.intent).toBe('command');
		});

		it('should handle leading whitespace before slash', async () => {
			const classifier = createClassifier();
			const result = await classifier.classify('  /config');
			expect(result.intent).toBe('command');
		});
	});

	// --- Search Intent ---

	describe('search intent', () => {
		it('should classify Korean search queries', async () => {
			const classifier = createClassifier();
			const result = await classifier.classify('날씨 검색해줘');
			expect(result.intent).toBe('search');
		});

		it('should classify English search queries', async () => {
			const classifier = createClassifier();
			const result = await classifier.classify('search for the latest news');
			expect(result.intent).toBe('search');
		});

		it('should classify "찾아줘" pattern', async () => {
			const classifier = createClassifier();
			const result = await classifier.classify('맛집 찾아줘');
			expect(result.intent).toBe('search');
		});

		it('should classify "알려줘" pattern', async () => {
			const classifier = createClassifier();
			const result = await classifier.classify('오늘 환율 알려줘');
			expect(result.intent).toBe('search');
		});
	});

	// --- Tool Use Intent ---

	describe('tool_use intent', () => {
		it('should classify file operation requests', async () => {
			const classifier = createClassifier();
			const result = await classifier.classify('파일 읽어줘');
			expect(result.intent).toBe('tool_use');
		});

		it('should classify code execution requests', async () => {
			const classifier = createClassifier();
			const result = await classifier.classify('이 코드 실행해봐');
			expect(result.intent).toBe('tool_use');
		});

		it('should classify English tool requests', async () => {
			const classifier = createClassifier();
			const result = await classifier.classify('run this command');
			expect(result.intent).toBe('tool_use');
		});
	});

	// --- Memory Query Intent ---

	describe('memory_query intent', () => {
		it('should classify Korean memory references', async () => {
			const classifier = createClassifier();
			const result = await classifier.classify('지난번에 뭐라고 했었지?');
			expect(result.intent).toBe('memory_query');
		});

		it('should classify "기억" keyword', async () => {
			const classifier = createClassifier();
			const result = await classifier.classify('그거 기억나?');
			expect(result.intent).toBe('memory_query');
		});

		it('should classify English memory queries', async () => {
			const classifier = createClassifier();
			const result = await classifier.classify('do you remember what I said last time?');
			expect(result.intent).toBe('memory_query');
		});
	});

	// --- Creative Intent ---

	describe('creative intent', () => {
		it('should classify writing requests in Korean', async () => {
			const classifier = createClassifier();
			const result = await classifier.classify('시 하나 써줘');
			expect(result.intent).toBe('creative');
		});

		it('should classify generation requests', async () => {
			const classifier = createClassifier();
			const result = await classifier.classify('로고 만들어줘');
			expect(result.intent).toBe('creative');
		});

		it('should classify English create requests', async () => {
			const classifier = createClassifier();
			const result = await classifier.classify('write me a poem about spring');
			expect(result.intent).toBe('creative');
		});
	});

	// --- Chat Fallback ---

	describe('chat fallback', () => {
		it('should default to chat for generic messages', async () => {
			const classifier = createClassifier();
			const result = await classifier.classify('안녕하세요');
			expect(result.intent).toBe('chat');
		});

		it('should default to chat for ambiguous messages', async () => {
			const classifier = createClassifier();
			const result = await classifier.classify('좋아요');
			expect(result.intent).toBe('chat');
		});

		it('should have low confidence for chat fallback', async () => {
			const classifier = createClassifier();
			const result = await classifier.classify('hmm okay');
			expect(result.intent).toBe('chat');
			expect(result.confidence).toBeLessThan(0.5);
		});
	});

	// --- Confidence Ranges ---

	describe('confidence', () => {
		it('should return confidence between 0 and 1', async () => {
			const classifier = createClassifier();
			const messages = ['hello', '검색해줘', '/help', '기억나?', 'write code'];

			for (const msg of messages) {
				const result = await classifier.classify(msg);
				expect(result.confidence).toBeGreaterThanOrEqual(0);
				expect(result.confidence).toBeLessThanOrEqual(1);
			}
		});

		it('should return higher confidence for keyword matches than chat fallback', async () => {
			const classifier = createClassifier();
			const keywordResult = await classifier.classify('검색해줘');
			const chatResult = await classifier.classify('안녕');

			expect(keywordResult.confidence).toBeGreaterThan(chatResult.confidence);
		});
	});

	// --- Context Acceptance ---

	describe('context', () => {
		it('should accept optional ClassificationContext without error', async () => {
			const classifier = createClassifier();
			const result = await classifier.classify('hello', {
				userId: 'user-1',
				channelId: 'cli',
			});
			expect(result).toBeDefined();
			expect(result.intent).toBeDefined();
		});
	});

	// --- Interface Compliance ---

	describe('interface compliance', () => {
		it('should implement IntentClassifier.classify method', () => {
			const classifier = createClassifier();
			expect(typeof classifier.classify).toBe('function');
		});

		it('should return valid ClassificationResult shape', async () => {
			const classifier = createClassifier();
			const result = await classifier.classify('test message');
			expect(result).toHaveProperty('intent');
			expect(result).toHaveProperty('confidence');
			expect(typeof result.intent).toBe('string');
			expect(typeof result.confidence).toBe('number');
		});
	});

	// --- Edge Cases ---

	describe('edge cases', () => {
		it('should handle empty string', async () => {
			const classifier = createClassifier();
			const result = await classifier.classify('');
			expect(result.intent).toBe('chat');
		});

		it('should handle very long messages', async () => {
			const classifier = createClassifier();
			const result = await classifier.classify('a'.repeat(10_000));
			expect(result).toBeDefined();
		});

		it('should be case insensitive for keyword matching', async () => {
			const classifier = createClassifier();
			const lower = await classifier.classify('search for cats');
			const upper = await classifier.classify('SEARCH for CATS');
			expect(lower.intent).toBe(upper.intent);
		});
	});
});
