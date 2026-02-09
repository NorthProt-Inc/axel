import { z } from 'zod';
import type { Message } from '../types/message.js';
import type { ToolCallRequest } from '../types/react.js';
import type { SessionState, SessionSummary } from '../types/session.js';
import type { ToolDefinition, ToolResult } from '../types/tool.js';

// ─── ReAct Configuration (plan §4.6 lines 1396-1401) ───

/** Zod schema for ReAct loop configuration */
export const ReActConfigSchema = z.object({
	maxIterations: z.number().int().positive(),
	toolTimeoutMs: z.number().int().positive(),
	totalTimeoutMs: z.number().int().positive(),
	streamingEnabled: z.boolean(),
});

/** ReAct loop configuration */
export type ReActConfig = z.infer<typeof ReActConfigSchema>;

/** Default ReAct config per plan §4.6 */
export const DEFAULT_REACT_CONFIG: ReActConfig = {
	maxIterations: 15,
	toolTimeoutMs: 30_000,
	totalTimeoutMs: 300_000,
	streamingEnabled: true,
} as const;

// ─── Unified Session (ADR-014) ───

/** Unified session spanning multiple channels */
export interface UnifiedSession {
	readonly sessionId: string;
	readonly userId: string;
	readonly activeChannelId: string;
	readonly channelHistory: readonly string[];
	readonly state: SessionState;
	readonly startedAt: Date;
	readonly lastActivityAt: Date;
	readonly turnCount: number;
}

/** Result of session resolution — new or existing */
export interface ResolvedSession {
	readonly session: UnifiedSession;
	readonly isNew: boolean;
	readonly channelSwitched: boolean;
	readonly previousSession: SessionSummary | null;
}

/** Channel switching metadata for LLM context */
export interface ChannelContext {
	readonly currentChannel: string;
	readonly previousChannel: string | null;
	readonly channelSwitched: boolean;
	readonly sessionChannels: readonly string[];
}

/** Per-session usage statistics */
export interface SessionStats {
	readonly totalTurns: number;
	readonly channelBreakdown: Readonly<Record<string, number>>;
	readonly avgResponseTimeMs: number;
	readonly toolsUsed: readonly string[];
}

// ─── DI Contracts ───

/** LLM streaming chunk (text, thinking, or tool_call) */
export type LlmChatChunk =
	| { readonly type: 'text'; readonly content: string }
	| { readonly type: 'thinking'; readonly content: string }
	| { readonly type: 'tool_call'; readonly content: ToolCallRequest };

/** Chat params for LLM provider */
export interface LlmChatParams {
	readonly messages: readonly Message[];
	readonly tools: readonly ToolDefinition[];
}

/**
 * LLM Provider interface (DI contract).
 *
 * Returns an async iterable of streaming chunks.
 * Implementations live in packages/infra; core defines the contract.
 */
export interface LlmProvider {
	chat(params: LlmChatParams): AsyncIterable<LlmChatChunk>;
	/** Whether this provider supports vision/image inputs (RES-009) */
	readonly supportsVision?: boolean;
}

/**
 * Tool executor interface (DI contract).
 *
 * Executes a tool call with timeout and returns a ToolResult.
 * Implementations live in packages/infra; core defines the contract.
 */
export interface ToolExecutor {
	execute(call: ToolCallRequest, timeoutMs: number): Promise<ToolResult>;
}

/**
 * Session store interface (DI contract, ADR-014).
 *
 * Manages session lifecycle: resolve, update, get, end.
 * Implementations live in packages/infra (Redis + PG).
 */
export interface SessionStore {
	resolve(userId: string, channelId: string): Promise<ResolvedSession>;
	updateActivity(sessionId: string): Promise<void>;
	getActive(userId: string): Promise<UnifiedSession | null>;
	getStats(sessionId: string): Promise<SessionStats>;
	end(sessionId: string): Promise<SessionSummary>;
}
