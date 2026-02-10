import { describe, expect, it } from 'vitest';
import {
	ClassificationResultSchema,
	INTENT_TYPES,
	IntentTypeSchema,
} from '../../src/types/intent.js';
import type { ClassificationResult, IntentClassifier, IntentType } from '../../src/types/intent.js';

describe('Intent Classifier types', () => {
	describe('IntentType', () => {
		it('includes all 6 intent types', () => {
			const types: readonly IntentType[] = INTENT_TYPES;
			expect(types).toContain('chat');
			expect(types).toContain('search');
			expect(types).toContain('tool_use');
			expect(types).toContain('memory_query');
			expect(types).toContain('command');
			expect(types).toContain('creative');
			expect(types).toHaveLength(6);
		});

		it('validates valid intent types via Zod', () => {
			expect(IntentTypeSchema.safeParse('chat').success).toBe(true);
			expect(IntentTypeSchema.safeParse('search').success).toBe(true);
			expect(IntentTypeSchema.safeParse('tool_use').success).toBe(true);
			expect(IntentTypeSchema.safeParse('memory_query').success).toBe(true);
			expect(IntentTypeSchema.safeParse('command').success).toBe(true);
			expect(IntentTypeSchema.safeParse('creative').success).toBe(true);
		});

		it('rejects invalid intent types', () => {
			expect(IntentTypeSchema.safeParse('invalid').success).toBe(false);
			expect(IntentTypeSchema.safeParse('').success).toBe(false);
			expect(IntentTypeSchema.safeParse(123).success).toBe(false);
		});
	});

	describe('ClassificationResult', () => {
		it('represents a high-confidence classification', () => {
			const result: ClassificationResult = {
				intent: 'tool_use',
				confidence: 0.95,
				secondaryIntent: 'search',
				secondaryConfidence: 0.03,
			};

			expect(result.intent).toBe('tool_use');
			expect(result.confidence).toBe(0.95);
			expect(result.secondaryIntent).toBe('search');
		});

		it('validates via Zod schema', () => {
			const valid = ClassificationResultSchema.safeParse({
				intent: 'chat',
				confidence: 0.85,
			});
			expect(valid.success).toBe(true);
		});

		it('rejects confidence outside 0-1 range', () => {
			expect(
				ClassificationResultSchema.safeParse({
					intent: 'chat',
					confidence: 1.5,
				}).success,
			).toBe(false);

			expect(
				ClassificationResultSchema.safeParse({
					intent: 'chat',
					confidence: -0.1,
				}).success,
			).toBe(false);
		});

		it('allows optional secondary intent', () => {
			const result = ClassificationResultSchema.parse({
				intent: 'search',
				confidence: 0.8,
			});
			expect(result.secondaryIntent).toBeUndefined();
			expect(result.secondaryConfidence).toBeUndefined();
		});

		it('rejects invalid intent value in result', () => {
			expect(
				ClassificationResultSchema.safeParse({
					intent: 'unknown_type',
					confidence: 0.5,
				}).success,
			).toBe(false);
		});

		it('represents a low-confidence result requiring fallback', () => {
			const result: ClassificationResult = {
				intent: 'chat',
				confidence: 0.4,
			};
			expect(result.confidence).toBeLessThan(0.7);
		});
	});

	describe('IntentClassifier (DI interface)', () => {
		it('defines the contract for intent classification', async () => {
			const mockClassifier: IntentClassifier = {
				classify: async (
					_message: string,
					_context?: { readonly userId: string; readonly channelId: string },
				) => ({
					intent: 'chat' as const,
					confidence: 0.9,
				}),
			};

			const result = await mockClassifier.classify('Hello!');
			expect(result.intent).toBe('chat');
			expect(result.confidence).toBe(0.9);
		});

		it('accepts optional context for classification', async () => {
			const contextAwareClassifier: IntentClassifier = {
				classify: async (
					message: string,
					context?: {
						readonly userId: string;
						readonly channelId: string;
					},
				) => ({
					intent: (context ? 'memory_query' : 'chat') as IntentType,
					confidence: 0.85,
				}),
			};

			const withContext = await contextAwareClassifier.classify('what did I say yesterday?', {
				userId: 'user-1',
				channelId: 'cli',
			});
			expect(withContext.intent).toBe('memory_query');

			const withoutContext = await contextAwareClassifier.classify('hello world');
			expect(withoutContext.intent).toBe('chat');
		});

		it('handles classification errors gracefully', async () => {
			const failingClassifier: IntentClassifier = {
				classify: async () => ({
					intent: 'chat' as const,
					confidence: 0.0,
				}),
			};

			const result = await failingClassifier.classify('test');
			expect(result.intent).toBe('chat');
			expect(result.confidence).toBe(0.0);
		});
	});
});
