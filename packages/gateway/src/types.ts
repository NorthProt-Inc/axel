import type * as http from 'node:http';
import type { HealthStatus } from '@axel/core/types';

export interface GatewayConfig {
	readonly port: number;
	readonly host: string;
	readonly authToken: string;
	readonly env: 'development' | 'production' | 'test';
	readonly corsOrigins: readonly string[];
	readonly rateLimitPerMinute: number;
	readonly telegramWebhookSecret?: string;
	readonly discordPublicKey?: string;
}

/** Event emitted during streaming message processing */
export interface MessageEvent {
	readonly type: string;
	readonly [key: string]: unknown;
}

/** Result from the message handler */
export interface MessageResult {
	readonly content: string;
	readonly sessionId: string;
	readonly channelSwitched: boolean;
	readonly usage: {
		readonly inputTokens: number;
		readonly outputTokens: number;
		readonly cacheReadTokens: number;
		readonly cacheCreationTokens: number;
	};
}

/**
 * Message handler function injected via DI.
 *
 * Maps to InboundHandler in the composition root (apps/axel/).
 * The optional onEvent callback enables streaming: each ReActEvent
 * is forwarded to the caller for SSE/WS streaming.
 */
export type HandleMessage = (
	message: {
		readonly userId: string;
		readonly channelId: string;
		readonly content: string;
		readonly timestamp: number;
	},
	onEvent?: (event: MessageEvent) => void,
) => Promise<MessageResult>;

/** Memory search request parameters */
export interface MemorySearchParams {
	readonly query: string;
	readonly limit?: number;
	readonly memoryTypes?: readonly string[];
	readonly channelFilter?: string;
	readonly minImportance?: number;
	readonly hybridSearch?: boolean;
}

/** Memory search result */
export interface MemorySearchResponse {
	readonly results: readonly Record<string, unknown>[];
	readonly totalMatches: number;
}

/** Tool execution request */
export interface ToolExecuteParams {
	readonly name: string;
	readonly args: Readonly<Record<string, unknown>>;
}

/** Tool execution result */
export interface ToolExecuteResult {
	readonly success: boolean;
	readonly content: unknown;
	readonly error?: string;
	readonly durationMs: number;
}

export interface GatewayDeps {
	readonly healthCheck: () => Promise<HealthStatus>;
	readonly handleMessage?: HandleMessage;
	readonly searchMemory?: (params: MemorySearchParams) => Promise<MemorySearchResponse>;
	readonly getMemoryStats?: () => Promise<Record<string, unknown>>;
	readonly getSession?: (userId: string) => Promise<Record<string, unknown> | null>;
	readonly endSession?: (sessionId: string) => Promise<Record<string, unknown>>;
	readonly listTools?: () => readonly Record<string, unknown>[];
	readonly executeTool?: (params: ToolExecuteParams) => Promise<ToolExecuteResult>;
}

export type RouteHandler = (
	req: http.IncomingMessage,
	res: http.ServerResponse,
	body: string,
) => Promise<void>;

export interface Route {
	readonly method: string;
	readonly path: string;
	readonly requiresAuth: boolean;
	readonly handler: RouteHandler;
}
