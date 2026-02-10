import type { Entity, HotMemory, StreamEvent, Turn } from '../memory/types.js';
import type { MemorySearchResult } from '../types/memory.js';
import type { SessionSummary } from '../types/session.js';
import type { ToolDefinition } from '../types/tool.js';
import {
	type AssembledContext,
	type ContextBudget,
	type ContextDataProvider,
	type ContextSection,
	DEFAULT_CONTEXT_BUDGET,
	type TokenCounter,
} from './types.js';

/** Input parameters for context assembly */
export interface AssembleParams {
	readonly systemPrompt: string;
	readonly userId: string;
	readonly query: string;
	readonly entityId?: string;
}

/** Default limits for data provider calls */
const DEFAULTS = {
	workingMemoryLimit: 20,
	semanticSearchLimit: 10,
	graphDepth: 2,
	sessionArchiveDays: 30,
} as const;

/**
 * Context Assembler — priority-ordered context window assembly.
 *
 * Takes data from ContextDataProvider (DI), counts tokens with TokenCounter,
 * and produces an AssembledContext within budget. No I/O performed directly.
 *
 * Assembly order (plan §3.3):
 * 1. System Prompt (immutable, highest priority)
 * 2. Working Memory (current conversation)
 * 3. Stream Buffer (real-time events)
 * 4. Semantic Search (query-relevant long-term memory)
 * 5. Graph Traversal (entity relationships)
 * 6. Session Archive (previous session summaries)
 * 7. Meta Memory (prefetched hot memories)
 * 8. Tool Definitions (available tools)
 */
export class ContextAssembler {
	private readonly provider: ContextDataProvider;
	private readonly counter: TokenCounter;
	private readonly budget: ContextBudget;

	constructor(
		provider: ContextDataProvider,
		counter: TokenCounter,
		budget: ContextBudget = DEFAULT_CONTEXT_BUDGET,
	) {
		this.provider = provider;
		this.counter = counter;
		this.budget = budget;
	}

	/** Assemble context within token budget */
	async assemble(params: AssembleParams): Promise<AssembledContext> {
		const { systemPrompt, userId, query, entityId } = params;

		const truncatedSystemPrompt = await this.truncateToFit(systemPrompt, this.budget.systemPrompt);
		const systemTokens = truncatedSystemPrompt
			? await this.counter.count(truncatedSystemPrompt)
			: 0;

		const sections: ContextSection[] = [];

		// 1. Working Memory (M1)
		const turns = await this.provider.getWorkingMemory(userId, DEFAULTS.workingMemoryLimit);
		await this.addSection(
			sections,
			'workingMemory',
			'M1:working',
			formatTurns(turns),
			this.budget.workingMemory,
		);

		// 2. Stream Buffer (M0)
		const events = await this.provider.getStreamBuffer(userId);
		await this.addSection(
			sections,
			'streamBuffer',
			'M0:stream',
			formatStreamEvents(events),
			this.budget.streamBuffer,
		);

		// 3. Semantic Search (M3)
		const memories = await this.provider.searchSemantic(query, DEFAULTS.semanticSearchLimit);
		await this.addSection(
			sections,
			'semanticSearch',
			'M3:semantic',
			formatSemanticResults(memories),
			this.budget.semanticSearch,
		);

		// 4. Graph Traversal (M4) — resolve entityId from query if not provided
		let resolvedEntityId = entityId;
		if (resolvedEntityId === undefined && this.provider.searchEntities) {
			const entity = await this.provider.searchEntities(query);
			if (entity) {
				resolvedEntityId = entity.entityId;
			}
		}
		if (resolvedEntityId !== undefined) {
			const entities = await this.provider.traverseGraph(resolvedEntityId, DEFAULTS.graphDepth);
			await this.addSection(
				sections,
				'graphTraversal',
				'M4:conceptual',
				formatEntities(entities),
				this.budget.graphTraversal,
			);
		}

		// 5. Session Archive (M2)
		const summaries = await this.provider.getSessionArchive(userId, DEFAULTS.sessionArchiveDays);
		await this.addSection(
			sections,
			'sessionArchive',
			'M2:episodic',
			formatSessionSummaries(summaries),
			this.budget.sessionArchive,
		);

		// 6. Meta Memory (M5)
		const hotMemories = await this.provider.getMetaMemory(userId);
		await this.addSection(
			sections,
			'metaMemory',
			'M5:meta',
			formatHotMemories(hotMemories),
			this.budget.metaMemory,
		);

		// 7. Tool Definitions (last)
		const tools = this.provider.getToolDefinitions();
		await this.addSection(
			sections,
			'toolDefinitions',
			'tools',
			formatToolDefinitions(tools),
			this.budget.toolDefinitions,
		);

		const sectionTokenSum = sections.reduce((sum, s) => sum + s.tokens, 0);
		const budgetUtilization: Record<string, number> = { systemPrompt: systemTokens };
		for (const section of sections) {
			budgetUtilization[section.name] = section.tokens;
		}

		return {
			systemPrompt: truncatedSystemPrompt,
			sections,
			totalTokens: systemTokens + sectionTokenSum,
			budgetUtilization,
		};
	}

	private async addSection(
		sections: ContextSection[],
		name: string,
		source: string,
		content: string,
		budget: number,
	): Promise<void> {
		if (content.length === 0) {
			return;
		}

		const truncated = await this.truncateToFit(content, budget);
		if (truncated.length === 0) {
			return;
		}

		const tokens = await this.counter.count(truncated);
		sections.push({ name, content: truncated, tokens, source });
	}

	/**
	 * Truncate text to fit within maxTokens budget.
	 *
	 * PERF-C1: Uses estimate-based single pass + verification instead of
	 * binary search. Maximum 3 count() calls instead of O(log n).
	 *
	 * Algorithm:
	 * 1. Fast estimate pre-check; if fits, verify with 1 count() call.
	 * 2. If text exceeds budget: count() full text to derive chars-per-token ratio.
	 * 3. Calculate cut point from ratio (with 5% safety margin), verify with count().
	 * 4. If still over, shrink proportionally once more (max 3 count() calls total).
	 */
	private async truncateToFit(text: string, maxTokens: number): Promise<string> {
		if (text.length === 0) {
			return '';
		}

		// Fast path: estimate says it fits → verify with 1 count() call
		const estimated = this.counter.estimate(text);
		if (estimated <= maxTokens) {
			const actual = await this.counter.count(text); // call 1
			if (actual <= maxTokens) {
				return text;
			}
			// Estimate was wrong (under-estimated). Use actual count to derive ratio.
			return this.truncateByRatio(text, maxTokens, actual);
		}

		// Estimate says it won't fit. Count full text to get accurate ratio.
		const fullCount = await this.counter.count(text); // call 1
		if (fullCount <= maxTokens) {
			return text;
		}

		return this.truncateByRatio(text, maxTokens, fullCount);
	}

	/**
	 * Ratio-based truncation: given the full text's actual token count,
	 * estimate the right cut point and verify. Uses at most 2 more count() calls.
	 */
	private async truncateByRatio(
		text: string,
		maxTokens: number,
		fullTokens: number,
	): Promise<string> {
		const charsPerToken = text.length / fullTokens;

		// Cut with 5% safety margin to avoid overshooting
		const cutChars = Math.floor(maxTokens * charsPerToken * 0.95);
		const candidate1 = text.slice(0, Math.max(0, Math.min(cutChars, text.length)));

		if (candidate1.length === 0) {
			return '';
		}

		const tokens1 = await this.counter.count(candidate1); // call 2
		if (tokens1 <= maxTokens) {
			return candidate1;
		}

		// Still over budget — shrink proportionally based on actual overshoot
		const shrinkRatio = maxTokens / tokens1;
		const cutChars2 = Math.floor(candidate1.length * shrinkRatio * 0.95);
		const candidate2 = text.slice(0, Math.max(0, cutChars2));

		if (candidate2.length === 0) {
			return '';
		}

		const tokens2 = await this.counter.count(candidate2); // call 3
		if (tokens2 <= maxTokens) {
			return candidate2;
		}

		// Final safety: if still over after 3 calls, do a conservative hard cut
		// based on character-level estimation (no additional count() call)
		const hardCut = Math.floor(candidate2.length * (maxTokens / tokens2) * 0.9);
		return text.slice(0, Math.max(0, hardCut));
	}
}

// ─── Formatters (pure functions) ───

function formatTurns(turns: readonly Turn[]): string {
	return turns.map((t) => `${t.role}: ${t.content}`).join('\n');
}

function formatStreamEvents(events: readonly StreamEvent[]): string {
	return events.map((e) => `[${e.type}] ${e.channelId} ${JSON.stringify(e.metadata)}`).join('\n');
}

function formatSemanticResults(results: readonly MemorySearchResult[]): string {
	return results.map((r) => `[${r.score}] ${r.memory.content}`).join('\n');
}

function formatEntities(entities: readonly Entity[]): string {
	return entities.map((e) => `${e.entityType}: ${e.name} (mentions: ${e.mentionCount})`).join('\n');
}

function formatSessionSummaries(summaries: readonly SessionSummary[]): string {
	return summaries.map((s) => `[${s.keyTopics.join(', ')}] ${s.summary}`).join('\n');
}

function formatHotMemories(memories: readonly HotMemory[]): string {
	return memories
		.map((m) => `[access: ${m.accessCount}, diversity: ${m.channelDiversity}] ${m.content}`)
		.join('\n');
}

function formatToolDefinitions(tools: readonly ToolDefinition[]): string {
	return tools.map((t) => `${t.name}: ${t.description}`).join('\n');
}
