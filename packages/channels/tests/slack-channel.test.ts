import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
	SlackChannel,
	type SlackChannelOptions,
	SLACK_CHANNEL_ID,
	SLACK_MAX_MESSAGE_LENGTH,
} from '../src/slack/slack-channel.js';
import type { InboundMessage, OutboundMessage } from '@axel/core/types';

// Mock Slack App interface matching @slack/bolt pattern
interface MockSlackApp {
	message: ReturnType<typeof vi.fn>;
	event: ReturnType<typeof vi.fn>;
	start: ReturnType<typeof vi.fn>;
	stop: ReturnType<typeof vi.fn>;
	client: {
		chat: {
			postMessage: ReturnType<typeof vi.fn>;
			update: ReturnType<typeof vi.fn>;
		};
	};
}

function createMockApp(): MockSlackApp {
	return {
		message: vi.fn(),
		event: vi.fn(),
		start: vi.fn().mockResolvedValue(undefined),
		stop: vi.fn().mockResolvedValue(undefined),
		client: {
			chat: {
				postMessage: vi.fn().mockResolvedValue({ ok: true, ts: '1234.5678' }),
				update: vi.fn().mockResolvedValue({ ok: true }),
			},
		},
	};
}

describe('SlackChannel', () => {
	let mockApp: MockSlackApp;
	let channel: SlackChannel;

	beforeEach(() => {
		mockApp = createMockApp();
		const options: SlackChannelOptions = {
			botToken: 'xoxb-test-token',
			signingSecret: 'test-signing-secret',
			appToken: 'xapp-test-app-token',
			createApp: () => mockApp as unknown as import('@slack/bolt').App,
		};
		channel = new SlackChannel(options);
	});

	describe('properties', () => {
		it('has correct id', () => {
			expect(channel.id).toBe(SLACK_CHANNEL_ID);
		});

		it('has correct capabilities', () => {
			expect(channel.capabilities.streaming).toBe(true);
			expect(channel.capabilities.richMedia).toBe(true);
			expect(channel.capabilities.threads).toBe(true);
			expect(channel.capabilities.maxMessageLength).toBe(SLACK_MAX_MESSAGE_LENGTH);
			expect(channel.capabilities.typingIndicator).toBe(false);
		});
	});

	describe('lifecycle', () => {
		it('starts the Slack app', async () => {
			await channel.start();
			expect(mockApp.start).toHaveBeenCalledOnce();
		});

		it('stops the Slack app', async () => {
			await channel.start();
			await channel.stop();
			expect(mockApp.stop).toHaveBeenCalledOnce();
		});

		it('stop is safe when not started', async () => {
			await channel.stop(); // should not throw
		});

		it('start registers message handler', async () => {
			await channel.start();
			expect(mockApp.message).toHaveBeenCalled();
		});
	});

	describe('healthCheck', () => {
		it('returns healthy when started', async () => {
			await channel.start();
			const health = await channel.healthCheck();
			expect(health.state).toBe('healthy');
		});

		it('returns unhealthy when not started', async () => {
			const health = await channel.healthCheck();
			expect(health.state).toBe('unhealthy');
		});
	});

	describe('onMessage', () => {
		it('registers inbound handler', () => {
			const handler = vi.fn();
			channel.onMessage(handler);
			// handler should be stored internally — verified indirectly via message delivery
		});
	});

	describe('send', () => {
		it('sends a message to a Slack channel', async () => {
			await channel.start();
			const msg: OutboundMessage = { content: 'Hello Slack!', format: 'markdown' };
			await channel.send('C12345', msg);

			expect(mockApp.client.chat.postMessage).toHaveBeenCalledWith(
				expect.objectContaining({
					channel: 'C12345',
					text: 'Hello Slack!',
				}),
			);
		});

		it('splits long messages at 4000 char limit', async () => {
			await channel.start();
			const longContent = 'A'.repeat(5000);
			await channel.send('C12345', { content: longContent });

			expect(mockApp.client.chat.postMessage).toHaveBeenCalledTimes(2);
		});

		it('sends to thread when replyTo is specified', async () => {
			await channel.start();
			const msg: OutboundMessage = {
				content: 'Thread reply',
				replyTo: '1234.5678',
			};
			await channel.send('C12345', msg);

			expect(mockApp.client.chat.postMessage).toHaveBeenCalledWith(
				expect.objectContaining({
					channel: 'C12345',
					thread_ts: '1234.5678',
				}),
			);
		});
	});

	describe('message processing', () => {
		it('dispatches inbound Slack messages to handlers', async () => {
			const handler = vi.fn<(msg: InboundMessage) => Promise<void>>().mockResolvedValue(undefined);
			channel.onMessage(handler);
			await channel.start();

			// Get the message handler that was registered with mockApp.message
			const registeredCallback = mockApp.message.mock.calls[0]?.[0] as (args: {
				message: { text: string; user: string; channel: string; ts: string; thread_ts?: string };
				say: (text: string) => Promise<void>;
			}) => Promise<void>;

			expect(registeredCallback).toBeDefined();

			// Simulate a Slack message event
			await registeredCallback({
				message: {
					text: 'Hello from Slack',
					user: 'U12345',
					channel: 'C12345',
					ts: '1234.5678',
				},
				say: vi.fn(),
			});

			expect(handler).toHaveBeenCalledWith(
				expect.objectContaining({
					userId: 'U12345',
					channelId: 'slack',
					content: 'Hello from Slack',
				}),
			);
		});

		it('ignores bot messages', async () => {
			const handler = vi.fn<(msg: InboundMessage) => Promise<void>>().mockResolvedValue(undefined);
			channel.onMessage(handler);
			await channel.start();

			const registeredCallback = mockApp.message.mock.calls[0]?.[0] as (args: {
				message: { text: string; user: string; channel: string; ts: string; bot_id?: string };
				say: (text: string) => Promise<void>;
			}) => Promise<void>;

			await registeredCallback({
				message: {
					text: 'Bot message',
					user: 'U12345',
					channel: 'C12345',
					ts: '1234.5678',
					bot_id: 'B12345',
				},
				say: vi.fn(),
			});

			expect(handler).not.toHaveBeenCalled();
		});

		it('handles thread messages', async () => {
			const handler = vi.fn<(msg: InboundMessage) => Promise<void>>().mockResolvedValue(undefined);
			channel.onMessage(handler);
			await channel.start();

			const registeredCallback = mockApp.message.mock.calls[0]?.[0] as (args: {
				message: { text: string; user: string; channel: string; ts: string; thread_ts?: string };
				say: (text: string) => Promise<void>;
			}) => Promise<void>;

			await registeredCallback({
				message: {
					text: 'Thread message',
					user: 'U12345',
					channel: 'C12345',
					ts: '1234.9999',
					thread_ts: '1234.0000',
				},
				say: vi.fn(),
			});

			expect(handler).toHaveBeenCalledWith(
				expect.objectContaining({
					threadId: '1234.0000',
				}),
			);
		});
	});
});
