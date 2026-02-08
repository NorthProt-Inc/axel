import type {
	AxelChannel,
	InboundHandler,
	InboundMessage,
	OutboundMessage,
} from '@axel/core/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TelegramChannel } from '../../src/telegram/telegram-channel.js';
import type { TelegramChannelOptions } from '../../src/telegram/telegram-channel.js';

/** Minimal mock for grammy Bot */
function createMockBot() {
	const commandHandlers = new Map<string, Array<(ctx: unknown) => void>>();
	const eventHandlers = new Map<string, Array<(ctx: unknown) => void>>();

	const api = {
		sendMessage: vi.fn().mockResolvedValue({ message_id: 1, chat: { id: 123 } }),
		editMessageText: vi.fn().mockResolvedValue(true),
		sendChatAction: vi.fn().mockResolvedValue(true),
		deleteWebhook: vi.fn().mockResolvedValue(true),
	};

	const bot = {
		api,
		command: vi.fn().mockImplementation((name: string, handler: (ctx: unknown) => void) => {
			const existing = commandHandlers.get(name) ?? [];
			existing.push(handler);
			commandHandlers.set(name, existing);
		}),
		on: vi.fn().mockImplementation((event: string, handler: (ctx: unknown) => void) => {
			const existing = eventHandlers.get(event) ?? [];
			existing.push(handler);
			eventHandlers.set(event, existing);
		}),
		start: vi.fn().mockResolvedValue(undefined),
		stop: vi.fn().mockResolvedValue(undefined),
		catch: vi.fn(),
		isInited: vi.fn().mockReturnValue(true),
	};

	function emitMessage(ctx: unknown) {
		const handlers = eventHandlers.get('message:text') ?? [];
		for (const h of handlers) {
			h(ctx);
		}
	}

	return { bot, api, emitMessage, commandHandlers, eventHandlers };
}

/** Create a mock Telegram message context */
function createMockContext(overrides?: {
	text?: string;
	chatId?: number;
	userId?: number;
	messageId?: number;
	isBot?: boolean;
}) {
	const chatId = overrides?.chatId ?? 123456;
	const userId = overrides?.userId ?? 789012;
	const messageId = overrides?.messageId ?? 1;

	return {
		message: {
			message_id: messageId,
			text: overrides?.text ?? 'Hello Axel',
			chat: { id: chatId, type: 'private' as const },
			from: {
				id: userId,
				is_bot: overrides?.isBot ?? false,
				first_name: 'Test',
			},
			date: Math.floor(Date.now() / 1000),
		},
		chat: { id: chatId, type: 'private' as const },
		from: {
			id: userId,
			is_bot: overrides?.isBot ?? false,
			first_name: 'Test',
		},
		reply: vi.fn().mockResolvedValue({ message_id: messageId + 1 }),
	};
}

describe('TelegramChannel', () => {
	let channel: TelegramChannel;
	let mockBot: ReturnType<typeof createMockBot>;

	function createChannel(overrides?: Partial<TelegramChannelOptions>) {
		mockBot = createMockBot();
		const options: TelegramChannelOptions = {
			token: 'test-telegram-token',
			createBot: () => mockBot.bot as never,
			onError: overrides?.onError,
			...overrides,
		};
		channel = new TelegramChannel(options);
		return channel;
	}

	beforeEach(() => {
		createChannel();
	});

	afterEach(async () => {
		try {
			await channel.stop();
		} catch {
			// already stopped or never started
		}
	});

	describe('interface compliance', () => {
		it('has id "telegram"', () => {
			expect(channel.id).toBe('telegram');
		});

		it('declares correct capabilities', () => {
			const caps = channel.capabilities;

			expect(caps.streaming).toBe(true);
			expect(caps.richMedia).toBe(true);
			expect(caps.reactions).toBe(false);
			expect(caps.threads).toBe(false);
			expect(caps.voiceInput).toBe(false);
			expect(caps.maxMessageLength).toBe(4096);
			expect(caps.typingIndicator).toBe(true);
		});

		it('implements AxelChannel interface', () => {
			const asChannel: AxelChannel = channel;
			expect(asChannel.start).toBeTypeOf('function');
			expect(asChannel.stop).toBeTypeOf('function');
			expect(asChannel.healthCheck).toBeTypeOf('function');
			expect(asChannel.onMessage).toBeTypeOf('function');
			expect(asChannel.send).toBeTypeOf('function');
			expect(asChannel.sendStreaming).toBeTypeOf('function');
		});
	});

	describe('lifecycle', () => {
		it('starts and transitions to healthy', async () => {
			await channel.start();
			const health = await channel.healthCheck();

			expect(health.state).toBe('healthy');
		});

		it('calls bot.start on start', async () => {
			await channel.start();

			expect(mockBot.bot.start).toHaveBeenCalled();
		});

		it('stops and transitions to unhealthy', async () => {
			await channel.start();
			await channel.stop();
			const health = await channel.healthCheck();

			expect(health.state).toBe('unhealthy');
			expect(mockBot.bot.stop).toHaveBeenCalled();
		});

		it('is unhealthy before start', async () => {
			const health = await channel.healthCheck();
			expect(health.state).toBe('unhealthy');
		});

		it('throws when starting twice', async () => {
			await channel.start();
			await expect(channel.start()).rejects.toThrow('Telegram channel already started');
		});

		it('is safe to stop when not started', async () => {
			await expect(channel.stop()).resolves.toBeUndefined();
		});

		it('healthCheck returns uptime', async () => {
			await channel.start();

			await new Promise((r) => setTimeout(r, 10));
			const health = await channel.healthCheck();

			expect(health.uptime).toBeGreaterThan(0);
			expect(health.timestamp).toBeInstanceOf(Date);
		});
	});

	describe('inbound messages', () => {
		it('calls handler with normalized InboundMessage', async () => {
			await channel.start();

			const received: InboundMessage[] = [];
			channel.onMessage(async (msg) => {
				received.push(msg);
			});

			const ctx = createMockContext({ text: 'Hello Axel', chatId: 123, userId: 456 });
			mockBot.emitMessage(ctx);

			await new Promise((r) => setTimeout(r, 10));

			expect(received).toHaveLength(1);
			expect(received[0]?.userId).toBe('456');
			expect(received[0]?.channelId).toBe('123');
			expect(received[0]?.content).toBe('Hello Axel');
			expect(received[0]?.timestamp).toBeInstanceOf(Date);
		});

		it('ignores bot messages', async () => {
			await channel.start();

			const received: InboundMessage[] = [];
			channel.onMessage(async (msg) => {
				received.push(msg);
			});

			const ctx = createMockContext({ isBot: true });
			mockBot.emitMessage(ctx);

			await new Promise((r) => setTimeout(r, 10));

			expect(received).toHaveLength(0);
		});

		it('ignores empty messages', async () => {
			await channel.start();

			const received: InboundMessage[] = [];
			channel.onMessage(async (msg) => {
				received.push(msg);
			});

			const ctx = createMockContext({ text: '' });
			mockBot.emitMessage(ctx);
			const ctx2 = createMockContext({ text: '   ' });
			mockBot.emitMessage(ctx2);

			await new Promise((r) => setTimeout(r, 10));

			expect(received).toHaveLength(0);
		});

		it('supports multiple handlers', async () => {
			await channel.start();

			const received1: string[] = [];
			const received2: string[] = [];

			channel.onMessage(async (msg) => {
				received1.push(msg.content);
			});
			channel.onMessage(async (msg) => {
				received2.push(msg.content);
			});

			const ctx = createMockContext({ text: 'test' });
			mockBot.emitMessage(ctx);

			await new Promise((r) => setTimeout(r, 10));

			expect(received1).toEqual(['test']);
			expect(received2).toEqual(['test']);
		});
	});

	describe('outbound messages', () => {
		it('send() sends message via bot API', async () => {
			await channel.start();

			await channel.send('123456', { content: 'Hello from Axel!' });

			expect(mockBot.api.sendMessage).toHaveBeenCalledWith(123456, 'Hello from Axel!');
		});

		it('send() throws when not started', async () => {
			await expect(channel.send('123', { content: 'test' })).rejects.toThrow(
				'Telegram channel not started',
			);
		});

		it('send() splits messages exceeding 4096 characters', async () => {
			await channel.start();

			const longContent = 'A'.repeat(5000);
			await channel.send('123456', { content: longContent });

			expect(mockBot.api.sendMessage).toHaveBeenCalledTimes(2);
			const firstCall = mockBot.api.sendMessage.mock.calls[0];
			expect(firstCall?.[1]).toHaveLength(4096);
		});

		it('send() sends typing indicator before message', async () => {
			await channel.start();

			await channel.send('123456', { content: 'Hello!' });

			expect(mockBot.api.sendChatAction).toHaveBeenCalledWith(123456, 'typing');
		});

		it('sendStreaming() sends initial message and edits it', async () => {
			await channel.start();

			const chunks = ['Hello ', 'World', '!'];
			async function* testStream(): AsyncIterable<string> {
				for (const chunk of chunks) {
					yield chunk;
				}
			}

			await channel.sendStreaming?.('123456', testStream());

			// Should have sent at least one message
			expect(mockBot.api.sendMessage).toHaveBeenCalled();
		});

		it('sendStreaming() throws when not started', async () => {
			async function* stream(): AsyncIterable<string> {
				yield 'test';
			}

			await expect(channel.sendStreaming?.('123', stream())).rejects.toThrow(
				'Telegram channel not started',
			);
		});

		it('sendStreaming() handles content exceeding 4096 chars during stream', async () => {
			await channel.start();

			async function* longStream(): AsyncIterable<string> {
				for (let i = 0; i < 50; i++) {
					yield 'A'.repeat(100);
				}
			}

			await channel.sendStreaming?.('123456', longStream());

			// Should have sent at least one message
			expect(mockBot.api.sendMessage).toHaveBeenCalled();
		});
	});

	describe('error handling', () => {
		it('catches handler errors without crashing', async () => {
			const errors: unknown[] = [];
			createChannel({
				onError: (err: unknown) => {
					errors.push(err);
				},
			});

			await channel.start();

			channel.onMessage(async () => {
				throw new Error('handler failed');
			});

			const ctx = createMockContext();
			mockBot.emitMessage(ctx);

			await new Promise((r) => setTimeout(r, 10));

			expect(errors).toHaveLength(1);
			expect((errors[0] as Error).message).toBe('handler failed');
		});

		it('default onError is a no-op', async () => {
			mockBot = createMockBot();
			channel = new TelegramChannel({
				token: 'test-token',
				createBot: () => mockBot.bot as never,
			});

			await channel.start();

			channel.onMessage(async () => {
				throw new Error('silent error');
			});

			const ctx = createMockContext();
			mockBot.emitMessage(ctx);
			await new Promise((r) => setTimeout(r, 10));

			// Should not throw — default onError silently ignores
		});
	});
});
