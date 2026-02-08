import type { InboundMessage } from '@axel/core/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TelegramChannel } from '../../src/telegram/telegram-channel.js';

function createMockBot() {
	const eventHandlers = new Map<string, Array<(ctx: unknown) => void>>();

	const api = {
		sendMessage: vi.fn().mockResolvedValue({ message_id: 1, chat: { id: 123 } }),
		editMessageText: vi.fn().mockResolvedValue(true),
		sendChatAction: vi.fn().mockResolvedValue(true),
		deleteWebhook: vi.fn().mockResolvedValue(true),
	};

	const bot = {
		api,
		command: vi.fn(),
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

	return { bot, api, emitMessage };
}

describe('TelegramChannel userId guard', () => {
	let channel: TelegramChannel;
	let mockBot: ReturnType<typeof createMockBot>;

	beforeEach(() => {
		mockBot = createMockBot();
		channel = new TelegramChannel({
			token: 'test-token',
			createBot: () => mockBot.bot as never,
		});
	});

	afterEach(async () => {
		try {
			await channel.stop();
		} catch {
			// already stopped
		}
	});

	it('skips message when ctx.from is undefined (userId would be empty)', async () => {
		await channel.start();

		const received: InboundMessage[] = [];
		channel.onMessage(async (msg) => {
			received.push(msg);
		});

		// ctx.from is undefined → userId becomes ''
		const ctx = {
			message: {
				message_id: 1,
				text: 'Hello',
				chat: { id: 123, type: 'private' as const },
				date: Math.floor(Date.now() / 1000),
			},
			chat: { id: 123, type: 'private' as const },
			from: undefined,
		};

		mockBot.emitMessage(ctx);
		await new Promise((r) => setTimeout(r, 10));

		expect(received).toHaveLength(0);
	});

	it('skips message when ctx.from.id is 0 (falsy but numeric)', async () => {
		await channel.start();

		const received: InboundMessage[] = [];
		channel.onMessage(async (msg) => {
			received.push(msg);
		});

		const ctx = {
			message: {
				message_id: 1,
				text: 'Hello',
				chat: { id: 123, type: 'private' as const },
				from: { id: 0, is_bot: false, first_name: 'Test' },
				date: Math.floor(Date.now() / 1000),
			},
			chat: { id: 123, type: 'private' as const },
			from: { id: 0, is_bot: false, first_name: 'Test' },
		};

		mockBot.emitMessage(ctx);
		await new Promise((r) => setTimeout(r, 10));

		// userId '0' is valid in Telegram context, should be accepted
		// but empty string from undefined from should be rejected
		expect(received).toHaveLength(1);
	});
});
