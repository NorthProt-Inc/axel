import * as readline from 'node:readline';
import type {
	AxelChannel,
	ChannelCapabilities,
	InboundHandler,
	InboundMessage,
	OutboundMessage,
} from '@axel/core/types';
import type { HealthStatus } from '@axel/core/types';

const CLI_USER_ID = 'cli-user';
const CLI_CHANNEL_ID = 'cli';

const CLI_CAPABILITIES: ChannelCapabilities = {
	streaming: true,
	richMedia: false,
	reactions: false,
	threads: false,
	voiceInput: false,
	maxMessageLength: Number.MAX_SAFE_INTEGER,
	typingIndicator: false,
};

interface CliChannelOptions {
	readonly createReadline?: () => readline.Interface;
	readonly write?: (text: string) => void;
	readonly onError?: (err: unknown) => void;
}

export class CliChannel implements AxelChannel {
	readonly id = CLI_CHANNEL_ID;
	readonly capabilities = CLI_CAPABILITIES;

	private rl: readline.Interface | null = null;
	private started = false;
	private startedAt: Date | null = null;
	private readonly handlers: InboundHandler[] = [];
	private readonly createReadline: () => readline.Interface;
	private readonly writeFn: (text: string) => void;
	private readonly onErrorFn: (err: unknown) => void;

	constructor(options?: CliChannelOptions) {
		this.createReadline =
			options?.createReadline ??
			(() =>
				readline.createInterface({
					input: process.stdin,
					output: process.stdout,
				}));
		this.writeFn = options?.write ?? ((text: string) => process.stdout.write(text));
		this.onErrorFn = options?.onError ?? (() => {});
	}

	async start(): Promise<void> {
		if (this.started) {
			throw new Error('CLI channel already started');
		}

		this.rl = this.createReadline();
		this.started = true;
		this.startedAt = new Date();

		this.rl.on('line', (line: string) => {
			const trimmed = (line as string).trim();
			if (trimmed.length === 0) {
				return;
			}

			const message: InboundMessage = {
				userId: CLI_USER_ID,
				channelId: CLI_CHANNEL_ID,
				content: trimmed,
				timestamp: new Date(),
			};

			for (const handler of this.handlers) {
				handler(message).catch((err: unknown) => {
					this.onErrorFn(err);
				});
			}
		});

		this.rl.on('close', () => {
			this.started = false;
		});
	}

	async stop(): Promise<void> {
		if (!this.started) {
			return;
		}

		this.started = false;
		this.rl?.close();
		this.rl = null;
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

	async send(_target: string, msg: OutboundMessage): Promise<void> {
		if (!this.started) {
			throw new Error('CLI channel not started');
		}

		this.writeFn(`${msg.content}\n`);
	}

	async sendStreaming(_target: string, stream: AsyncIterable<string>): Promise<void> {
		if (!this.started) {
			throw new Error('CLI channel not started');
		}

		for await (const chunk of stream) {
			this.writeFn(chunk);
		}
		this.writeFn('\n');
	}
}
