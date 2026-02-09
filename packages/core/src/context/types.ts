import { z } from 'zod';
import type { Entity, HotMemory, StreamEvent, Turn } from '../memory/types.js';
import type { MemorySearchResult } from '../types/memory.js';
import type { SessionSummary } from '../types/session.js';
import type { ToolDefinition } from '../types/tool.js';

// ─── Context Budget (ADR-012, plan §3.3 lines 1101-1111) ───

/** Zod schema for context budget — 8 slots, all positive integers */
export const ContextBudgetSchema = z.object({
	systemPrompt: z.number().int().positive(),
	streamBuffer: z.number().int().positive(),
	workingMemory: z.number().int().positive(),
	semanticSearch: z.number().int().positive(),
	graphTraversal: z.number().int().positive(),
	sessionArchive: z.number().int().positive(),
	metaMemory: z.number().int().positive(),
	toolDefinitions: z.number().int().positive(),
});

/** Token budget allocation for context assembly (8 slots, 76K total) */
export type ContextBudget = z.infer<typeof ContextBudgetSchema>;

/** Default budget values per plan §3.3 — total 76,000 tokens */
export const DEFAULT_CONTEXT_BUDGET: ContextBudget = {
	systemPrompt: 8_000,
	streamBuffer: 2_000,
	workingMemory: 40_000,
	semanticSearch: 12_000,
	graphTraversal: 4_000,
	sessionArchive: 4_000,
	metaMemory: 2_000,
	toolDefinitions: 4_000,
} as const;

// ─── Context Section & Assembled Context ───

/** A single section of assembled context with source annotation */
export interface ContextSection {
	readonly name: string;
	readonly content: string;
	readonly tokens: number;
	readonly source: string;
}

/** Fully assembled context ready for LLM call */
export interface AssembledContext {
	readonly systemPrompt: string;
	readonly sections: readonly ContextSection[];
	readonly totalTokens: number;
	readonly budgetUtilization: Readonly<Record<string, number>>;
}

// ─── DI Contracts ───

/**
 * Data provider for context assembly (DI contract, ADR-006).
 *
 * 7 data methods — one per memory layer + tool definitions.
 * Implementations live in packages/infra; core defines the contract.
 */
export interface ContextDataProvider {
	getWorkingMemory(userId: string, limit: number): Promise<readonly Turn[]>;
	searchSemantic(query: string, limit: number): Promise<readonly MemorySearchResult[]>;
	traverseGraph(entityId: string, depth: number): Promise<readonly Entity[]>;
	searchEntities?(query: string): Promise<Entity | null>;
	getSessionArchive(userId: string, days: number): Promise<readonly SessionSummary[]>;
	getStreamBuffer(userId: string): Promise<readonly StreamEvent[]>;
	getMetaMemory(userId: string): Promise<readonly HotMemory[]>;
	getToolDefinitions(): readonly ToolDefinition[];
}

/**
 * Token counter interface (ADR-012).
 *
 * - `count()`: Accurate count via Anthropic SDK countTokens() — async API call
 * - `estimate()`: Fast local estimate (~text.length / 4) for pre-filtering
 */
export interface TokenCounter {
	count(text: string): Promise<number>;
	estimate(text: string): number;
}
