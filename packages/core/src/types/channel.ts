import type { HealthStatus } from './health.js';

/** Channel presence status */
export type PresenceStatus = 'online' | 'idle' | 'dnd' | 'offline';

/** Media attachment type */
export interface MediaAttachment {
	readonly type: 'image' | 'audio' | 'video' | 'file';
	readonly url: string;
	readonly mimeType?: string;
	readonly fileName?: string;
	readonly sizeBytes?: number;
}

/**
 * Channel capability declaration.
 * Each channel adapter declares what features it supports.
 */
export interface ChannelCapabilities {
	readonly streaming: boolean;
	readonly richMedia: boolean;
	readonly reactions: boolean;
	readonly threads: boolean;
	readonly voiceInput: boolean;
	readonly maxMessageLength: number;
	readonly typingIndicator: boolean;
}

/**
 * Inbound message from a channel (channel → Axel).
 * All channel messages are normalized into this format.
 */
export interface InboundMessage {
	readonly userId: string;
	readonly channelId: string;
	readonly content: string;
	readonly media?: readonly MediaAttachment[];
	readonly replyTo?: string;
	readonly threadId?: string;
	readonly timestamp: Date;
	/** Raw channel-specific event for debugging */
	readonly rawEvent?: unknown;
}

/**
 * Outbound message from Axel to a channel.
 */
export interface OutboundMessage {
	readonly content: string;
	readonly media?: readonly MediaAttachment[];
	readonly replyTo?: string;
	readonly format?: 'text' | 'markdown' | 'html';
}

/** Inbound message handler callback (ERR-009) */
export type InboundHandler = (message: InboundMessage) => Promise<void>;

/**
 * Channel adapter interface (OpenClaw pattern, ADR-009).
 *
 * Each channel (Discord, Telegram, CLI, WebChat) implements this interface.
 * Capabilities declare what features the channel supports.
 * Optional methods are only implemented by channels that support them.
 */
export interface AxelChannel {
	readonly id: string;
	readonly capabilities: ChannelCapabilities;

	/** Start the channel adapter (connect, listen) */
	start(): Promise<void>;
	/** Stop the channel adapter (disconnect, cleanup) */
	stop(): Promise<void>;
	/** Health check for the channel */
	healthCheck(): Promise<HealthStatus>;

	/**
	 * Reconnection lifecycle (ERR-042).
	 * Exponential backoff (1s → 2s → 4s → ... → 60s max) + circuit breaker.
	 * Reconnection failure → healthCheck() returns "unhealthy".
	 */
	onDisconnect?(handler: (reason: string) => void): void;
	onReconnect?(handler: () => void): void;

	/** Register inbound message handler (channel → Axel) */
	onMessage(handler: InboundHandler): void;
	/** Register typing start handler (triggers Stream Buffer) */
	onTypingStart?(handler: (userId: string) => void): void;

	/** Send a message to a target (Axel → channel) */
	send(target: string, msg: OutboundMessage): Promise<void>;
	/** Send streaming response (channels with streaming capability) */
	sendStreaming?(target: string, stream: AsyncIterable<string>): Promise<void>;

	/** Set channel presence status */
	setPresence?(status: PresenceStatus): Promise<void>;
	/** Add a reaction to a message */
	addReaction?(messageId: string, emoji: string): Promise<void>;
}
