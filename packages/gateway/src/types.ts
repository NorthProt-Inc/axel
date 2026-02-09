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
	readonly discordApplicationId?: string;
	readonly trustedProxies?: readonly string[];
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

/**
 * Callback for Discord interaction follow-up messages.
 * Sends the final response via PATCH to Discord's webhook endpoint:
 * https://discord.com/api/v10/webhooks/{applicationId}/{interactionToken}/messages/@original
 */
export type DiscordFollowUp = (
	applicationId: string,
	interactionToken: string,
	content: string,
) => Promise<void>;

/** Session summary for session list API */
export interface SessionListItem {
	readonly sessionId: string;
	readonly title: string;
	readonly channelId: string;
	readonly turnCount: number;
	readonly startedAt: string;
	readonly endedAt: string | null;
}

/** Message record for session messages API */
export interface SessionMessageItem {
	readonly role: string;
	readonly content: string;
	readonly channelId: string;
	readonly timestamp: string;
}

export interface GatewayDeps {
	readonly healthCheck: () => Promise<HealthStatus>;
	readonly handleMessage?: HandleMessage;
	readonly discordFollowUp?: DiscordFollowUp;
	readonly searchMemory?: (params: MemorySearchParams) => Promise<MemorySearchResponse>;
	readonly getMemoryStats?: () => Promise<Record<string, unknown>>;
	readonly getSession?: (userId: string) => Promise<Record<string, unknown> | null>;
	readonly endSession?: (sessionId: string) => Promise<Record<string, unknown>>;
	readonly listSessions?: (userId: string) => Promise<readonly SessionListItem[]>;
	readonly getSessionMessages?: (sessionId: string) => Promise<readonly SessionMessageItem[]>;
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
