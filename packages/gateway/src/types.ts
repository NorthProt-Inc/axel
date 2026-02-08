import type * as http from 'node:http';
import type { HealthStatus } from '@axel/core/types';

export interface GatewayConfig {
	readonly port: number;
	readonly host: string;
	readonly authToken: string;
	readonly env: 'development' | 'production' | 'test';
	readonly corsOrigins: readonly string[];
	readonly rateLimitPerMinute: number;
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
	message: { readonly userId: string; readonly channelId: string; readonly content: string },
	onEvent?: (event: MessageEvent) => void,
) => Promise<MessageResult>;

export interface GatewayDeps {
	readonly healthCheck: () => Promise<HealthStatus>;
	readonly handleMessage?: HandleMessage;
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
