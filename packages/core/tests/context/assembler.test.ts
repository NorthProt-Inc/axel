import { describe, expect, it, vi } from 'vitest';
import { ContextAssembler } from '../../src/context/assembler.js';
import {
	type ContextDataProvider,
	DEFAULT_CONTEXT_BUDGET,
	type TokenCounter,
} from '../../src/context/types.js';
import type { Entity } from '../../src/memory/types.js';
import type { MemorySearchResult } from '../../src/types/memory.js';
import type { SessionSummary } from '../../src/types/session.js';
import type { ToolDefinition } from '../../src/types/tool.js';

// ─── Test Fixtures ───

function makeTurn(content: string, turnId = 1) {
	return {
		turnId,
		role: 'user' as const,
		content,
		channelId: 'cli',
		timestamp: new Date(),
		tokenCount: content.length,
	};
}

function makeStreamEvent(type = 'typing_start' as const) {
	return {
		eventId: 'evt-1',
		type,
		userId: 'u1',
		channelId: 'cli',
		timestamp: new Date(),
		metadata: {},
	};
}

function makeMemorySearchResult(content: string): MemorySearchResult {
	return {
		memory: {
			uuid: 'mem-1',
			content,
			memoryType: 'fact',
			importance: 0.8,
			embedding: new Float32Array(3072),
			createdAt: new Date(),
			lastAccessed: new Date(),
			accessCount: 5,
			sourceChannel: 'cli',
			channelMentions: {},
			sourceSession: null,
			decayedImportance: null,
			lastDecayedAt: null,
		},
		score: 0.9,
		source: 'semantic',
	};
}

function makeEntity(name: string): Entity {
	return {
		entityId: 'ent-1',
		name,
		entityType: 'person',
		mentionCount: 3,
		createdAt: new Date(),
		updatedAt: new Date(),
		metadata: {},
	};
}

function makeSessionSummary(summary: string): SessionSummary {
	return {
		sessionId: 'sess-1',
		summary,
		keyTopics: ['test'],
		emotionalTone: 'neutral',
		turnCount: 5,
		channelHistory: ['cli'],
		startedAt: new Date(),
		endedAt: new Date(),
	};
}

function makeToolDef(name: string): ToolDefinition {
	return {
		name,
		description: `Tool ${name}`,
		category: 'system',
		inputSchema: {},
		requiresApproval: false,
	};
}

function makeHotMemory(content: string) {
	return {
		memoryId: 1,
		uuid: 'hm-1',
		content,
		accessCount: 10,
		channelDiversity: 3,
	};
}

function makeEmptyProvider(): ContextDataProvider {
	return {
		getWorkingMemory: vi.fn().mockResolvedValue([]),
		searchSemantic: vi.fn().mockResolvedValue([]),
		traverseGraph: vi.fn().mockResolvedValue([]),
		getSessionArchive: vi.fn().mockResolvedValue([]),
		getStreamBuffer: vi.fn().mockResolvedValue([]),
		getMetaMemory: vi.fn().mockResolvedValue([]),
		getToolDefinitions: vi.fn().mockReturnValue([]),
	};
}

function makeEstimateCounter(): TokenCounter {
	return {
		count: async (text) => Math.ceil(text.length / 4),
		estimate: (text) => Math.ceil(text.length / 4),
	};
}

// ─── Tests ───

describe('ContextAssembler', () => {
	describe('constructor', () => {
		it('accepts provider, counter, and default budget', () => {
			const provider = makeEmptyProvider();
			const counter = makeEstimateCounter();
			const assembler = new ContextAssembler(provider, counter);
			expect(assembler).toBeDefined();
		});

		it('accepts a custom budget', () => {
			const provider = makeEmptyProvider();
			const counter = makeEstimateCounter();
			const customBudget = { ...DEFAULT_CONTEXT_BUDGET, workingMemory: 50_000 };
			const assembler = new ContextAssembler(provider, counter, customBudget);
			expect(assembler).toBeDefined();
		});
	});

	describe('assemble()', () => {
		it('returns an AssembledContext with systemPrompt', async () => {
			const provider = makeEmptyProvider();
			const counter = makeEstimateCounter();
			const assembler = new ContextAssembler(provider, counter);

			const result = await assembler.assemble({
				systemPrompt: 'You are Axel.',
				userId: 'u1',
				query: 'hello',
			});

			expect(result.systemPrompt).toBe('You are Axel.');
			expect(result.sections).toBeInstanceOf(Array);
			expect(result.totalTokens).toBeGreaterThan(0);
			expect(result.budgetUtilization).toBeDefined();
		});

		it('includes systemPrompt token count in budgetUtilization', async () => {
			const provider = makeEmptyProvider();
			const counter = makeEstimateCounter();
			const assembler = new ContextAssembler(provider, counter);

			const result = await assembler.assemble({
				systemPrompt: 'You are Axel.',
				userId: 'u1',
				query: 'hello',
			});

			expect(result.budgetUtilization.systemPrompt).toBeGreaterThan(0);
		});

		it('assembles working memory turns', async () => {
			const provider = makeEmptyProvider();
			(provider.getWorkingMemory as ReturnType<typeof vi.fn>).mockResolvedValue([
				makeTurn('Hello', 1),
				makeTurn('World', 2),
			]);
			const counter = makeEstimateCounter();
			const assembler = new ContextAssembler(provider, counter);

			const result = await assembler.assemble({
				systemPrompt: 'System',
				userId: 'u1',
				query: 'test',
			});

			const wmSection = result.sections.find((s) => s.source === 'M1:working');
			expect(wmSection).toBeDefined();
			expect(wmSection?.tokens).toBeGreaterThan(0);
			expect(wmSection?.content).toContain('Hello');
			expect(wmSection?.content).toContain('World');
		});

		it('assembles stream buffer events', async () => {
			const provider = makeEmptyProvider();
			(provider.getStreamBuffer as ReturnType<typeof vi.fn>).mockResolvedValue([makeStreamEvent()]);
			const counter = makeEstimateCounter();
			const assembler = new ContextAssembler(provider, counter);

			const result = await assembler.assemble({
				systemPrompt: 'System',
				userId: 'u1',
				query: 'test',
			});

			const streamSection = result.sections.find((s) => s.source === 'M0:stream');
			expect(streamSection).toBeDefined();
			expect(streamSection?.tokens).toBeGreaterThan(0);
		});

		it('assembles semantic search results', async () => {
			const provider = makeEmptyProvider();
			(provider.searchSemantic as ReturnType<typeof vi.fn>).mockResolvedValue([
				makeMemorySearchResult('Important fact about the user'),
			]);
			const counter = makeEstimateCounter();
			const assembler = new ContextAssembler(provider, counter);

			const result = await assembler.assemble({
				systemPrompt: 'System',
				userId: 'u1',
				query: 'user facts',
			});

			const semSection = result.sections.find((s) => s.source === 'M3:semantic');
			expect(semSection).toBeDefined();
			expect(semSection?.content).toContain('Important fact about the user');
		});

		it('assembles graph traversal results', async () => {
			const provider = makeEmptyProvider();
			(provider.traverseGraph as ReturnType<typeof vi.fn>).mockResolvedValue([makeEntity('Alice')]);
			const counter = makeEstimateCounter();
			const assembler = new ContextAssembler(provider, counter);

			const result = await assembler.assemble({
				systemPrompt: 'System',
				userId: 'u1',
				query: 'test',
				entityId: 'ent-1',
			});

			const graphSection = result.sections.find((s) => s.source === 'M4:conceptual');
			expect(graphSection).toBeDefined();
			expect(graphSection?.content).toContain('Alice');
		});

		it('assembles session archive results', async () => {
			const provider = makeEmptyProvider();
			(provider.getSessionArchive as ReturnType<typeof vi.fn>).mockResolvedValue([
				makeSessionSummary('Discussed weather'),
			]);
			const counter = makeEstimateCounter();
			const assembler = new ContextAssembler(provider, counter);

			const result = await assembler.assemble({
				systemPrompt: 'System',
				userId: 'u1',
				query: 'test',
			});

			const archiveSection = result.sections.find((s) => s.source === 'M2:episodic');
			expect(archiveSection).toBeDefined();
			expect(archiveSection?.content).toContain('Discussed weather');
		});

		it('assembles meta memory results', async () => {
			const provider = makeEmptyProvider();
			(provider.getMetaMemory as ReturnType<typeof vi.fn>).mockResolvedValue([
				makeHotMemory('Frequently accessed fact'),
			]);
			const counter = makeEstimateCounter();
			const assembler = new ContextAssembler(provider, counter);

			const result = await assembler.assemble({
				systemPrompt: 'System',
				userId: 'u1',
				query: 'test',
			});

			const metaSection = result.sections.find((s) => s.source === 'M5:meta');
			expect(metaSection).toBeDefined();
			expect(metaSection?.content).toContain('Frequently accessed fact');
		});

		it('assembles tool definitions', async () => {
			const provider = makeEmptyProvider();
			(provider.getToolDefinitions as ReturnType<typeof vi.fn>).mockReturnValue([
				makeToolDef('web_search'),
				makeToolDef('file_read'),
			]);
			const counter = makeEstimateCounter();
			const assembler = new ContextAssembler(provider, counter);

			const result = await assembler.assemble({
				systemPrompt: 'System',
				userId: 'u1',
				query: 'test',
			});

			const toolSection = result.sections.find((s) => s.name === 'toolDefinitions');
			expect(toolSection).toBeDefined();
			expect(toolSection?.content).toContain('web_search');
			expect(toolSection?.content).toContain('file_read');
		});

		it('uses token counter for accurate counting', async () => {
			const provider = makeEmptyProvider();
			const counter: TokenCounter = {
				count: vi.fn().mockResolvedValue(100),
				estimate: vi.fn().mockReturnValue(25),
			};
			const assembler = new ContextAssembler(provider, counter);

			await assembler.assemble({
				systemPrompt: 'System prompt text',
				userId: 'u1',
				query: 'test',
			});

			expect(counter.count).toHaveBeenCalled();
		});
	});

	describe('assembly order (priority)', () => {
		it('follows plan §3.3 priority order: system, working, stream, semantic, graph, session, meta, tools', async () => {
			const provider = makeEmptyProvider();
			(provider.getWorkingMemory as ReturnType<typeof vi.fn>).mockResolvedValue([
				makeTurn('Turn1', 1),
			]);
			(provider.getStreamBuffer as ReturnType<typeof vi.fn>).mockResolvedValue([makeStreamEvent()]);
			(provider.searchSemantic as ReturnType<typeof vi.fn>).mockResolvedValue([
				makeMemorySearchResult('Semantic result'),
			]);
			(provider.traverseGraph as ReturnType<typeof vi.fn>).mockResolvedValue([makeEntity('Bob')]);
			(provider.getSessionArchive as ReturnType<typeof vi.fn>).mockResolvedValue([
				makeSessionSummary('Session summary'),
			]);
			(provider.getMetaMemory as ReturnType<typeof vi.fn>).mockResolvedValue([
				makeHotMemory('Hot memory'),
			]);
			(provider.getToolDefinitions as ReturnType<typeof vi.fn>).mockReturnValue([
				makeToolDef('tool1'),
			]);

			const counter = makeEstimateCounter();
			const assembler = new ContextAssembler(provider, counter);

			const result = await assembler.assemble({
				systemPrompt: 'System',
				userId: 'u1',
				query: 'test',
				entityId: 'ent-1',
			});

			const expectedOrder = [
				'M1:working',
				'M0:stream',
				'M3:semantic',
				'M4:conceptual',
				'M2:episodic',
				'M5:meta',
			];
			const sectionSources = result.sections
				.filter((s) => s.name !== 'toolDefinitions')
				.map((s) => s.source);

			for (let i = 0; i < expectedOrder.length; i++) {
				expect(sectionSources[i]).toBe(expectedOrder[i]);
			}
		});

		it('places tool definitions last', async () => {
			const provider = makeEmptyProvider();
			(provider.getWorkingMemory as ReturnType<typeof vi.fn>).mockResolvedValue([
				makeTurn('Turn', 1),
			]);
			(provider.getToolDefinitions as ReturnType<typeof vi.fn>).mockReturnValue([
				makeToolDef('tool1'),
			]);
			const counter = makeEstimateCounter();
			const assembler = new ContextAssembler(provider, counter);

			const result = await assembler.assemble({
				systemPrompt: 'System',
				userId: 'u1',
				query: 'test',
			});

			const lastSection = result.sections[result.sections.length - 1];
			expect(lastSection?.name).toBe('toolDefinitions');
		});
	});

	describe('budget enforcement', () => {
		it('truncates content that exceeds section budget', async () => {
			const provider = makeEmptyProvider();
			const longContent = 'A'.repeat(200_000);
			(provider.getWorkingMemory as ReturnType<typeof vi.fn>).mockResolvedValue([
				makeTurn(longContent, 1),
			]);

			const counter: TokenCounter = {
				count: async (text) => text.length,
				estimate: (text) => text.length,
			};
			const tinyBudget = {
				...DEFAULT_CONTEXT_BUDGET,
				workingMemory: 100,
			};
			const assembler = new ContextAssembler(provider, counter, tinyBudget);

			const result = await assembler.assemble({
				systemPrompt: 'S',
				userId: 'u1',
				query: 'test',
			});

			const wmSection = result.sections.find((s) => s.source === 'M1:working');
			expect(wmSection).toBeDefined();
			expect(wmSection?.tokens).toBeLessThanOrEqual(100);
		});

		it('truncates systemPrompt that exceeds budget', async () => {
			const provider = makeEmptyProvider();
			const longPrompt = 'B'.repeat(50_000);

			const counter: TokenCounter = {
				count: async (text) => text.length,
				estimate: (text) => text.length,
			};
			const tinyBudget = {
				...DEFAULT_CONTEXT_BUDGET,
				systemPrompt: 100,
			};
			const assembler = new ContextAssembler(provider, counter, tinyBudget);

			const result = await assembler.assemble({
				systemPrompt: longPrompt,
				userId: 'u1',
				query: 'test',
			});

			expect(result.budgetUtilization.systemPrompt).toBeLessThanOrEqual(100);
		});

		it('preserves front of content on truncation (plan: 앞부분 유지, 뒷부분 절삭)', async () => {
			const provider = makeEmptyProvider();
			const content = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
			(provider.getWorkingMemory as ReturnType<typeof vi.fn>).mockResolvedValue([
				makeTurn(content, 1),
			]);

			const counter: TokenCounter = {
				count: async (text) => text.length,
				estimate: (text) => text.length,
			};
			const tinyBudget = {
				...DEFAULT_CONTEXT_BUDGET,
				workingMemory: 10,
			};
			const assembler = new ContextAssembler(provider, counter, tinyBudget);

			const result = await assembler.assemble({
				systemPrompt: 'S',
				userId: 'u1',
				query: 'test',
			});

			const wmSection = result.sections.find((s) => s.source === 'M1:working');
			expect(wmSection).toBeDefined();
			// Formatted: "user: ABCDEFGHIJKLMNOPQRSTUVWXYZ" (31 chars)
			// Truncated to 10 chars → should start with "user: ABCD"
			expect(wmSection?.content.startsWith('user: ')).toBe(true);
			expect(wmSection?.content.length).toBeLessThanOrEqual(10);
			// Should NOT contain the full original content
			expect(wmSection?.content).not.toContain('Z');
		});

		it('totalTokens equals sum of systemPrompt tokens + all section tokens', async () => {
			const provider = makeEmptyProvider();
			(provider.getWorkingMemory as ReturnType<typeof vi.fn>).mockResolvedValue([
				makeTurn('Hello', 1),
			]);
			(provider.getToolDefinitions as ReturnType<typeof vi.fn>).mockReturnValue([
				makeToolDef('t1'),
			]);
			const counter = makeEstimateCounter();
			const assembler = new ContextAssembler(provider, counter);

			const result = await assembler.assemble({
				systemPrompt: 'System',
				userId: 'u1',
				query: 'test',
			});

			const sectionTokenSum = result.sections.reduce((sum, s) => sum + s.tokens, 0);
			const systemTokens = result.budgetUtilization.systemPrompt ?? 0;
			expect(result.totalTokens).toBe(sectionTokenSum + systemTokens);
		});
	});

	describe('edge cases', () => {
		it('handles empty provider data gracefully', async () => {
			const provider = makeEmptyProvider();
			const counter = makeEstimateCounter();
			const assembler = new ContextAssembler(provider, counter);

			const result = await assembler.assemble({
				systemPrompt: 'System',
				userId: 'u1',
				query: 'test',
			});

			expect(result.sections).toHaveLength(0);
			expect(result.totalTokens).toBe(result.budgetUtilization.systemPrompt);
		});

		it('handles empty systemPrompt', async () => {
			const provider = makeEmptyProvider();
			const counter = makeEstimateCounter();
			const assembler = new ContextAssembler(provider, counter);

			const result = await assembler.assemble({
				systemPrompt: '',
				userId: 'u1',
				query: 'test',
			});

			expect(result.systemPrompt).toBe('');
			expect(result.budgetUtilization.systemPrompt).toBe(0);
		});

		it('skips graph traversal when no entityId provided', async () => {
			const provider = makeEmptyProvider();
			const counter = makeEstimateCounter();
			const assembler = new ContextAssembler(provider, counter);

			await assembler.assemble({
				systemPrompt: 'System',
				userId: 'u1',
				query: 'test',
			});

			expect(provider.traverseGraph).not.toHaveBeenCalled();
		});

		it('calls traverseGraph when entityId is provided', async () => {
			const provider = makeEmptyProvider();
			const counter = makeEstimateCounter();
			const assembler = new ContextAssembler(provider, counter);

			await assembler.assemble({
				systemPrompt: 'System',
				userId: 'u1',
				query: 'test',
				entityId: 'ent-1',
			});

			expect(provider.traverseGraph).toHaveBeenCalledWith('ent-1', expect.any(Number));
		});

		it('skips sections with empty content', async () => {
			const provider = makeEmptyProvider();
			(provider.getWorkingMemory as ReturnType<typeof vi.fn>).mockResolvedValue([]);
			(provider.searchSemantic as ReturnType<typeof vi.fn>).mockResolvedValue([]);
			(provider.getToolDefinitions as ReturnType<typeof vi.fn>).mockReturnValue([
				makeToolDef('t1'),
			]);
			const counter = makeEstimateCounter();
			const assembler = new ContextAssembler(provider, counter);

			const result = await assembler.assemble({
				systemPrompt: 'System',
				userId: 'u1',
				query: 'test',
			});

			expect(result.sections.every((s) => s.tokens > 0)).toBe(true);
		});

		it('does not include systemPrompt as a section', async () => {
			const provider = makeEmptyProvider();
			const counter = makeEstimateCounter();
			const assembler = new ContextAssembler(provider, counter);

			const result = await assembler.assemble({
				systemPrompt: 'You are Axel.',
				userId: 'u1',
				query: 'test',
			});

			expect(result.sections.find((s) => s.name === 'systemPrompt')).toBeUndefined();
		});
	});

	describe('data formatting', () => {
		it('formats turns as role: content pairs', async () => {
			const provider = makeEmptyProvider();
			(provider.getWorkingMemory as ReturnType<typeof vi.fn>).mockResolvedValue([
				{ ...makeTurn('Hello', 1), role: 'user' },
				{ ...makeTurn('Hi there!', 2), role: 'assistant' },
			]);
			const counter = makeEstimateCounter();
			const assembler = new ContextAssembler(provider, counter);

			const result = await assembler.assemble({
				systemPrompt: 'System',
				userId: 'u1',
				query: 'test',
			});

			const wmSection = result.sections.find((s) => s.source === 'M1:working');
			expect(wmSection?.content).toContain('user: Hello');
			expect(wmSection?.content).toContain('assistant: Hi there!');
		});

		it('formats semantic results with score', async () => {
			const provider = makeEmptyProvider();
			(provider.searchSemantic as ReturnType<typeof vi.fn>).mockResolvedValue([
				makeMemorySearchResult('The sky is blue'),
			]);
			const counter = makeEstimateCounter();
			const assembler = new ContextAssembler(provider, counter);

			const result = await assembler.assemble({
				systemPrompt: 'System',
				userId: 'u1',
				query: 'test',
			});

			const semSection = result.sections.find((s) => s.source === 'M3:semantic');
			expect(semSection?.content).toContain('The sky is blue');
			expect(semSection?.content).toContain('0.9');
		});

		it('formats entities with type and name', async () => {
			const provider = makeEmptyProvider();
			(provider.traverseGraph as ReturnType<typeof vi.fn>).mockResolvedValue([makeEntity('Alice')]);
			const counter = makeEstimateCounter();
			const assembler = new ContextAssembler(provider, counter);

			const result = await assembler.assemble({
				systemPrompt: 'System',
				userId: 'u1',
				query: 'test',
				entityId: 'ent-1',
			});

			const graphSection = result.sections.find((s) => s.source === 'M4:conceptual');
			expect(graphSection?.content).toContain('Alice');
			expect(graphSection?.content).toContain('person');
		});

		it('formats session summaries', async () => {
			const provider = makeEmptyProvider();
			(provider.getSessionArchive as ReturnType<typeof vi.fn>).mockResolvedValue([
				makeSessionSummary('Talked about AI'),
			]);
			const counter = makeEstimateCounter();
			const assembler = new ContextAssembler(provider, counter);

			const result = await assembler.assemble({
				systemPrompt: 'System',
				userId: 'u1',
				query: 'test',
			});

			const archSection = result.sections.find((s) => s.source === 'M2:episodic');
			expect(archSection?.content).toContain('Talked about AI');
		});

		it('formats tool definitions with name and description', async () => {
			const provider = makeEmptyProvider();
			(provider.getToolDefinitions as ReturnType<typeof vi.fn>).mockReturnValue([
				makeToolDef('search'),
			]);
			const counter = makeEstimateCounter();
			const assembler = new ContextAssembler(provider, counter);

			const result = await assembler.assemble({
				systemPrompt: 'System',
				userId: 'u1',
				query: 'test',
			});

			const toolSection = result.sections.find((s) => s.name === 'toolDefinitions');
			expect(toolSection?.content).toContain('search');
			expect(toolSection?.content).toContain('Tool search');
		});

		it('formats stream events with type and metadata', async () => {
			const provider = makeEmptyProvider();
			(provider.getStreamBuffer as ReturnType<typeof vi.fn>).mockResolvedValue([
				makeStreamEvent('typing_start'),
			]);
			const counter = makeEstimateCounter();
			const assembler = new ContextAssembler(provider, counter);

			const result = await assembler.assemble({
				systemPrompt: 'System',
				userId: 'u1',
				query: 'test',
			});

			const streamSection = result.sections.find((s) => s.source === 'M0:stream');
			expect(streamSection?.content).toContain('typing_start');
		});

		it('formats meta memory hot memories', async () => {
			const provider = makeEmptyProvider();
			(provider.getMetaMemory as ReturnType<typeof vi.fn>).mockResolvedValue([
				makeHotMemory('User likes coffee'),
			]);
			const counter = makeEstimateCounter();
			const assembler = new ContextAssembler(provider, counter);

			const result = await assembler.assemble({
				systemPrompt: 'System',
				userId: 'u1',
				query: 'test',
			});

			const metaSection = result.sections.find((s) => s.source === 'M5:meta');
			expect(metaSection?.content).toContain('User likes coffee');
		});
	});

	describe('multiple items in a section', () => {
		it('combines multiple turns in working memory', async () => {
			const provider = makeEmptyProvider();
			(provider.getWorkingMemory as ReturnType<typeof vi.fn>).mockResolvedValue([
				makeTurn('First message', 1),
				makeTurn('Second message', 2),
				makeTurn('Third message', 3),
			]);
			const counter = makeEstimateCounter();
			const assembler = new ContextAssembler(provider, counter);

			const result = await assembler.assemble({
				systemPrompt: 'System',
				userId: 'u1',
				query: 'test',
			});

			const wmSection = result.sections.find((s) => s.source === 'M1:working');
			expect(wmSection?.content).toContain('First message');
			expect(wmSection?.content).toContain('Second message');
			expect(wmSection?.content).toContain('Third message');
		});

		it('combines multiple semantic results', async () => {
			const provider = makeEmptyProvider();
			(provider.searchSemantic as ReturnType<typeof vi.fn>).mockResolvedValue([
				makeMemorySearchResult('Fact A'),
				makeMemorySearchResult('Fact B'),
			]);
			const counter = makeEstimateCounter();
			const assembler = new ContextAssembler(provider, counter);

			const result = await assembler.assemble({
				systemPrompt: 'System',
				userId: 'u1',
				query: 'test',
			});

			const semSection = result.sections.find((s) => s.source === 'M3:semantic');
			expect(semSection?.content).toContain('Fact A');
			expect(semSection?.content).toContain('Fact B');
		});
	});
});
