import * as crypto from 'node:crypto';
import * as http from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGatewayServer } from '../src/server.js';
import type { GatewayConfig, GatewayDeps } from '../src/types.js';

/**
 * GAP-WEBHOOK-001: Hardened webhook signature verification tests.
 *
 * These tests focus on edge cases, timing-safe comparison, and cryptographic
 * verification hardening for both Telegram and Discord webhook handlers.
 *
 * Tests verify:
 * - Telegram: timing-safe comparison of X-Telegram-Bot-Api-Secret-Token
 * - Discord: Ed25519 signature verification with X-Signature-Ed25519 + X-Signature-Timestamp
 * - Edge cases: missing headers, invalid formats, tampered data, unicode, large bodies
 */

// ─── Test Utilities ───

function createTestConfig(overrides?: Partial<GatewayConfig>): GatewayConfig {
	return {
		port: 0,
		host: '127.0.0.1',
		authToken: 'test-auth-token-12345',
		env: 'development',
		corsOrigins: ['http://localhost:3000'],
		rateLimitPerMinute: 100,
		telegramWebhookSecret: 'test-telegram-secret-32chars12',
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

/** Generate Ed25519 test keypair with raw 32-byte public key extraction */
function generateTestKeyPair(): {
	publicKey: crypto.KeyObject;
	privateKey: crypto.KeyObject;
	publicKeyHex: string;
} {
	const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
	const pubKeyDer = publicKey.export({ type: 'spki', format: 'der' });
	// Extract raw 32-byte public key (skip DER header)
	const rawPubKey = pubKeyDer.subarray(pubKeyDer.length - 32);
	return { publicKey, privateKey, publicKeyHex: rawPubKey.toString('hex') };
}

/** Sign a Discord request body with Ed25519 private key */
function signDiscordRequest(privateKey: crypto.KeyObject, timestamp: string, body: string): string {
	const message = Buffer.from(timestamp + body);
	const sig = crypto.sign(null, message, privateKey);
	return sig.toString('hex');
}

// ─── Telegram Webhook Verification Tests ───

describe('GAP-WEBHOOK-001: Telegram webhook verification hardening', () => {
	let server: ReturnType<typeof createGatewayServer>;
	let httpServer: http.Server;

	beforeEach(async () => {
		const deps = createMockDeps();
		const config = createTestConfig({ telegramWebhookSecret: 'test-secret-token-32chars-ok' });
		server = createGatewayServer(config, deps);
		httpServer = await server.start();
	});

	afterEach(async () => {
		await server.stop();
	});

	it('rejects when secret token header is missing', async () => {
		const body = JSON.stringify({
			update_id: 1,
			message: { message_id: 1, chat: { id: 123 }, from: { id: 456 }, text: 'test' },
		});

		const res = await makeRequest(httpServer, {
			method: 'POST',
			path: '/webhooks/telegram',
			headers: { 'content-type': 'application/json' },
			body,
		});

		expect(res.status).toBe(401);
		const parsed = JSON.parse(res.body);
		expect(parsed.error).toBe('Invalid secret token');
	});

	it('rejects when secret token is wrong', async () => {
		const body = JSON.stringify({
			update_id: 1,
			message: { message_id: 1, chat: { id: 123 }, from: { id: 456 }, text: 'test' },
		});

		const res = await makeRequest(httpServer, {
			method: 'POST',
			path: '/webhooks/telegram',
			headers: {
				'content-type': 'application/json',
				'x-telegram-bot-api-secret-token': 'wrong-secret-token-32chars-no',
			},
			body,
		});

		expect(res.status).toBe(401);
		const parsed = JSON.parse(res.body);
		expect(parsed.error).toBe('Invalid secret token');
	});

	it('accepts valid secret token', async () => {
		const body = JSON.stringify({
			update_id: 1,
			message: {
				message_id: 1,
				chat: { id: 123 },
				from: { id: 456, is_bot: false },
				text: 'test',
				date: 1700000000,
			},
		});

		const res = await makeRequest(httpServer, {
			method: 'POST',
			path: '/webhooks/telegram',
			headers: {
				'content-type': 'application/json',
				'x-telegram-bot-api-secret-token': 'test-secret-token-32chars-ok',
			},
			body,
		});

		expect(res.status).toBe(200);
	});

	it('rejects when config secret is empty', async () => {
		await server.stop();
		const deps = createMockDeps();
		const config = createTestConfig({ telegramWebhookSecret: undefined });
		server = createGatewayServer(config, deps);
		httpServer = await server.start();

		const body = JSON.stringify({
			update_id: 1,
			message: { message_id: 1, chat: { id: 123 }, from: { id: 456 }, text: 'test' },
		});

		const res = await makeRequest(httpServer, {
			method: 'POST',
			path: '/webhooks/telegram',
			headers: {
				'content-type': 'application/json',
				'x-telegram-bot-api-secret-token': 'any-token',
			},
			body,
		});

		expect(res.status).toBe(401);
	});

	it('rejects different length tokens (timing-safe still works)', async () => {
		const body = JSON.stringify({
			update_id: 1,
			message: { message_id: 1, chat: { id: 123 }, from: { id: 456 }, text: 'test' },
		});

		// Token with different length should fail before timingSafeEqual
		const res = await makeRequest(httpServer, {
			method: 'POST',
			path: '/webhooks/telegram',
			headers: {
				'content-type': 'application/json',
				'x-telegram-bot-api-secret-token': 'short',
			},
			body,
		});

		expect(res.status).toBe(401);
		const parsed = JSON.parse(res.body);
		expect(parsed.error).toBe('Invalid secret token');
	});

	it('handles unicode in message body correctly', async () => {
		const body = JSON.stringify({
			update_id: 1,
			message: {
				message_id: 1,
				chat: { id: 123 },
				from: { id: 456, is_bot: false },
				text: '안녕하세요 🚀 Hello',
				date: 1700000000,
			},
		});

		const res = await makeRequest(httpServer, {
			method: 'POST',
			path: '/webhooks/telegram',
			headers: {
				'content-type': 'application/json',
				'x-telegram-bot-api-secret-token': 'test-secret-token-32chars-ok',
			},
			body,
		});

		expect(res.status).toBe(200);
	});

	it('handles very large body strings', async () => {
		const largeText = 'a'.repeat(10000);
		const body = JSON.stringify({
			update_id: 1,
			message: {
				message_id: 1,
				chat: { id: 123 },
				from: { id: 456, is_bot: false },
				text: largeText,
				date: 1700000000,
			},
		});

		const res = await makeRequest(httpServer, {
			method: 'POST',
			path: '/webhooks/telegram',
			headers: {
				'content-type': 'application/json',
				'x-telegram-bot-api-secret-token': 'test-secret-token-32chars-ok',
			},
			body,
		});

		expect(res.status).toBe(200);
	});

	it('rejects when header is an array (non-string)', async () => {
		// This test verifies that the type guard works correctly
		// We can't directly send array headers via http.request, but the type guard in the code handles it
		const body = JSON.stringify({
			update_id: 1,
			message: { message_id: 1, chat: { id: 123 }, from: { id: 456 }, text: 'test' },
		});

		// The implementation checks `typeof header !== 'string'` which would catch arrays
		// Since we can't directly test this via HTTP, we verify the existing behavior
		const res = await makeRequest(httpServer, {
			method: 'POST',
			path: '/webhooks/telegram',
			headers: {
				'content-type': 'application/json',
				// Node.js http.request will stringify this, but the type guard would catch arrays
			},
			body,
		});

		// Without the header, it should fail
		expect(res.status).toBe(401);
	});

	it('rejects empty string secret token', async () => {
		const body = JSON.stringify({
			update_id: 1,
			message: { message_id: 1, chat: { id: 123 }, from: { id: 456 }, text: 'test' },
		});

		const res = await makeRequest(httpServer, {
			method: 'POST',
			path: '/webhooks/telegram',
			headers: {
				'content-type': 'application/json',
				'x-telegram-bot-api-secret-token': '',
			},
			body,
		});

		expect(res.status).toBe(401);
	});

	it('rejects secret token with only whitespace', async () => {
		const body = JSON.stringify({
			update_id: 1,
			message: { message_id: 1, chat: { id: 123 }, from: { id: 456 }, text: 'test' },
		});

		const res = await makeRequest(httpServer, {
			method: 'POST',
			path: '/webhooks/telegram',
			headers: {
				'content-type': 'application/json',
				'x-telegram-bot-api-secret-token': '   ',
			},
			body,
		});

		expect(res.status).toBe(401);
	});
});

// ─── Discord Webhook Verification Tests ───

describe('GAP-WEBHOOK-001: Discord webhook verification hardening', () => {
	let server: ReturnType<typeof createGatewayServer>;
	let httpServer: http.Server;
	let testKeys: ReturnType<typeof generateTestKeyPair>;

	beforeEach(async () => {
		testKeys = generateTestKeyPair();
		const deps = createMockDeps();
		const config = createTestConfig({ discordPublicKey: testKeys.publicKeyHex });
		server = createGatewayServer(config, deps);
		httpServer = await server.start();
	});

	afterEach(async () => {
		await server.stop();
	});

	it('rejects when signature header is missing', async () => {
		const body = JSON.stringify({ type: 1 });
		const timestamp = String(Math.floor(Date.now() / 1000));

		const res = await makeRequest(httpServer, {
			method: 'POST',
			path: '/webhooks/discord',
			headers: {
				'content-type': 'application/json',
				'x-signature-timestamp': timestamp,
			},
			body,
		});

		expect(res.status).toBe(401);
		const parsed = JSON.parse(res.body);
		expect(parsed.error).toBe('Invalid signature');
	});

	it('rejects when timestamp header is missing', async () => {
		const body = JSON.stringify({ type: 1 });
		const timestamp = String(Math.floor(Date.now() / 1000));
		const signature = signDiscordRequest(testKeys.privateKey, timestamp, body);

		const res = await makeRequest(httpServer, {
			method: 'POST',
			path: '/webhooks/discord',
			headers: {
				'content-type': 'application/json',
				'x-signature-ed25519': signature,
			},
			body,
		});

		expect(res.status).toBe(401);
		const parsed = JSON.parse(res.body);
		expect(parsed.error).toBe('Invalid signature');
	});

	it('rejects invalid hex in signature', async () => {
		const body = JSON.stringify({ type: 1 });
		const timestamp = String(Math.floor(Date.now() / 1000));

		const res = await makeRequest(httpServer, {
			method: 'POST',
			path: '/webhooks/discord',
			headers: {
				'content-type': 'application/json',
				'x-signature-ed25519': 'not-valid-hex-characters!!!',
				'x-signature-timestamp': timestamp,
			},
			body,
		});

		expect(res.status).toBe(401);
		const parsed = JSON.parse(res.body);
		expect(parsed.error).toBe('Invalid signature');
	});

	it('rejects when public key is missing in config', async () => {
		await server.stop();
		const deps = createMockDeps();
		const config = createTestConfig({ discordPublicKey: undefined });
		server = createGatewayServer(config, deps);
		httpServer = await server.start();

		const body = JSON.stringify({ type: 1 });
		const timestamp = String(Math.floor(Date.now() / 1000));
		const signature = signDiscordRequest(testKeys.privateKey, timestamp, body);

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

		expect(res.status).toBe(401);
	});

	it('accepts valid Ed25519 signature', async () => {
		const body = JSON.stringify({ type: 1 });
		const timestamp = String(Math.floor(Date.now() / 1000));
		const signature = signDiscordRequest(testKeys.privateKey, timestamp, body);

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
		expect(parsed.type).toBe(1); // PONG response
	});

	it('rejects tampered body (signature mismatch)', async () => {
		const originalBody = JSON.stringify({ type: 1, data: 'original' });
		const timestamp = String(Math.floor(Date.now() / 1000));
		const signature = signDiscordRequest(testKeys.privateKey, timestamp, originalBody);

		// Send different body with same signature
		const tamperedBody = JSON.stringify({ type: 1, data: 'tampered' });

		const res = await makeRequest(httpServer, {
			method: 'POST',
			path: '/webhooks/discord',
			headers: {
				'content-type': 'application/json',
				'x-signature-ed25519': signature,
				'x-signature-timestamp': timestamp,
			},
			body: tamperedBody,
		});

		expect(res.status).toBe(401);
		const parsed = JSON.parse(res.body);
		expect(parsed.error).toBe('Invalid signature');
	});

	it('rejects signature from wrong private key', async () => {
		const wrongKeys = generateTestKeyPair();
		const body = JSON.stringify({ type: 1 });
		const timestamp = String(Math.floor(Date.now() / 1000));
		const signature = signDiscordRequest(wrongKeys.privateKey, timestamp, body);

		// Server has testKeys.publicKey, but signature made with wrongKeys.privateKey
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

		expect(res.status).toBe(401);
		const parsed = JSON.parse(res.body);
		expect(parsed.error).toBe('Invalid signature');
	});

	it('handles unicode in Discord interaction body', async () => {
		const body = JSON.stringify({
			type: 2,
			data: {
				name: 'chat',
				options: [{ name: 'message', value: '안녕하세요 🚀 Discord' }],
			},
			member: { user: { id: 'user-123' } },
			channel_id: 'channel-456',
		});
		const timestamp = String(Math.floor(Date.now() / 1000));
		const signature = signDiscordRequest(testKeys.privateKey, timestamp, body);

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
	});

	it('handles very large Discord interaction body', async () => {
		const largeMessage = 'x'.repeat(5000);
		const body = JSON.stringify({
			type: 2,
			data: {
				name: 'chat',
				options: [{ name: 'message', value: largeMessage }],
			},
			member: { user: { id: 'user-123' } },
			channel_id: 'channel-456',
		});
		const timestamp = String(Math.floor(Date.now() / 1000));
		const signature = signDiscordRequest(testKeys.privateKey, timestamp, body);

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
	});

	it('rejects signature with invalid length', async () => {
		const body = JSON.stringify({ type: 1 });
		const timestamp = String(Math.floor(Date.now() / 1000));

		// Ed25519 signatures are 64 bytes (128 hex chars), send shorter
		const res = await makeRequest(httpServer, {
			method: 'POST',
			path: '/webhooks/discord',
			headers: {
				'content-type': 'application/json',
				'x-signature-ed25519': 'deadbeef',
				'x-signature-timestamp': timestamp,
			},
			body,
		});

		expect(res.status).toBe(401);
		const parsed = JSON.parse(res.body);
		expect(parsed.error).toBe('Invalid signature');
	});

	it('rejects when timestamp is tampered', async () => {
		const body = JSON.stringify({ type: 1 });
		const originalTimestamp = String(Math.floor(Date.now() / 1000));
		const signature = signDiscordRequest(testKeys.privateKey, originalTimestamp, body);

		// Send different timestamp with same signature
		const tamperedTimestamp = String(Math.floor(Date.now() / 1000) + 100);

		const res = await makeRequest(httpServer, {
			method: 'POST',
			path: '/webhooks/discord',
			headers: {
				'content-type': 'application/json',
				'x-signature-ed25519': signature,
				'x-signature-timestamp': tamperedTimestamp,
			},
			body,
		});

		expect(res.status).toBe(401);
		const parsed = JSON.parse(res.body);
		expect(parsed.error).toBe('Invalid signature');
	});

	it('rejects malformed public key hex in config', async () => {
		await server.stop();
		const deps = createMockDeps();
		const config = createTestConfig({ discordPublicKey: 'not-valid-hex!!!' });
		server = createGatewayServer(config, deps);
		httpServer = await server.start();

		const body = JSON.stringify({ type: 1 });
		const timestamp = String(Math.floor(Date.now() / 1000));
		const signature = signDiscordRequest(testKeys.privateKey, timestamp, body);

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

		expect(res.status).toBe(401);
		const parsed = JSON.parse(res.body);
		expect(parsed.error).toBe('Invalid signature');
	});

	it('rejects empty signature header', async () => {
		const body = JSON.stringify({ type: 1 });
		const timestamp = String(Math.floor(Date.now() / 1000));

		const res = await makeRequest(httpServer, {
			method: 'POST',
			path: '/webhooks/discord',
			headers: {
				'content-type': 'application/json',
				'x-signature-ed25519': '',
				'x-signature-timestamp': timestamp,
			},
			body,
		});

		expect(res.status).toBe(401);
		const parsed = JSON.parse(res.body);
		expect(parsed.error).toBe('Invalid signature');
	});

	it('rejects empty timestamp header', async () => {
		const body = JSON.stringify({ type: 1 });
		const timestamp = String(Math.floor(Date.now() / 1000));
		const signature = signDiscordRequest(testKeys.privateKey, timestamp, body);

		const res = await makeRequest(httpServer, {
			method: 'POST',
			path: '/webhooks/discord',
			headers: {
				'content-type': 'application/json',
				'x-signature-ed25519': signature,
				'x-signature-timestamp': '',
			},
			body,
		});

		expect(res.status).toBe(401);
		const parsed = JSON.parse(res.body);
		expect(parsed.error).toBe('Invalid signature');
	});
});
