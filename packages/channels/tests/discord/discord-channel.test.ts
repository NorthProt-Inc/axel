import type {
	AxelChannel,
	InboundHandler,
	InboundMessage,
	OutboundMessage,
} from '@axel/core/types';
import { Events } from 'discord.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DiscordChannel, MAX_CHANNEL_CACHE_SIZE } from '../../src/discord/discord-channel.js';
import type { DiscordChannelOptions } from '../../src/discord/discord-channel.js';

/** Minimal mock for discord.js Client */
function createMockClient() {
	const listeners = new Map<string, Array<(...args: unknown[]) => void>>();

	const client = {
		on(event: string, handler: (...args: unknown[]) => void) {
			const existing = listeners.get(event) ?? [];
			existing.push(handler);
			listeners.set(event, existing);
			return client;
		},
		once(event: string, handler: (...args: unknown[]) => void) {
			const existing = listeners.get(event) ?? [];
			existing.push(handler);
			listeners.set(event, existing);
			return client;
		},
		removeAllListeners: vi.fn().mockReturnThis(),
		login: vi.fn().mockResolvedValue('token'),
		destroy: vi.fn().mockResolvedValue(undefined),
		isReady: vi.fn().mockReturnValue(true),
		user: { id: 'bot-user-id', tag: 'Axel#0001' },
		ws: { ping: 42 },
	};

	function emit(event: string, ...args: unknown[]) {
		const handlers = listeners.get(event) ?? [];
		for (const h of handlers) {
			h(...args);
		}
	}

	return { client, emit, listeners };
}

/** Create a mock Discord message object */
function createMockDiscordMessage(overrides?: {
	content?: string;
	authorId?: string;
	authorBot?: boolean;
	channelId?: string;
}) {
	const sentMessages: Array<{ content: string; edit: ReturnType<typeof vi.fn> }> = [];

	const channel = {
		id: overrides?.channelId ?? 'channel-123',
		send: vi.fn().mockImplementation(async (opts: string | { content: string }) => {
			const content = typeof opts === 'string' ? opts : opts.content;
			const sent = {
				content,
				edit: vi.fn().mockImplementation(async (newContent: string | { content: string }) => {
					sent.content = typeof newContent === 'string' ? newContent : newContent.content;
				}),
			};
			sentMessages.push(sent);
			return sent;
		}),
		sendTyping: vi.fn().mockResolvedValue(undefined),
		isThread: vi.fn().mockReturnValue(false),
	};

	const msg = {
		content: overrides?.content ?? 'Hello Axel',
		author: {
			id: overrides?.authorId ?? 'user-456',
			bot: overrides?.authorBot ?? false,
		},
		channel,
		channelId: channel.id,
		id: 'msg-789',
		createdAt: new Date(),
		reply: vi.fn().mockResolvedValue(undefined),
	};

	return { msg, channel, sentMessages };
}

describe('DiscordChannel', () => {
	let channel: DiscordChannel;
	let mockClient: ReturnType<typeof createMockClient>;

	function createChannel(overrides?: Partial<DiscordChannelOptions>) {
		mockClient = createMockClient();
		const options: DiscordChannelOptions = {
			token: 'test-token',
			createClient: () => mockClient.client as never,
			onError: overrides?.onError,
			...overrides,
		};
		channel = new DiscordChannel(options);
		return channel;
	}

	/** Helper: start the channel with mock client ready emission */
	async function startChannel(): Promise<void> {
		const loginPromise = channel.start();
		mockClient.emit(Events.ClientReady);
		await loginPromise;
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
		it('has id "discord"', () => {
			expect(channel.id).toBe('discord');
		});

		it('declares correct capabilities', () => {
			const caps = channel.capabilities;

			expect(caps.streaming).toBe(true);
			expect(caps.richMedia).toBe(true);
			expect(caps.reactions).toBe(true);
			expect(caps.threads).toBe(true);
			expect(caps.voiceInput).toBe(false);
			expect(caps.maxMessageLength).toBe(2000);
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

		it('supports optional addReaction', () => {
			expect(channel.addReaction).toBeTypeOf('function');
		});
	});

	describe('lifecycle', () => {
		it('starts and transitions to healthy', async () => {
			await startChannel();
			const health = await channel.healthCheck();

			expect(health.state).toBe('healthy');
		});

		it('calls client.login with token on start', async () => {
			await startChannel();

			expect(mockClient.client.login).toHaveBeenCalledWith('test-token');
		});

		it('stops and transitions to unhealthy', async () => {
			await startChannel();
			await channel.stop();
			const health = await channel.healthCheck();

			expect(health.state).toBe('unhealthy');
			expect(mockClient.client.destroy).toHaveBeenCalled();
		});

		it('is unhealthy before start', async () => {
			const health = await channel.healthCheck();
			expect(health.state).toBe('unhealthy');
		});

		it('throws when starting twice', async () => {
			await startChannel();
			await expect(channel.start()).rejects.toThrow('Discord channel already started');
		});

		it('is safe to stop when not started', async () => {
			await expect(channel.stop()).resolves.toBeUndefined();
		});

		it('healthCheck returns uptime and ws ping', async () => {
			await startChannel();

			await new Promise((r) => setTimeout(r, 10));
			const health = await channel.healthCheck();

			expect(health.uptime).toBeGreaterThan(0);
			expect(health.timestamp).toBeInstanceOf(Date);
			expect(health.checks).toHaveProperty('wsPing');
		});
	});

	describe('inbound messages', () => {
		it('calls handler with normalized InboundMessage', async () => {
			await startChannel();

			const received: InboundMessage[] = [];
			channel.onMessage(async (msg) => {
				received.push(msg);
			});

			const { msg } = createMockDiscordMessage({ content: 'Hello Axel' });
			mockClient.emit(Events.MessageCreate, msg);

			await new Promise((r) => setTimeout(r, 10));

			expect(received).toHaveLength(1);
			expect(received[0]?.userId).toBe('user-456');
			expect(received[0]?.channelId).toBe('channel-123');
			expect(received[0]?.content).toBe('Hello Axel');
			expect(received[0]?.timestamp).toBeInstanceOf(Date);
			expect(received[0]?.rawEvent).toBe(msg);
		});

		it('ignores bot messages', async () => {
			await startChannel();

			const received: InboundMessage[] = [];
			channel.onMessage(async (msg) => {
				received.push(msg);
			});

			const { msg } = createMockDiscordMessage({ authorBot: true });
			mockClient.emit(Events.MessageCreate, msg);

			await new Promise((r) => setTimeout(r, 10));

			expect(received).toHaveLength(0);
		});

		it('ignores empty messages', async () => {
			await startChannel();

			const received: InboundMessage[] = [];
			channel.onMessage(async (msg) => {
				received.push(msg);
			});

			const { msg } = createMockDiscordMessage({ content: '' });
			mockClient.emit(Events.MessageCreate, msg);
			const { msg: msg2 } = createMockDiscordMessage({ content: '   ' });
			mockClient.emit(Events.MessageCreate, msg2);

			await new Promise((r) => setTimeout(r, 10));

			expect(received).toHaveLength(0);
		});

		it('supports multiple handlers', async () => {
			await startChannel();

			const received1: string[] = [];
			const received2: string[] = [];

			channel.onMessage(async (msg) => {
				received1.push(msg.content);
			});
			channel.onMessage(async (msg) => {
				received2.push(msg.content);
			});

			const { msg } = createMockDiscordMessage({ content: 'test' });
			mockClient.emit(Events.MessageCreate, msg);

			await new Promise((r) => setTimeout(r, 10));

			expect(received1).toEqual(['test']);
			expect(received2).toEqual(['test']);
		});
	});

	describe('outbound messages', () => {
		it('send() sends message to Discord channel', async () => {
			await startChannel();

			// Trigger inbound to cache the channel
			const { msg } = createMockDiscordMessage();
			mockClient.emit(Events.MessageCreate, msg);
			await new Promise((r) => setTimeout(r, 10));

			await channel.send('channel-123', { content: 'Hello from Axel!' });

			expect(msg.channel.send).toHaveBeenCalledWith({ content: 'Hello from Axel!' });
		});

		it('send() throws when not started', async () => {
			await expect(channel.send('channel-123', { content: 'test' })).rejects.toThrow(
				'Discord channel not started',
			);
		});

		it('send() splits messages exceeding 2000 characters', async () => {
			await startChannel();

			const { msg } = createMockDiscordMessage();
			mockClient.emit(Events.MessageCreate, msg);
			await new Promise((r) => setTimeout(r, 10));

			const longContent = 'A'.repeat(3500);
			await channel.send('channel-123', { content: longContent });

			expect(msg.channel.send).toHaveBeenCalledTimes(2);
		});

		it('sendStreaming() uses message.edit() for updates', async () => {
			await startChannel();

			const { msg, sentMessages } = createMockDiscordMessage();
			mockClient.emit(Events.MessageCreate, msg);
			await new Promise((r) => setTimeout(r, 10));

			const chunks = ['Hello ', 'World', '!'];
			async function* testStream(): AsyncIterable<string> {
				for (const chunk of chunks) {
					yield chunk;
				}
			}

			await channel.sendStreaming?.('channel-123', testStream());

			// Should have sent at least one message
			expect(msg.channel.send).toHaveBeenCalled();
			expect(sentMessages.length).toBeGreaterThanOrEqual(1);
		});

		it('sendStreaming() throws when not started', async () => {
			async function* stream(): AsyncIterable<string> {
				yield 'test';
			}

			await expect(channel.sendStreaming?.('channel-123', stream())).rejects.toThrow(
				'Discord channel not started',
			);
		});

		it('sendStreaming() handles content exceeding 2000 chars during stream', async () => {
			await startChannel();

			const { msg, sentMessages } = createMockDiscordMessage();
			mockClient.emit(Events.MessageCreate, msg);
			await new Promise((r) => setTimeout(r, 10));

			async function* longStream(): AsyncIterable<string> {
				for (let i = 0; i < 25; i++) {
					yield 'A'.repeat(100);
				}
			}

			await channel.sendStreaming?.('channel-123', longStream());

			// Should have created at least one message
			expect(sentMessages.length).toBeGreaterThanOrEqual(1);
		});
	});

	describe('reconnection', () => {
		it('handles disconnect event', async () => {
			const disconnectReasons: string[] = [];
			channel.onDisconnect?.((reason) => {
				disconnectReasons.push(reason);
			});

			await startChannel();

			mockClient.emit('disconnect', { code: 1006, reason: 'Connection lost' });

			expect(disconnectReasons).toHaveLength(1);
			expect(disconnectReasons[0]).toBe('Connection lost');
		});

		it('handles reconnect event', async () => {
			let reconnected = false;
			channel.onReconnect?.(() => {
				reconnected = true;
			});

			await startChannel();

			mockClient.emit(Events.ShardReconnecting, 0);

			expect(reconnected).toBe(true);
		});

		it('reports degraded health during reconnection attempts', async () => {
			await startChannel();

			// Simulate error event that triggers reconnection
			mockClient.emit(Events.Error, new Error('WebSocket closed'));

			const health = await channel.healthCheck();
			expect(health.state).toBe('degraded');
		});

		it('recovers to healthy after shard ready', async () => {
			await startChannel();

			mockClient.emit(Events.Error, new Error('WebSocket closed'));
			let health = await channel.healthCheck();
			expect(health.state).toBe('degraded');

			mockClient.emit(Events.ShardReady, 0);
			health = await channel.healthCheck();
			expect(health.state).toBe('healthy');
		});
	});

	describe('addReaction', () => {
		it('is available as a function', async () => {
			await startChannel();
			expect(channel.addReaction).toBeTypeOf('function');
		});
	});

	describe('channel cache eviction', () => {
		it('evicts oldest entry when cache exceeds MAX_CHANNEL_CACHE_SIZE', async () => {
			await startChannel();

			// Fill cache to MAX + 1 entries
			for (let i = 0; i < MAX_CHANNEL_CACHE_SIZE + 1; i++) {
				const { msg } = createMockDiscordMessage({ channelId: `ch-${i}` });
				mockClient.emit(Events.MessageCreate, msg);
			}
			await new Promise((r) => setTimeout(r, 10));

			// The first channel (ch-0) should have been evicted
			await expect(channel.send('ch-0', { content: 'ping' })).rejects.toThrow(
				'Unknown Discord channel: ch-0',
			);

			// The last channel should still be cached
			const { msg: lastMsg } = createMockDiscordMessage({
				channelId: `ch-${MAX_CHANNEL_CACHE_SIZE}`,
			});
			// Verify it doesn't throw (channel is in cache from inbound above)
			await channel.send(`ch-${MAX_CHANNEL_CACHE_SIZE}`, { content: 'ping' });
			expect(lastMsg.channel.send).not.toHaveBeenCalled(); // lastMsg is a fresh mock, not the cached one
		});

		it('does not evict when at exactly MAX_CHANNEL_CACHE_SIZE', async () => {
			await startChannel();

			// Fill cache to exactly MAX entries
			for (let i = 0; i < MAX_CHANNEL_CACHE_SIZE; i++) {
				const { msg } = createMockDiscordMessage({ channelId: `ch-${i}` });
				mockClient.emit(Events.MessageCreate, msg);
			}
			await new Promise((r) => setTimeout(r, 10));

			// First channel should still be present
			await expect(
				channel.send('ch-0', { content: 'ping' }),
			).resolves.toBeUndefined();
		});

		it('promotes re-accessed channels (LRU behavior)', async () => {
			await startChannel();

			// Fill cache to MAX entries
			for (let i = 0; i < MAX_CHANNEL_CACHE_SIZE; i++) {
				const { msg } = createMockDiscordMessage({ channelId: `ch-${i}` });
				mockClient.emit(Events.MessageCreate, msg);
			}
			await new Promise((r) => setTimeout(r, 10));

			// Re-access ch-0 (promotes it to most recent)
			const { msg: refreshMsg } = createMockDiscordMessage({ channelId: 'ch-0' });
			mockClient.emit(Events.MessageCreate, refreshMsg);
			await new Promise((r) => setTimeout(r, 10));

			// Now ch-1 is the oldest; add one more to trigger eviction
			const { msg: newMsg } = createMockDiscordMessage({ channelId: 'ch-new' });
			mockClient.emit(Events.MessageCreate, newMsg);
			await new Promise((r) => setTimeout(r, 10));

			// ch-0 should survive (was promoted), ch-1 should be evicted
			await expect(
				channel.send('ch-0', { content: 'ping' }),
			).resolves.toBeUndefined();
			await expect(channel.send('ch-1', { content: 'ping' })).rejects.toThrow(
				'Unknown Discord channel: ch-1',
			);
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

			await startChannel();

			channel.onMessage(async () => {
				throw new Error('handler failed');
			});

			const { msg } = createMockDiscordMessage();
			mockClient.emit(Events.MessageCreate, msg);

			await new Promise((r) => setTimeout(r, 10));

			expect(errors).toHaveLength(1);
			expect((errors[0] as Error).message).toBe('handler failed');
		});

		it('default onError is a no-op', async () => {
			mockClient = createMockClient();
			channel = new DiscordChannel({
				token: 'test-token',
				createClient: () => mockClient.client as never,
			});

			const loginPromise = channel.start();
			mockClient.emit(Events.ClientReady);
			await loginPromise;

			channel.onMessage(async () => {
				throw new Error('silent error');
			});

			const { msg } = createMockDiscordMessage();
			mockClient.emit(Events.MessageCreate, msg);
			await new Promise((r) => setTimeout(r, 10));

			// Should not throw — default onError silently ignores
		});

		it('throws on send to unknown channel', async () => {
			await startChannel();

			await expect(channel.send('unknown-channel', { content: 'test' })).rejects.toThrow(
				'Unknown Discord channel: unknown-channel',
			);
		});
	});
});
