import { describe, expect, it } from 'vitest';
import type {
	AxelChannel,
	ChannelCapabilities,
	InboundHandler,
	InboundMessage,
	MediaAttachment,
	OutboundMessage,
	PresenceStatus,
} from '../../src/types/channel.js';
import type { HealthStatus } from '../../src/types/health.js';

describe('Channel types', () => {
	describe('PresenceStatus', () => {
		it('covers all presence states', () => {
			const statuses: PresenceStatus[] = ['online', 'idle', 'dnd', 'offline'];
			expect(statuses).toHaveLength(4);
		});
	});

	describe('MediaAttachment', () => {
		it('represents an image attachment', () => {
			const attachment: MediaAttachment = {
				type: 'image',
				url: 'https://example.com/photo.png',
				mimeType: 'image/png',
				fileName: 'photo.png',
				sizeBytes: 102400,
			};

			expect(attachment.type).toBe('image');
			expect(attachment.url).toBe('https://example.com/photo.png');
			expect(attachment.mimeType).toBe('image/png');
			expect(attachment.fileName).toBe('photo.png');
			expect(attachment.sizeBytes).toBe(102400);
		});

		it('represents a file attachment with minimal fields', () => {
			const attachment: MediaAttachment = {
				type: 'file',
				url: 'https://example.com/doc.pdf',
			};

			expect(attachment.type).toBe('file');
			expect(attachment.url).toBe('https://example.com/doc.pdf');
			expect(attachment.mimeType).toBeUndefined();
			expect(attachment.fileName).toBeUndefined();
			expect(attachment.sizeBytes).toBeUndefined();
		});

		it('represents an audio attachment', () => {
			const attachment: MediaAttachment = {
				type: 'audio',
				url: 'https://example.com/voice.ogg',
				mimeType: 'audio/ogg',
			};

			expect(attachment.type).toBe('audio');
		});

		it('represents a video attachment', () => {
			const attachment: MediaAttachment = {
				type: 'video',
				url: 'https://example.com/clip.mp4',
				mimeType: 'video/mp4',
				sizeBytes: 5242880,
			};

			expect(attachment.type).toBe('video');
			expect(attachment.sizeBytes).toBe(5242880);
		});
	});

	describe('ChannelCapabilities', () => {
		it('declares CLI capabilities', () => {
			const caps: ChannelCapabilities = {
				streaming: true,
				richMedia: false,
				reactions: false,
				threads: false,
				voiceInput: false,
				maxMessageLength: Number.MAX_SAFE_INTEGER,
				typingIndicator: false,
			};

			expect(caps.streaming).toBe(true);
			expect(caps.richMedia).toBe(false);
			expect(caps.maxMessageLength).toBe(Number.MAX_SAFE_INTEGER);
		});

		it('declares Discord capabilities', () => {
			const caps: ChannelCapabilities = {
				streaming: true,
				richMedia: true,
				reactions: true,
				threads: true,
				voiceInput: false,
				maxMessageLength: 2000,
				typingIndicator: true,
			};

			expect(caps.streaming).toBe(true);
			expect(caps.richMedia).toBe(true);
			expect(caps.reactions).toBe(true);
			expect(caps.threads).toBe(true);
			expect(caps.maxMessageLength).toBe(2000);
			expect(caps.typingIndicator).toBe(true);
		});

		it('declares Telegram capabilities', () => {
			const caps: ChannelCapabilities = {
				streaming: false,
				richMedia: true,
				reactions: false,
				threads: false,
				voiceInput: true,
				maxMessageLength: 4096,
				typingIndicator: true,
			};

			expect(caps.streaming).toBe(false);
			expect(caps.voiceInput).toBe(true);
			expect(caps.maxMessageLength).toBe(4096);
		});
	});

	describe('InboundMessage', () => {
		it('represents a basic text message', () => {
			const msg: InboundMessage = {
				userId: 'mark',
				channelId: 'discord',
				content: 'Hello Axel!',
				timestamp: new Date('2026-02-08T10:00:00Z'),
			};

			expect(msg.userId).toBe('mark');
			expect(msg.channelId).toBe('discord');
			expect(msg.content).toBe('Hello Axel!');
			expect(msg.media).toBeUndefined();
			expect(msg.replyTo).toBeUndefined();
			expect(msg.threadId).toBeUndefined();
			expect(msg.rawEvent).toBeUndefined();
		});

		it('represents a message with media attachments', () => {
			const msg: InboundMessage = {
				userId: 'mark',
				channelId: 'telegram',
				content: 'Check this out',
				media: [
					{
						type: 'image',
						url: 'https://example.com/screenshot.png',
						mimeType: 'image/png',
					},
				],
				timestamp: new Date('2026-02-08T10:05:00Z'),
			};

			expect(msg.media).toHaveLength(1);
			expect(msg.media?.[0]?.type).toBe('image');
		});

		it('represents a reply in a thread', () => {
			const msg: InboundMessage = {
				userId: 'mark',
				channelId: 'discord',
				content: 'Good point',
				replyTo: 'msg-123',
				threadId: 'thread-456',
				timestamp: new Date('2026-02-08T10:10:00Z'),
			};

			expect(msg.replyTo).toBe('msg-123');
			expect(msg.threadId).toBe('thread-456');
		});

		it('preserves raw event for debugging', () => {
			const rawDiscordEvent = { id: '999', guild_id: '111' };
			const msg: InboundMessage = {
				userId: 'mark',
				channelId: 'discord',
				content: 'Hello',
				timestamp: new Date(),
				rawEvent: rawDiscordEvent,
			};

			expect(msg.rawEvent).toEqual(rawDiscordEvent);
		});
	});

	describe('OutboundMessage', () => {
		it('represents a basic text response', () => {
			const msg: OutboundMessage = {
				content: 'Here is my response.',
			};

			expect(msg.content).toBe('Here is my response.');
			expect(msg.media).toBeUndefined();
			expect(msg.replyTo).toBeUndefined();
			expect(msg.format).toBeUndefined();
		});

		it('represents a markdown response with reply', () => {
			const msg: OutboundMessage = {
				content: '## Analysis\n- Point A\n- Point B',
				replyTo: 'msg-456',
				format: 'markdown',
			};

			expect(msg.format).toBe('markdown');
			expect(msg.replyTo).toBe('msg-456');
		});

		it('represents a response with media', () => {
			const msg: OutboundMessage = {
				content: 'Here is the generated chart:',
				media: [
					{
						type: 'image',
						url: 'https://example.com/chart.png',
						mimeType: 'image/png',
					},
				],
				format: 'text',
			};

			expect(msg.media).toHaveLength(1);
			expect(msg.format).toBe('text');
		});

		it('supports html format', () => {
			const msg: OutboundMessage = {
				content: '<b>Important</b>',
				format: 'html',
			};

			expect(msg.format).toBe('html');
		});
	});

	describe('InboundHandler', () => {
		it('is a function type accepting InboundMessage and returning Promise<void>', async () => {
			const received: InboundMessage[] = [];
			const handler: InboundHandler = async (message) => {
				received.push(message);
			};

			const testMsg: InboundMessage = {
				userId: 'mark',
				channelId: 'cli',
				content: 'test',
				timestamp: new Date(),
			};

			await handler(testMsg);
			expect(received).toHaveLength(1);
			expect(received[0]).toBe(testMsg);
		});
	});

	describe('AxelChannel', () => {
		it('can be implemented as a mock channel', () => {
			const mockChannel: AxelChannel = {
				id: 'test-channel',
				capabilities: {
					streaming: false,
					richMedia: false,
					reactions: false,
					threads: false,
					voiceInput: false,
					maxMessageLength: 1000,
					typingIndicator: false,
				},
				start: async () => {},
				stop: async () => {},
				healthCheck: async (): Promise<HealthStatus> => ({
					state: 'healthy',
					checks: {},
					timestamp: new Date(),
					uptime: 0,
				}),
				onMessage: (_handler: InboundHandler) => {},
				send: async (_target: string, _msg: OutboundMessage) => {},
			};

			expect(mockChannel.id).toBe('test-channel');
			expect(mockChannel.capabilities.streaming).toBe(false);
		});

		it('supports optional streaming method', async () => {
			let streamedContent = '';
			const mockChannel: AxelChannel = {
				id: 'streaming-channel',
				capabilities: {
					streaming: true,
					richMedia: false,
					reactions: false,
					threads: false,
					voiceInput: false,
					maxMessageLength: 2000,
					typingIndicator: true,
				},
				start: async () => {},
				stop: async () => {},
				healthCheck: async (): Promise<HealthStatus> => ({
					state: 'healthy',
					checks: {},
					timestamp: new Date(),
					uptime: 100,
				}),
				onMessage: (_handler: InboundHandler) => {},
				send: async (_target: string, _msg: OutboundMessage) => {},
				sendStreaming: async (_target: string, stream: AsyncIterable<string>) => {
					for await (const chunk of stream) {
						streamedContent += chunk;
					}
				},
			};

			expect(mockChannel.sendStreaming).toBeDefined();

			async function* testStream(): AsyncIterable<string> {
				yield 'Hello ';
				yield 'World';
			}

			await mockChannel.sendStreaming?.('user-1', testStream());
			expect(streamedContent).toBe('Hello World');
		});

		it('supports optional presence method', async () => {
			let currentPresence: PresenceStatus | null = null;
			const mockChannel: AxelChannel = {
				id: 'presence-channel',
				capabilities: {
					streaming: false,
					richMedia: false,
					reactions: false,
					threads: false,
					voiceInput: false,
					maxMessageLength: 2000,
					typingIndicator: false,
				},
				start: async () => {},
				stop: async () => {},
				healthCheck: async (): Promise<HealthStatus> => ({
					state: 'healthy',
					checks: {},
					timestamp: new Date(),
					uptime: 0,
				}),
				onMessage: (_handler: InboundHandler) => {},
				send: async (_target: string, _msg: OutboundMessage) => {},
				setPresence: async (status: PresenceStatus) => {
					currentPresence = status;
				},
			};

			expect(mockChannel.setPresence).toBeDefined();
			await mockChannel.setPresence?.('online');
			expect(currentPresence).toBe('online');
		});

		it('supports optional reaction method', async () => {
			let addedReaction: { messageId: string; emoji: string } | null = null;
			const mockChannel: AxelChannel = {
				id: 'reaction-channel',
				capabilities: {
					streaming: false,
					richMedia: false,
					reactions: true,
					threads: false,
					voiceInput: false,
					maxMessageLength: 2000,
					typingIndicator: false,
				},
				start: async () => {},
				stop: async () => {},
				healthCheck: async (): Promise<HealthStatus> => ({
					state: 'healthy',
					checks: {},
					timestamp: new Date(),
					uptime: 0,
				}),
				onMessage: (_handler: InboundHandler) => {},
				send: async (_target: string, _msg: OutboundMessage) => {},
				addReaction: async (messageId: string, emoji: string) => {
					addedReaction = { messageId, emoji };
				},
			};

			expect(mockChannel.addReaction).toBeDefined();
			await mockChannel.addReaction?.('msg-789', '👍');
			expect(addedReaction).toEqual({ messageId: 'msg-789', emoji: '👍' });
		});

		it('supports optional disconnect and reconnect handlers', () => {
			let disconnectReason: string | null = null;
			let reconnected = false;

			const mockChannel: AxelChannel = {
				id: 'reconnectable-channel',
				capabilities: {
					streaming: false,
					richMedia: false,
					reactions: false,
					threads: false,
					voiceInput: false,
					maxMessageLength: 2000,
					typingIndicator: false,
				},
				start: async () => {},
				stop: async () => {},
				healthCheck: async (): Promise<HealthStatus> => ({
					state: 'healthy',
					checks: {},
					timestamp: new Date(),
					uptime: 0,
				}),
				onMessage: (_handler: InboundHandler) => {},
				send: async (_target: string, _msg: OutboundMessage) => {},
				onDisconnect: (handler: (reason: string) => void) => {
					handler('Connection lost');
					disconnectReason = 'Connection lost';
				},
				onReconnect: (handler: () => void) => {
					handler();
					reconnected = true;
				},
			};

			expect(mockChannel.onDisconnect).toBeDefined();
			expect(mockChannel.onReconnect).toBeDefined();

			mockChannel.onDisconnect?.((reason) => {
				disconnectReason = reason;
			});
			expect(disconnectReason).toBe('Connection lost');

			mockChannel.onReconnect?.(() => {
				reconnected = true;
			});
			expect(reconnected).toBe(true);
		});

		it('supports optional typing start handler', () => {
			let typingUserId: string | null = null;

			const mockChannel: AxelChannel = {
				id: 'typing-channel',
				capabilities: {
					streaming: false,
					richMedia: false,
					reactions: false,
					threads: false,
					voiceInput: false,
					maxMessageLength: 2000,
					typingIndicator: true,
				},
				start: async () => {},
				stop: async () => {},
				healthCheck: async (): Promise<HealthStatus> => ({
					state: 'healthy',
					checks: {},
					timestamp: new Date(),
					uptime: 0,
				}),
				onMessage: (_handler: InboundHandler) => {},
				send: async (_target: string, _msg: OutboundMessage) => {},
				onTypingStart: (handler: (userId: string) => void) => {
					handler('mark');
					typingUserId = 'mark';
				},
			};

			expect(mockChannel.onTypingStart).toBeDefined();
			mockChannel.onTypingStart?.((userId) => {
				typingUserId = userId;
			});
			expect(typingUserId).toBe('mark');
		});

		it('has readonly id and capabilities', () => {
			const mockChannel: AxelChannel = {
				id: 'immutable-channel',
				capabilities: {
					streaming: false,
					richMedia: false,
					reactions: false,
					threads: false,
					voiceInput: false,
					maxMessageLength: 1000,
					typingIndicator: false,
				},
				start: async () => {},
				stop: async () => {},
				healthCheck: async (): Promise<HealthStatus> => ({
					state: 'healthy',
					checks: {},
					timestamp: new Date(),
					uptime: 0,
				}),
				onMessage: (_handler: InboundHandler) => {},
				send: async (_target: string, _msg: OutboundMessage) => {},
			};

			// readonly check — TypeScript compile-time, but we verify the values
			expect(mockChannel.id).toBe('immutable-channel');
			expect(mockChannel.capabilities.maxMessageLength).toBe(1000);
		});
	});
});
