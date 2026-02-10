import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * FEAT-INTENT-002: GeminiIntentClassifier — Gemini Flash JSON mode
 *
 * Implements the IntentClassifier interface from @axel/core/types.
 * Uses Gemini Flash for structured intent classification with fallback chain.
 *
 * TDD RED phase: tests written before implementation.
 */

// --- DI interfaces (mirrored from implementation) ---

interface GenerateResult {
	readonly intent: string;
	readonly confidence: number;
	readonly reasoning?: string;
}

interface IntentLlmClient {
	readonly generateStructured: (prompt: string, systemPrompt: string) => Promise<GenerateResult>;
}

interface IntentClassifierConfig {
	readonly highConfidenceThreshold: number;
	readonly lowConfidenceThreshold: number;
	readonly fallbackIntent: string;
	readonly timeoutMs: number;
}

// --- Mock factories ---

function createMockLlmClient(overrides?: Partial<IntentLlmClient>): IntentLlmClient {
	return {
		generateStructured: vi.fn().mockResolvedValue({
			intent: 'chat',
			confidence: 0.92,
			reasoning: 'General greeting message',
		}),
		...overrides,
	};
}

const DEFAULT_CONFIG: IntentClassifierConfig = {
	highConfidenceThreshold: 0.8,
	lowConfidenceThreshold: 0.5,
	fallbackIntent: 'chat',
	timeoutMs: 3_000,
};

describe('GeminiIntentClassifier', () => {
	let mockClient: IntentLlmClient;

	beforeEach(() => {
		mockClient = createMockLlmClient();
	});

	describe('classify — happy path', () => {
		it('should classify a chat message correctly', async () => {
			const { GeminiIntentClassifier } = await import('../../src/intent/index.js');
			const classifier = new GeminiIntentClassifier(mockClient);

			const result = await classifier.classify('Hello, how are you?');

			expect(result.intent).toBe('chat');
			expect(result.confidence).toBeGreaterThanOrEqual(0);
			expect(result.confidence).toBeLessThanOrEqual(1);
		});

		it('should classify a search message', async () => {
			const client = createMockLlmClient({
				generateStructured: vi.fn().mockResolvedValue({
					intent: 'search',
					confidence: 0.88,
					reasoning: 'User wants to find information',
				}),
			});
			const { GeminiIntentClassifier } = await import('../../src/intent/index.js');
			const classifier = new GeminiIntentClassifier(client);

			const result = await classifier.classify('What is the weather in Seoul?');

			expect(result.intent).toBe('search');
			expect(result.confidence).toBe(0.88);
		});

		it('should classify a tool_use message', async () => {
			const client = createMockLlmClient({
				generateStructured: vi.fn().mockResolvedValue({
					intent: 'tool_use',
					confidence: 0.91,
					reasoning: 'User wants file operation',
				}),
			});
			const { GeminiIntentClassifier } = await import('../../src/intent/index.js');
			const classifier = new GeminiIntentClassifier(client);

			const result = await classifier.classify('Read the file /home/user/data.txt');

			expect(result.intent).toBe('tool_use');
		});

		it('should classify a memory_query message', async () => {
			const client = createMockLlmClient({
				generateStructured: vi.fn().mockResolvedValue({
					intent: 'memory_query',
					confidence: 0.85,
				}),
			});
			const { GeminiIntentClassifier } = await import('../../src/intent/index.js');
			const classifier = new GeminiIntentClassifier(client);

			const result = await classifier.classify('Do you remember what we talked about yesterday?');

			expect(result.intent).toBe('memory_query');
		});

		it('should classify a command message', async () => {
			const client = createMockLlmClient({
				generateStructured: vi.fn().mockResolvedValue({
					intent: 'command',
					confidence: 0.95,
				}),
			});
			const { GeminiIntentClassifier } = await import('../../src/intent/index.js');
			const classifier = new GeminiIntentClassifier(client);

			const result = await classifier.classify('/settings notification on');

			expect(result.intent).toBe('command');
		});

		it('should classify a creative message', async () => {
			const client = createMockLlmClient({
				generateStructured: vi.fn().mockResolvedValue({
					intent: 'creative',
					confidence: 0.87,
				}),
			});
			const { GeminiIntentClassifier } = await import('../../src/intent/index.js');
			const classifier = new GeminiIntentClassifier(client);

			const result = await classifier.classify('Write a poem about the sea');

			expect(result.intent).toBe('creative');
		});
	});

	describe('classify — context passing', () => {
		it('should pass classification context to LLM client', async () => {
			const { GeminiIntentClassifier } = await import('../../src/intent/index.js');
			const classifier = new GeminiIntentClassifier(mockClient);

			await classifier.classify('Hello', { userId: 'user-1', channelId: 'cli' });

			expect(mockClient.generateStructured).toHaveBeenCalledWith(
				expect.stringContaining('Hello'),
				expect.any(String),
			);
		});
	});

	describe('classify — fallback on LLM failure', () => {
		it('should return fallback intent when LLM throws error', async () => {
			const client = createMockLlmClient({
				generateStructured: vi.fn().mockRejectedValue(new Error('API rate limit exceeded')),
			});
			const { GeminiIntentClassifier } = await import('../../src/intent/index.js');
			const classifier = new GeminiIntentClassifier(client, DEFAULT_CONFIG);

			const result = await classifier.classify('Some message');

			expect(result.intent).toBe('chat');
			expect(result.confidence).toBeLessThan(DEFAULT_CONFIG.highConfidenceThreshold);
		});

		it('should return fallback intent when LLM returns invalid intent type', async () => {
			const client = createMockLlmClient({
				generateStructured: vi.fn().mockResolvedValue({
					intent: 'invalid_type_not_in_enum',
					confidence: 0.9,
				}),
			});
			const { GeminiIntentClassifier } = await import('../../src/intent/index.js');
			const classifier = new GeminiIntentClassifier(client, DEFAULT_CONFIG);

			const result = await classifier.classify('Hello');

			expect(result.intent).toBe('chat');
		});

		it('should return fallback intent when LLM returns confidence outside 0-1 range', async () => {
			const client = createMockLlmClient({
				generateStructured: vi.fn().mockResolvedValue({
					intent: 'search',
					confidence: 1.5,
				}),
			});
			const { GeminiIntentClassifier } = await import('../../src/intent/index.js');
			const classifier = new GeminiIntentClassifier(client, DEFAULT_CONFIG);

			const result = await classifier.classify('test');

			// Should clamp or reject
			expect(result.confidence).toBeLessThanOrEqual(1);
			expect(result.confidence).toBeGreaterThanOrEqual(0);
		});
	});

	describe('classify — rule-based keyword fallback', () => {
		it('should use keyword matching when LLM fails', async () => {
			const client = createMockLlmClient({
				generateStructured: vi.fn().mockRejectedValue(new Error('timeout')),
			});
			const { GeminiIntentClassifier } = await import('../../src/intent/index.js');
			const classifier = new GeminiIntentClassifier(client, DEFAULT_CONFIG);

			const searchResult = await classifier.classify('검색해줘 날씨');
			expect(searchResult.intent).toBe('search');

			const toolResult = await classifier.classify('파일 읽어줘');
			expect(toolResult.intent).toBe('tool_use');

			const memoryResult = await classifier.classify('지난번에 말한 거 기억나?');
			expect(memoryResult.intent).toBe('memory_query');

			const commandResult = await classifier.classify('/설정 변경');
			expect(commandResult.intent).toBe('command');

			const creativeResult = await classifier.classify('시 써줘');
			expect(creativeResult.intent).toBe('creative');
		});

		it('should default to chat when no keywords match and LLM fails', async () => {
			const client = createMockLlmClient({
				generateStructured: vi.fn().mockRejectedValue(new Error('timeout')),
			});
			const { GeminiIntentClassifier } = await import('../../src/intent/index.js');
			const classifier = new GeminiIntentClassifier(client, DEFAULT_CONFIG);

			const result = await classifier.classify('안녕하세요');

			expect(result.intent).toBe('chat');
		});
	});

	describe('classify — slash command priority', () => {
		it('should prioritize command intent for messages starting with /', async () => {
			const client = createMockLlmClient({
				generateStructured: vi.fn().mockResolvedValue({
					intent: 'chat',
					confidence: 0.7,
				}),
			});
			const { GeminiIntentClassifier } = await import('../../src/intent/index.js');
			const classifier = new GeminiIntentClassifier(client, DEFAULT_CONFIG);

			const result = await classifier.classify('/help');

			expect(result.intent).toBe('command');
		});
	});

	describe('classify — response validation', () => {
		it('should return ClassificationResult-compatible object', async () => {
			const { GeminiIntentClassifier } = await import('../../src/intent/index.js');
			const classifier = new GeminiIntentClassifier(mockClient);

			const result = await classifier.classify('Hello');

			// ClassificationResult from core/types/intent.ts
			expect(result).toHaveProperty('intent');
			expect(result).toHaveProperty('confidence');
			expect(typeof result.intent).toBe('string');
			expect(typeof result.confidence).toBe('number');
			expect(result.confidence).toBeGreaterThanOrEqual(0);
			expect(result.confidence).toBeLessThanOrEqual(1);
		});

		it('should include only valid IntentType values', async () => {
			const { GeminiIntentClassifier } = await import('../../src/intent/index.js');
			const classifier = new GeminiIntentClassifier(mockClient);

			const result = await classifier.classify('Hello');

			const validIntents = ['chat', 'search', 'tool_use', 'memory_query', 'command', 'creative'];
			expect(validIntents).toContain(result.intent);
		});
	});

	describe('classify — circuit breaker integration', () => {
		it('should use circuit breaker for LLM calls', async () => {
			const client = createMockLlmClient({
				generateStructured: vi.fn().mockRejectedValue(new Error('API error')),
			});
			const { GeminiIntentClassifier } = await import('../../src/intent/index.js');
			const classifier = new GeminiIntentClassifier(client, {
				...DEFAULT_CONFIG,
			});

			// Call multiple times to trigger circuit breaker
			const results = await Promise.all(
				Array.from({ length: 6 }, () => classifier.classify('test')),
			);

			// All should return fallback instead of throwing
			for (const result of results) {
				expect(result.intent).toBe('chat');
			}
		});
	});

	describe('classify — system prompt', () => {
		it('should include intent categories in the system prompt', async () => {
			const { GeminiIntentClassifier } = await import('../../src/intent/index.js');
			const classifier = new GeminiIntentClassifier(mockClient);

			await classifier.classify('Hello');

			const systemPrompt = (mockClient.generateStructured as ReturnType<typeof vi.fn>).mock
				.calls[0]?.[1] as string;

			expect(systemPrompt).toContain('chat');
			expect(systemPrompt).toContain('search');
			expect(systemPrompt).toContain('tool_use');
			expect(systemPrompt).toContain('memory_query');
			expect(systemPrompt).toContain('command');
			expect(systemPrompt).toContain('creative');
		});
	});

	describe('IntentClassifier interface compliance', () => {
		it('should implement the classify method from IntentClassifier', async () => {
			const { GeminiIntentClassifier } = await import('../../src/intent/index.js');
			const classifier = new GeminiIntentClassifier(mockClient);

			expect(typeof classifier.classify).toBe('function');
		});
	});
});
