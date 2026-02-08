import * as crypto from 'node:crypto';
import * as http from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGatewayServer } from '../src/server.js';
import type { GatewayConfig, GatewayDeps } from '../src/types.js';

/**
 * INTEG-008: Webhook routes for Telegram and Discord.
 *
 * POST /webhooks/telegram — Telegram Bot API webhook
 *   - Verify X-Telegram-Bot-Api-Secret-Token header
 *   - Parse Telegram Update JSON
 *   - Route text messages to HandleMessage
 *
 * POST /webhooks/discord — Discord Interactions endpoint
 *   - Verify Ed25519 signature (X-Signature-Ed25519 + X-Signature-Timestamp)
 *   - Handle PING (type=1) with PONG (type=1) response
 *   - Route MESSAGE_CREATE to HandleMessage
 */

function createTestConfig(overrides?: Partial<GatewayConfig>): GatewayConfig {
	return {
		port: 0,
		host: '127.0.0.1',
		authToken: 'test-auth-token-12345',
		env: 'development',
		corsOrigins: ['http://localhost:3000'],
		rateLimitPerMinute: 100,
		telegramWebhookSecret: 'tg-secret-token-test',
		discordPublicKey: '',
		...overrides,
	};
}

function createMockDeps(): GatewayDeps {
	return {
		healthCheck: vi.fn().mockResolvedValue({
			state: 'healthy',
			checks: {},
			timestamp: new Date(),
			uptime: 100,
		}),
		handleMessage: vi.fn().mockResolvedValue({
			content: 'Mock response',
			sessionId: 'sess-mock',
			channelSwitched: false,
			usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
		}),
	};
}

function makeRequest(
	server: http.Server,
	options: { method?: string; path: string; headers?: Record<string, string>; body?: string },
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
	return new Promise((resolve, reject) => {
		const addr = server.address() as { port: number };
		const req = http.request(
			{
				hostname: '127.0.0.1',
				port: addr.port,
				method: options.method ?? 'GET',
				path: options.path,
				headers: options.headers,
			},
			(res) => {
				let data = '';
				res.on('data', (chunk: Buffer) => {
					data += chunk.toString();
				});
				res.on('end', () => {
					resolve({ status: res.statusCode ?? 0, headers: res.headers, body: data });
				});
			},
		);
		req.on('error', reject);
		if (options.body) req.write(options.body);
		req.end();
	});
}

/** Generate Ed25519 key pair and sign a body for Discord signature verification */
function generateDiscordSignature(
	privateKey: crypto.KeyObject,
	timestamp: string,
	body: string,
): string {
	const message = Buffer.from(timestamp + body);
	const signature = crypto.sign(null, message, privateKey);
	return signature.toString('hex');
}

function generateEd25519KeyPair(): { publicKey: crypto.KeyObject; privateKey: crypto.KeyObject } {
	return crypto.generateKeyPairSync('ed25519');
}

// ─── POST /webhooks/telegram ───

describe('INTEG-008: POST /webhooks/telegram', () => {
	let server: ReturnType<typeof createGatewayServer>;
	let httpServer: http.Server;
	let handleMessage: ReturnType<typeof vi.fn>;

	beforeEach(async () => {
		const deps = createMockDeps();
		handleMessage = deps.handleMessage as ReturnType<typeof vi.fn>;
		const config = createTestConfig();
		server = createGatewayServer(config, deps);
		httpServer = await server.start();
	});

	afterEach(async () => {
		await server.stop();
	});

	it('returns 401 when secret token header is missing', async () => {
		const update = {
			update_id: 1,
			message: {
				message_id: 1,
				chat: { id: 123 },
				from: { id: 456 },
				text: 'hello',
				date: 1700000000,
			},
		};

		const res = await makeRequest(httpServer, {
			method: 'POST',
			path: '/webhooks/telegram',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(update),
		});

		expect(res.status).toBe(401);
	});

	it('returns 401 when secret token is invalid', async () => {
		const update = {
			update_id: 1,
			message: {
				message_id: 1,
				chat: { id: 123 },
				from: { id: 456 },
				text: 'hello',
				date: 1700000000,
			},
		};

		const res = await makeRequest(httpServer, {
			method: 'POST',
			path: '/webhooks/telegram',
			headers: {
				'content-type': 'application/json',
				'x-telegram-bot-api-secret-token': 'wrong-token',
			},
			body: JSON.stringify(update),
		});

		expect(res.status).toBe(401);
	});

	it('processes valid Telegram text message update', async () => {
		const update = {
			update_id: 1,
			message: {
				message_id: 1,
				chat: { id: 123, type: 'private' },
				from: { id: 456, is_bot: false, first_name: 'Test' },
				text: 'hello axel',
				date: 1700000000,
			},
		};

		const res = await makeRequest(httpServer, {
			method: 'POST',
			path: '/webhooks/telegram',
			headers: {
				'content-type': 'application/json',
				'x-telegram-bot-api-secret-token': 'tg-secret-token-test',
			},
			body: JSON.stringify(update),
		});

		expect(res.status).toBe(200);
		expect(handleMessage).toHaveBeenCalledTimes(1);
		const callArg = handleMessage.mock.calls[0]?.[0] as Record<string, unknown>;
		expect(callArg.userId).toBe('456');
		expect(callArg.channelId).toBe('123');
		expect(callArg.content).toBe('hello axel');
		expect(typeof callArg.timestamp).toBe('number');
	});

	it('returns 200 without routing when update has no message', async () => {
		const update = {
			update_id: 2,
			edited_message: { message_id: 1, chat: { id: 123 }, text: 'edited' },
		};

		const res = await makeRequest(httpServer, {
			method: 'POST',
			path: '/webhooks/telegram',
			headers: {
				'content-type': 'application/json',
				'x-telegram-bot-api-secret-token': 'tg-secret-token-test',
			},
			body: JSON.stringify(update),
		});

		expect(res.status).toBe(200);
		expect(handleMessage).not.toHaveBeenCalled();
	});

	it('ignores bot messages', async () => {
		const update = {
			update_id: 3,
			message: {
				message_id: 1,
				chat: { id: 123, type: 'private' },
				from: { id: 789, is_bot: true, first_name: 'Bot' },
				text: 'bot message',
				date: 1700000000,
			},
		};

		const res = await makeRequest(httpServer, {
			method: 'POST',
			path: '/webhooks/telegram',
			headers: {
				'content-type': 'application/json',
				'x-telegram-bot-api-secret-token': 'tg-secret-token-test',
			},
			body: JSON.stringify(update),
		});

		expect(res.status).toBe(200);
		expect(handleMessage).not.toHaveBeenCalled();
	});

	it('ignores messages with empty text', async () => {
		const update = {
			update_id: 4,
			message: {
				message_id: 1,
				chat: { id: 123 },
				from: { id: 456, is_bot: false },
				text: '   ',
				date: 1700000000,
			},
		};

		const res = await makeRequest(httpServer, {
			method: 'POST',
			path: '/webhooks/telegram',
			headers: {
				'content-type': 'application/json',
				'x-telegram-bot-api-secret-token': 'tg-secret-token-test',
			},
			body: JSON.stringify(update),
		});

		expect(res.status).toBe(200);
		expect(handleMessage).not.toHaveBeenCalled();
	});

	it('returns 400 for invalid JSON body', async () => {
		const res = await makeRequest(httpServer, {
			method: 'POST',
			path: '/webhooks/telegram',
			headers: {
				'content-type': 'application/json',
				'x-telegram-bot-api-secret-token': 'tg-secret-token-test',
			},
			body: 'not json',
		});

		expect(res.status).toBe(400);
	});

	it('returns 503 when handleMessage is not configured', async () => {
		await server.stop();
		const config = createTestConfig();
		const deps: GatewayDeps = {
			healthCheck: vi
				.fn()
				.mockResolvedValue({ state: 'healthy', checks: {}, timestamp: new Date(), uptime: 100 }),
		};
		server = createGatewayServer(config, deps);
		httpServer = await server.start();

		const update = {
			update_id: 5,
			message: {
				message_id: 1,
				chat: { id: 123 },
				from: { id: 456, is_bot: false },
				text: 'hello',
				date: 1700000000,
			},
		};

		const res = await makeRequest(httpServer, {
			method: 'POST',
			path: '/webhooks/telegram',
			headers: {
				'content-type': 'application/json',
				'x-telegram-bot-api-secret-token': 'tg-secret-token-test',
			},
			body: JSON.stringify(update),
		});

		expect(res.status).toBe(503);
	});

	it('does not require Bearer auth', async () => {
		const update = {
			update_id: 6,
			message: {
				message_id: 1,
				chat: { id: 123 },
				from: { id: 456, is_bot: false },
				text: 'hello',
				date: 1700000000,
			},
		};

		const res = await makeRequest(httpServer, {
			method: 'POST',
			path: '/webhooks/telegram',
			headers: {
				'content-type': 'application/json',
				'x-telegram-bot-api-secret-token': 'tg-secret-token-test',
			},
			body: JSON.stringify(update),
		});

		// Should succeed without Bearer auth — only Telegram secret token needed
		expect(res.status).toBe(200);
	});
});

// ─── POST /webhooks/discord ───

describe('INTEG-008: POST /webhooks/discord', () => {
	let server: ReturnType<typeof createGatewayServer>;
	let httpServer: http.Server;
	let handleMessage: ReturnType<typeof vi.fn>;
	let ed25519: { publicKey: crypto.KeyObject; privateKey: crypto.KeyObject };
	let publicKeyHex: string;

	beforeEach(async () => {
		ed25519 = generateEd25519KeyPair();
		publicKeyHex = ed25519.publicKey
			.export({ type: 'spki', format: 'der' })
			.subarray(-32)
			.toString('hex');

		const deps = createMockDeps();
		handleMessage = deps.handleMessage as ReturnType<typeof vi.fn>;
		const config = createTestConfig({ discordPublicKey: publicKeyHex });
		server = createGatewayServer(config, deps);
		httpServer = await server.start();
	});

	afterEach(async () => {
		await server.stop();
	});

	it('responds to PING (type=1) with PONG (type=1)', async () => {
		const body = JSON.stringify({ type: 1 });
		const timestamp = String(Math.floor(Date.now() / 1000));
		const signature = generateDiscordSignature(ed25519.privateKey, timestamp, body);

		const res = await makeRequest(httpServer, {
			method: 'POST',
			path: '/webhooks/discord',
			headers: {
				'content-type': 'application/json',
				'x-signature-ed25519': signature,
				'x-signature-timestamp': timestamp,
			},
			body,
		});

		expect(res.status).toBe(200);
		const parsed = JSON.parse(res.body);
		expect(parsed.type).toBe(1);
	});

	it('returns 401 when signature headers are missing', async () => {
		const body = JSON.stringify({ type: 1 });

		const res = await makeRequest(httpServer, {
			method: 'POST',
			path: '/webhooks/discord',
			headers: { 'content-type': 'application/json' },
			body,
		});

		expect(res.status).toBe(401);
	});

	it('returns 401 when signature is invalid', async () => {
		const body = JSON.stringify({ type: 1 });
		const timestamp = String(Math.floor(Date.now() / 1000));

		const res = await makeRequest(httpServer, {
			method: 'POST',
			path: '/webhooks/discord',
			headers: {
				'content-type': 'application/json',
				'x-signature-ed25519': 'deadbeef'.repeat(16),
				'x-signature-timestamp': timestamp,
			},
			body,
		});

		expect(res.status).toBe(401);
	});

	it('routes MESSAGE_CREATE interaction to handleMessage', async () => {
		const interaction = {
			type: 2,
			data: {
				name: 'chat',
				options: [{ name: 'message', value: 'hello from discord' }],
			},
			member: { user: { id: 'discord-user-123' } },
			channel_id: 'discord-channel-456',
		};
		const body = JSON.stringify(interaction);
		const timestamp = String(Math.floor(Date.now() / 1000));
		const signature = generateDiscordSignature(ed25519.privateKey, timestamp, body);

		const res = await makeRequest(httpServer, {
			method: 'POST',
			path: '/webhooks/discord',
			headers: {
				'content-type': 'application/json',
				'x-signature-ed25519': signature,
				'x-signature-timestamp': timestamp,
			},
			body,
		});

		expect(res.status).toBe(200);
		expect(handleMessage).toHaveBeenCalledTimes(1);
		const callArg = handleMessage.mock.calls[0]?.[0] as Record<string, unknown>;
		expect(callArg.userId).toBe('discord-user-123');
		expect(callArg.channelId).toBe('discord-channel-456');
	});

	it('returns 400 for invalid JSON body', async () => {
		const timestamp = String(Math.floor(Date.now() / 1000));
		const body = 'not json';
		const signature = generateDiscordSignature(ed25519.privateKey, timestamp, body);

		const res = await makeRequest(httpServer, {
			method: 'POST',
			path: '/webhooks/discord',
			headers: {
				'content-type': 'application/json',
				'x-signature-ed25519': signature,
				'x-signature-timestamp': timestamp,
			},
			body,
		});

		expect(res.status).toBe(400);
	});

	it('does not require Bearer auth', async () => {
		const body = JSON.stringify({ type: 1 });
		const timestamp = String(Math.floor(Date.now() / 1000));
		const signature = generateDiscordSignature(ed25519.privateKey, timestamp, body);

		const res = await makeRequest(httpServer, {
			method: 'POST',
			path: '/webhooks/discord',
			headers: {
				'content-type': 'application/json',
				'x-signature-ed25519': signature,
				'x-signature-timestamp': timestamp,
			},
			body,
		});

		// Should succeed without Bearer auth — only Ed25519 signature needed
		expect(res.status).toBe(200);
	});

	it('returns 503 when handleMessage is not configured for application command', async () => {
		await server.stop();
		const deps: GatewayDeps = {
			healthCheck: vi
				.fn()
				.mockResolvedValue({ state: 'healthy', checks: {}, timestamp: new Date(), uptime: 100 }),
		};
		const config = createTestConfig({ discordPublicKey: publicKeyHex });
		server = createGatewayServer(config, deps);
		httpServer = await server.start();

		const interaction = {
			type: 2,
			data: { name: 'chat', options: [{ name: 'message', value: 'hello' }] },
			member: { user: { id: 'user-1' } },
			channel_id: 'ch-1',
		};
		const body = JSON.stringify(interaction);
		const timestamp = String(Math.floor(Date.now() / 1000));
		const signature = generateDiscordSignature(ed25519.privateKey, timestamp, body);

		const res = await makeRequest(httpServer, {
			method: 'POST',
			path: '/webhooks/discord',
			headers: {
				'content-type': 'application/json',
				'x-signature-ed25519': signature,
				'x-signature-timestamp': timestamp,
			},
			body,
		});

		expect(res.status).toBe(503);
	});

	it('returns deferred response for application commands with handleMessage', async () => {
		const interaction = {
			type: 2,
			data: { name: 'chat', options: [{ name: 'message', value: 'hello' }] },
			member: { user: { id: 'user-1' } },
			channel_id: 'ch-1',
		};
		const body = JSON.stringify(interaction);
		const timestamp = String(Math.floor(Date.now() / 1000));
		const signature = generateDiscordSignature(ed25519.privateKey, timestamp, body);

		const res = await makeRequest(httpServer, {
			method: 'POST',
			path: '/webhooks/discord',
			headers: {
				'content-type': 'application/json',
				'x-signature-ed25519': signature,
				'x-signature-timestamp': timestamp,
			},
			body,
		});

		expect(res.status).toBe(200);
		const parsed = JSON.parse(res.body);
		// Discord expects type=5 (DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE) for async processing
		expect(parsed.type).toBe(5);
	});
});
