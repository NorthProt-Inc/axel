import type {
	AxelChannel,
	ChannelCapabilities,
	HealthStatus,
	InboundHandler,
	InboundMessage,
	OutboundMessage,
} from '@axel/core/types';
import { Bot } from 'grammy';
import type { Api } from 'grammy';
import type { Context } from 'grammy';

const TELEGRAM_CHANNEL_ID = 'telegram';
const TELEGRAM_MAX_MESSAGE_LENGTH = 4096;
const STREAMING_EDIT_INTERVAL_MS = 1500;

const TELEGRAM_CAPABILITIES: ChannelCapabilities = {
	streaming: true,
	richMedia: true,
	reactions: false,
	threads: false,
	voiceInput: false,
	maxMessageLength: TELEGRAM_MAX_MESSAGE_LENGTH,
	typingIndicator: true,
};

export interface TelegramChannelOptions {
	readonly token: string;
	readonly createBot?: () => Bot;
	readonly onError?: (err: unknown) => void;
}

export class TelegramChannel implements AxelChannel {
	readonly id = TELEGRAM_CHANNEL_ID;
	readonly capabilities = TELEGRAM_CAPABILITIES;

	private bot: Bot | null = null;
	private api: Api | null = null;
	private started = false;
	private startedAt: Date | null = null;
	private readonly handlers: InboundHandler[] = [];

	private readonly token: string;
	private readonly createBotFn: () => Bot;
	private readonly onErrorFn: (err: unknown) => void;

	constructor(options: TelegramChannelOptions) {
		this.token = options.token;
		this.createBotFn = options.createBot ?? (() => new Bot(this.token));
		this.onErrorFn = options.onError ?? (() => {});
	}

	async start(): Promise<void> {
		if (this.started) {
			throw new Error('Telegram channel already started');
		}

		this.bot = this.createBotFn();
		this.api = this.bot.api;
		this.setupEventHandlers(this.bot);

		await this.bot.start();

		this.started = true;
		this.startedAt = new Date();
	}

	async stop(): Promise<void> {
		if (!this.started) {
			return;
		}

		this.started = false;
		await this.bot?.stop();
		this.bot = null;
		this.api = null;
	}

	async healthCheck(): Promise<HealthStatus> {
		const now = new Date();
		const uptime =
			this.started && this.startedAt ? (now.getTime() - this.startedAt.getTime()) / 1000 : 0;

		return {
			state: this.started ? 'healthy' : 'unhealthy',
			checks: {},
			timestamp: now,
			uptime,
		};
	}

	onMessage(handler: InboundHandler): void {
		this.handlers.push(handler);
	}

	async send(target: string, msg: OutboundMessage): Promise<void> {
		if (!this.started || !this.api) {
			throw new Error('Telegram channel not started');
		}

		const chatId = Number(target);

		await this.api.sendChatAction(chatId, 'typing');

		const chunks = splitMessage(msg.content, TELEGRAM_MAX_MESSAGE_LENGTH);
		for (const chunk of chunks) {
			await this.api.sendMessage(chatId, chunk);
		}
	}

	async sendStreaming(target: string, stream: AsyncIterable<string>): Promise<void> {
		if (!this.started || !this.api) {
			throw new Error('Telegram channel not started');
		}

		const chatId = Number(target);
		const api = this.api;
		const state = createStreamingState();

		for await (const chunk of stream) {
			state.accumulated += chunk;
			await handleStreamOverflow(api, state, chatId);
			await throttledStreamEdit(api, state, chatId);
		}

		await finalizeStream(api, state, chatId);
	}

	private setupEventHandlers(bot: Bot): void {
		bot.on('message:text', (ctx: Context) => {
			this.handleInboundMessage(ctx);
		});

		bot.catch((err: unknown) => {
			this.onErrorFn(err);
		});
	}

	private handleInboundMessage(ctx: Context): void {
		if (ctx.from?.is_bot) {
			return;
		}

		const text = ctx.message?.text?.trim() ?? '';
		if (text.length === 0) {
			return;
		}

		const inbound: InboundMessage = {
			userId: String(ctx.from?.id ?? ''),
			channelId: String(ctx.chat?.id ?? ''),
			content: text,
			timestamp: new Date((ctx.message?.date ?? 0) * 1000),
			rawEvent: ctx,
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
	sentMessageId: number | null;
	lastEditTime: number;
}

function createStreamingState(): StreamingState {
	return { accumulated: '', sentMessageId: null, lastEditTime: 0 };
}

async function handleStreamOverflow(
	api: Api,
	state: StreamingState,
	chatId: number,
): Promise<void> {
	if (state.accumulated.length <= TELEGRAM_MAX_MESSAGE_LENGTH || state.sentMessageId === null) {
		return;
	}
	const finalContent = state.accumulated.slice(0, TELEGRAM_MAX_MESSAGE_LENGTH);
	await api.editMessageText(chatId, state.sentMessageId, finalContent);
	state.accumulated = state.accumulated.slice(TELEGRAM_MAX_MESSAGE_LENGTH);
	state.sentMessageId = null;
}

async function throttledStreamEdit(api: Api, state: StreamingState, chatId: number): Promise<void> {
	const now = Date.now();
	if (now - state.lastEditTime < STREAMING_EDIT_INTERVAL_MS) {
		return;
	}
	const displayContent = state.accumulated.slice(0, TELEGRAM_MAX_MESSAGE_LENGTH);
	if (state.sentMessageId !== null) {
		await api.editMessageText(chatId, state.sentMessageId, displayContent);
	} else {
		const result = await api.sendMessage(chatId, displayContent);
		state.sentMessageId = result.message_id;
	}
	state.lastEditTime = now;
}

async function finalizeStream(api: Api, state: StreamingState, chatId: number): Promise<void> {
	if (state.accumulated.length === 0) {
		return;
	}
	const displayContent = state.accumulated.slice(0, TELEGRAM_MAX_MESSAGE_LENGTH);
	if (state.sentMessageId !== null) {
		await api.editMessageText(chatId, state.sentMessageId, displayContent);
	} else {
		await api.sendMessage(chatId, displayContent);
	}
}

function splitMessage(content: string, maxLength: number): string[] {
	if (content.length <= maxLength) {
		return [content];
	}

	const chunks: string[] = [];
	let remaining = content;
	while (remaining.length > 0) {
		chunks.push(remaining.slice(0, maxLength));
		remaining = remaining.slice(maxLength);
	}
	return chunks;
}
