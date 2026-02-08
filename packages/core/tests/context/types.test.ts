import { describe, expect, it } from 'vitest';
import {
	type AssembledContext,
	type ContextBudget,
	ContextBudgetSchema,
	type ContextDataProvider,
	type ContextSection,
	DEFAULT_CONTEXT_BUDGET,
	type TokenCounter,
} from '../../src/context/types.js';

describe('ContextBudget', () => {
	describe('ContextBudgetSchema', () => {
		it('validates default budget', () => {
			const result = ContextBudgetSchema.safeParse(DEFAULT_CONTEXT_BUDGET);
			expect(result.success).toBe(true);
		});

		it('has correct default values matching plan §3.3', () => {
			expect(DEFAULT_CONTEXT_BUDGET.systemPrompt).toBe(8_000);
			expect(DEFAULT_CONTEXT_BUDGET.streamBuffer).toBe(2_000);
			expect(DEFAULT_CONTEXT_BUDGET.workingMemory).toBe(40_000);
			expect(DEFAULT_CONTEXT_BUDGET.semanticSearch).toBe(12_000);
			expect(DEFAULT_CONTEXT_BUDGET.graphTraversal).toBe(4_000);
			expect(DEFAULT_CONTEXT_BUDGET.sessionArchive).toBe(4_000);
			expect(DEFAULT_CONTEXT_BUDGET.metaMemory).toBe(2_000);
			expect(DEFAULT_CONTEXT_BUDGET.toolDefinitions).toBe(4_000);
		});

		it('total budget equals 76,000 tokens', () => {
			const total =
				DEFAULT_CONTEXT_BUDGET.systemPrompt +
				DEFAULT_CONTEXT_BUDGET.streamBuffer +
				DEFAULT_CONTEXT_BUDGET.workingMemory +
				DEFAULT_CONTEXT_BUDGET.semanticSearch +
				DEFAULT_CONTEXT_BUDGET.graphTraversal +
				DEFAULT_CONTEXT_BUDGET.sessionArchive +
				DEFAULT_CONTEXT_BUDGET.metaMemory +
				DEFAULT_CONTEXT_BUDGET.toolDefinitions;
			expect(total).toBe(76_000);
		});

		it('rejects negative token budgets', () => {
			const result = ContextBudgetSchema.safeParse({
				...DEFAULT_CONTEXT_BUDGET,
				systemPrompt: -1,
			});
			expect(result.success).toBe(false);
		});

		it('rejects non-integer token budgets', () => {
			const result = ContextBudgetSchema.safeParse({
				...DEFAULT_CONTEXT_BUDGET,
				workingMemory: 40_000.5,
			});
			expect(result.success).toBe(false);
		});

		it('rejects zero token budgets', () => {
			const result = ContextBudgetSchema.safeParse({
				...DEFAULT_CONTEXT_BUDGET,
				systemPrompt: 0,
			});
			expect(result.success).toBe(false);
		});

		it('accepts custom budget values', () => {
			const custom: ContextBudget = {
				systemPrompt: 10_000,
				streamBuffer: 3_000,
				workingMemory: 50_000,
				semanticSearch: 15_000,
				graphTraversal: 5_000,
				sessionArchive: 5_000,
				metaMemory: 3_000,
				toolDefinitions: 5_000,
			};
			const result = ContextBudgetSchema.safeParse(custom);
			expect(result.success).toBe(true);
		});
	});

	describe('ContextSection type', () => {
		it('has required readonly fields', () => {
			const section: ContextSection = {
				name: 'working_memory',
				content: 'Hello world',
				tokens: 3,
				source: 'M1:working',
			};
			expect(section.name).toBe('working_memory');
			expect(section.content).toBe('Hello world');
			expect(section.tokens).toBe(3);
			expect(section.source).toBe('M1:working');
		});
	});

	describe('AssembledContext type', () => {
		it('has required fields', () => {
			const ctx: AssembledContext = {
				systemPrompt: 'You are Axel.',
				sections: [],
				totalTokens: 100,
				budgetUtilization: {},
			};
			expect(ctx.systemPrompt).toBe('You are Axel.');
			expect(ctx.sections).toEqual([]);
			expect(ctx.totalTokens).toBe(100);
			expect(ctx.budgetUtilization).toEqual({});
		});

		it('tracks per-section budget utilization', () => {
			const section: ContextSection = {
				name: 'working_memory',
				content: 'some content',
				tokens: 500,
				source: 'M1:working',
			};
			const ctx: AssembledContext = {
				systemPrompt: 'You are Axel.',
				sections: [section],
				totalTokens: 600,
				budgetUtilization: {
					systemPrompt: 100,
					working_memory: 500,
				},
			};
			expect(ctx.budgetUtilization.systemPrompt).toBe(100);
			expect(ctx.budgetUtilization.working_memory).toBe(500);
		});
	});

	describe('ContextDataProvider interface', () => {
		it('defines 7 data methods', () => {
			const provider: ContextDataProvider = {
				getWorkingMemory: async (_userId, _limit) => [],
				searchSemantic: async (_query, _limit) => [],
				traverseGraph: async (_entityId, _depth) => [],
				getSessionArchive: async (_userId, _days) => [],
				getStreamBuffer: async (_userId) => [],
				getMetaMemory: async (_userId) => [],
				getToolDefinitions: () => [],
			};
			expect(provider.getWorkingMemory).toBeDefined();
			expect(provider.searchSemantic).toBeDefined();
			expect(provider.traverseGraph).toBeDefined();
			expect(provider.getSessionArchive).toBeDefined();
			expect(provider.getStreamBuffer).toBeDefined();
			expect(provider.getMetaMemory).toBeDefined();
			expect(provider.getToolDefinitions).toBeDefined();
		});
	});

	describe('TokenCounter interface', () => {
		it('defines count and estimate methods', () => {
			const counter: TokenCounter = {
				count: async (_text) => 10,
				estimate: (_text) => 10,
			};
			expect(counter.count).toBeDefined();
			expect(counter.estimate).toBeDefined();
		});

		it('estimate returns a number synchronously', () => {
			const counter: TokenCounter = {
				count: async (_text) => 10,
				estimate: (text) => Math.ceil(text.length / 4),
			};
			expect(counter.estimate('hello world')).toBe(3);
		});

		it('count returns a promise', async () => {
			const counter: TokenCounter = {
				count: async (_text) => 42,
				estimate: (_text) => 10,
			};
			await expect(counter.count('test')).resolves.toBe(42);
		});
	});
});
