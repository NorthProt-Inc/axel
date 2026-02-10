import type {
	AxelChannel,
	ChannelCapabilities,
	HealthStatus,
	InboundHandler,
	InboundMessage,
	OutboundMessage,
} from '@axel/core/types';
import { Client, Events, GatewayIntentBits } from 'discord.js';
import type { Message } from 'discord.js';
import { splitMessage } from '../utils/split-message.js';

/** Sendable channel subset — excludes PartialGroupDMChannel (no send method) */
interface SendableChannel {
	readonly id: string;
	send(options: { content: string }): Promise<Message>;
	sendTyping(): Promise<void>;
}

const DISCORD_CHANNEL_ID = 'discord';
const DISCORD_MAX_MESSAGE_LENGTH = 2000;
const STREAMING_EDIT_INTERVAL_MS = 1000;

/** Maximum cached channels before oldest entries are evicted (FIFO). */
export const MAX_CHANNEL_CACHE_SIZE = 500;

const DISCORD_CAPABILITIES: ChannelCapabilities = {
	streaming: true,
	richMedia: true,
	reactions: true,
	threads: true,
	voiceInput: false,
	maxMessageLength: DISCORD_MAX_MESSAGE_LENGTH,
	typingIndicator: true,
};

export interface DiscordChannelOptions {
	readonly token: string;
	readonly createClient?: () => Client;
	readonly onError?: (err: unknown) => void;
}

export class DiscordChannel implements AxelChannel {
	readonly id = DISCORD_CHANNEL_ID;
	readonly capabilities = DISCORD_CAPABILITIES;

	private client: Client | null = null;
	private started = false;
	private startedAt: Date | null = null;
	private reconnecting = false;
	private readonly handlers: InboundHandler[] = [];
	private readonly disconnectHandlers: Array<(reason: string) => void> = [];
	private readonly reconnectHandlers: Array<() => void> = [];
	private readonly channelCache = new Map<string, SendableChannel>();

	private readonly token: string;
	private readonly createClientFn: () => Client;
	private readonly onErrorFn: (err: unknown) => void;

	constructor(options: DiscordChannelOptions) {
		this.token = options.token;
		this.createClientFn =
			options.createClient ??
			(() =>
				new Client({
					intents: [
						GatewayIntentBits.Guilds,
						GatewayIntentBits.GuildMessages,
						GatewayIntentBits.MessageContent,
						GatewayIntentBits.DirectMessages,
					],
				}));
		this.onErrorFn = options.onError ?? (() => {});
	}

	async start(): Promise<void> {
		if (this.started) {
			throw new Error('Discord channel already started');
		}

		this.client = this.createClientFn();
		this.setupEventHandlers(this.client);

		const readyPromise = new Promise<void>((resolve) => {
			this.client?.once(Events.ClientReady, () => {
				resolve();
			});
		});

		await this.client.login(this.token);
		await readyPromise;

		this.started = true;
		this.startedAt = new Date();
	}

	async stop(): Promise<void> {
		if (!this.started) {
			return;
		}

		this.started = false;
		this.channelCache.clear();
		this.client?.removeAllListeners();
		this.client?.destroy();
		this.client = null;
	}

	async healthCheck(): Promise<HealthStatus> {
		const now = new Date();
		const uptime =
			this.started && this.startedAt ? (now.getTime() - this.startedAt.getTime()) / 1000 : 0;

		const state = this.started ? (this.reconnecting ? 'degraded' : 'healthy') : 'unhealthy';

		const wsPing = this.client?.ws?.ping ?? -1;
		return {
			state,
			checks: {
				wsPing: {
					state,
					latencyMs: wsPing >= 0 ? wsPing : null,
					message: wsPing < 0 ? 'WebSocket not connected' : null,
					lastChecked: now,
				},
			},
			timestamp: now,
			uptime,
		};
	}

	onMessage(handler: InboundHandler): void {
		this.handlers.push(handler);
	}

	onDisconnect(handler: (reason: string) => void): void {
		this.disconnectHandlers.push(handler);
	}

	onReconnect(handler: () => void): void {
		this.reconnectHandlers.push(handler);
	}

	async send(target: string, msg: OutboundMessage): Promise<void> {
		if (!this.started) {
			throw new Error('Discord channel not started');
		}

		const discordChannel = this.channelCache.get(target);
		if (!discordChannel) {
			throw new Error(`Unknown Discord channel: ${target}`);
		}

		const chunks = splitMessage(msg.content, DISCORD_MAX_MESSAGE_LENGTH);
		for (const chunk of chunks) {
			await discordChannel.send({ content: chunk });
		}
	}

	async sendStreaming(target: string, stream: AsyncIterable<string>): Promise<void> {
		if (!this.started) {
			throw new Error('Discord channel not started');
		}

		const discordChannel = this.channelCache.get(target);
		if (!discordChannel) {
			throw new Error(`Unknown Discord channel: ${target}`);
		}

		const state = createStreamingState();

		for await (const chunk of stream) {
			state.accumulated += chunk;
			await this.handleOverflow(state);
			await this.throttledEdit(state, discordChannel);
		}

		await this.finalizeStream(state, discordChannel);
	}

	private async handleOverflow(state: StreamingState): Promise<void> {
		if (state.accumulated.length <= DISCORD_MAX_MESSAGE_LENGTH || !state.sentMessage) {
			return;
		}
		const finalContent = state.accumulated.slice(0, DISCORD_MAX_MESSAGE_LENGTH);
		await state.sentMessage.edit({ content: finalContent });
		state.accumulated = state.accumulated.slice(DISCORD_MAX_MESSAGE_LENGTH);
		state.sentMessage = null;
	}

	private async throttledEdit(state: StreamingState, ch: SendableChannel): Promise<void> {
		const now = Date.now();
		if (now - state.lastEditTime < STREAMING_EDIT_INTERVAL_MS) {
			return;
		}
		const displayContent = state.accumulated.slice(0, DISCORD_MAX_MESSAGE_LENGTH);
		if (state.sentMessage) {
			await state.sentMessage.edit({ content: displayContent });
		} else {
			state.sentMessage = (await ch.send({ content: displayContent })) as Message;
		}
		state.lastEditTime = now;
	}

	private async finalizeStream(state: StreamingState, ch: SendableChannel): Promise<void> {
		if (state.accumulated.length === 0) {
			return;
		}
		const displayContent = state.accumulated.slice(0, DISCORD_MAX_MESSAGE_LENGTH);
		if (state.sentMessage) {
			await state.sentMessage.edit({ content: displayContent });
		} else {
			await ch.send({ content: displayContent });
		}
	}

	async addReaction(messageId: string, emoji: string): Promise<void> {
		if (!this.started) {
			throw new Error('Discord channel not started');
		}
		// Message reactions require message cache lookup
		// Implemented as no-op for now; full impl needs message cache strategy
		void messageId;
		void emoji;
	}

	private setupEventHandlers(client: Client): void {
		client.on(Events.MessageCreate, (message: Message) => {
			this.handleInboundMessage(message);
		});

		client.on(Events.Error, (error: Error) => {
			this.reconnecting = true;
			this.onErrorFn(error);
		});

		client.on('disconnect' as string, (event: unknown) => {
			this.reconnecting = true;
			const reason =
				typeof event === 'object' && event !== null && 'reason' in event
					? String((event as { reason: unknown }).reason)
					: 'Unknown disconnect reason';
			for (const handler of this.disconnectHandlers) {
				handler(reason);
			}
		});

		client.on(Events.ShardReconnecting, () => {
			this.reconnecting = true;
			for (const handler of this.reconnectHandlers) {
				handler();
			}
		});

		client.on(Events.ShardReady, () => {
			this.reconnecting = false;
		});
	}

	/** Insert or promote a channel in the cache, evicting the oldest entry when full. */
	private cacheChannel(id: string, ch: SendableChannel): void {
		// Delete first so re-insertion moves the key to the end (LRU promotion)
		this.channelCache.delete(id);
		this.channelCache.set(id, ch);
		if (this.channelCache.size > MAX_CHANNEL_CACHE_SIZE) {
			// Map iteration order = insertion order; first key is the oldest
			const oldest = this.channelCache.keys().next().value;
			if (oldest !== undefined) {
				this.channelCache.delete(oldest);
			}
		}
	}

	private handleInboundMessage(message: Message): void {
		if (message.author.bot) {
			return;
		}

		const trimmed = message.content.trim();
		if (trimmed.length === 0) {
			return;
		}

		// Cache the channel for outbound messages (LRU-evicting)
		this.cacheChannel(message.channelId, message.channel as SendableChannel);

		const isThread = message.channel.isThread?.();
		const inbound: InboundMessage = {
			userId: message.author.id,
			channelId: message.channelId,
			content: trimmed,
			...(isThread ? { threadId: message.channelId } : {}),
			timestamp: message.createdAt,
			rawEvent: message,
		};

		for (const handler of this.handlers) {
			handler(inbound).catch((err: unknown) => {
				this.onErrorFn(err);
			});
		}
	}
}

interface StreamingState {
	accumulated: string;
	sentMessage: Message | null;
	lastEditTime: number;
}

function createStreamingState(): StreamingState {
	return { accumulated: '', sentMessage: null, lastEditTime: 0 };
}
