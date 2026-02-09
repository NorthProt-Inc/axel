import type {
	AxelChannel,
	ChannelCapabilities,
	HealthStatus,
	InboundHandler,
	InboundMessage,
	OutboundMessage,
} from '@axel/core/types';
import type { App } from '@slack/bolt';
import { splitMessage } from '../utils/split-message.js';

export const SLACK_CHANNEL_ID = 'slack';
export const SLACK_MAX_MESSAGE_LENGTH = 4000;

const SLACK_CAPABILITIES: ChannelCapabilities = {
	streaming: true,
	richMedia: true,
	reactions: true,
	threads: true,
	voiceInput: false,
	maxMessageLength: SLACK_MAX_MESSAGE_LENGTH,
	typingIndicator: false, // Slack doesn't expose typing indicator API for bots
};

export interface SlackChannelOptions {
	readonly botToken: string;
	readonly signingSecret: string;
	readonly appToken: string;
	readonly createApp?: () => App;
	readonly onError?: (err: unknown) => void;
}

/**
 * Slack Channel — @slack/bolt AxelChannel impl.
 *
 * Features:
 * - Socket Mode (via appToken) for event delivery
 * - Thread support (thread_ts)
 * - 4000 char message splitting
 * - Bot message filtering
 */
export class SlackChannel implements AxelChannel {
	readonly id = SLACK_CHANNEL_ID;
	readonly capabilities = SLACK_CAPABILITIES;

	private app: App | null = null;
	private started = false;
	private startedAt: Date | null = null;
	private readonly handlers: InboundHandler[] = [];
	private readonly botToken: string;
	private readonly signingSecret: string;
	private readonly appToken: string;
	private readonly createAppFn: () => App;
	private readonly onErrorFn: (err: unknown) => void;

	constructor(options: SlackChannelOptions) {
		this.botToken = options.botToken;
		this.signingSecret = options.signingSecret;
		this.appToken = options.appToken;
		this.createAppFn =
			options.createApp ??
			(() => {
				// Dynamic import to avoid bundling @slack/bolt when not used
				const { App: SlackApp } = require('@slack/bolt') as typeof import('@slack/bolt');
				return new SlackApp({
					token: this.botToken,
					signingSecret: this.signingSecret,
					socketMode: true,
					appToken: this.appToken,
				});
			});
		this.onErrorFn = options.onError ?? (() => {});
	}

	async start(): Promise<void> {
		if (this.started) return;

		this.app = this.createAppFn();
		this.registerEventHandlers();
		await this.app.start();
		this.started = true;
		this.startedAt = new Date();
	}

	async stop(): Promise<void> {
		if (!this.started || !this.app) return;

		await this.app.stop();
		this.started = false;
		this.app = null;
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
		if (!this.app) return;

		const chunks = splitMessage(msg.content, SLACK_MAX_MESSAGE_LENGTH);
		for (const chunk of chunks) {
			await this.app.client.chat.postMessage({
				channel: target,
				text: chunk,
				...(msg.replyTo ? { thread_ts: msg.replyTo } : {}),
			});
		}
	}

	private registerEventHandlers(): void {
		if (!this.app) return;

		this.app.message(async ({ message }) => {
			try {
				const slackMessage = message as {
					text?: string;
					user?: string;
					channel?: string;
					ts?: string;
					thread_ts?: string;
					bot_id?: string;
					subtype?: string;
				};

				// Filter bot messages
				if (slackMessage.bot_id || slackMessage.subtype) return;
				if (!slackMessage.text || !slackMessage.user || !slackMessage.channel) return;

				const inbound: InboundMessage = {
					userId: slackMessage.user,
					channelId: SLACK_CHANNEL_ID,
					content: slackMessage.text,
					timestamp: new Date(Number(slackMessage.ts ?? '0') * 1000),
					...(slackMessage.thread_ts ? { threadId: slackMessage.thread_ts } : {}),
					rawEvent: message,
				};

				for (const handler of this.handlers) {
					await handler(inbound);
				}
			} catch (err) {
				this.onErrorFn(err);
			}
		});
	}
}
