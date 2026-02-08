import * as crypto from 'node:crypto';
import * as http from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGatewayServer } from '../src/server.js';
import type { GatewayConfig, GatewayDeps } from '../src/types.js';

/**
 * HARDEN-006: Discord DEFERRED fire-and-forget pattern.
 *
 * Discord expects an immediate DEFERRED response (type=5) when receiving
 * an APPLICATION_COMMAND interaction. The actual processing happens
 * asynchronously, with the result sent via a webhook PATCH to:
 * https://discord.com/api/v10/webhooks/{application_id}/{interaction_token}/messages/@original
 *
 * Previously, handleDiscordCommand awaited handleMessage before returning
 * the DEFERRED response, defeating the purpose.
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
		discordApplicationId: 'test-app-id-123',
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
			content: 'Mock response from Axel',
			sessionId: 'sess-mock',
			channelSwitched: false,
			usage: { inputTokens: 10, outputTokens: 20, cacheReadTokens: 0, cacheCreationTokens: 0 },
		}),
	};
}

function generateEd25519KeyPair(): { publicKey: crypto.KeyObject; privateKey: crypto.KeyObject } {
	return crypto.generateKeyPairSync('ed25519');
}

function generateDiscordSignature(
	privateKey: crypto.KeyObject,
	timestamp: string,
	body: string,
): string {
	const message = Buffer.from(timestamp + body);
	const signature = crypto.sign(null, message, privateKey);
	return signature.toString('hex');
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

describe('HARDEN-006: Discord DEFERRED fire-and-forget', () => {
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

	function signedRequest(interaction: Record<string, unknown>) {
		const body = JSON.stringify(interaction);
		const timestamp = String(Math.floor(Date.now() / 1000));
		const signature = generateDiscordSignature(ed25519.privateKey, timestamp, body);
		return makeRequest(httpServer, {
			method: 'POST',
			path: '/webhooks/discord',
			headers: {
				'content-type': 'application/json',
				'x-signature-ed25519': signature,
				'x-signature-timestamp': timestamp,
			},
			body,
		});
	}

	it('returns DEFERRED (type=5) immediately without waiting for handleMessage', async () => {
		// Make handleMessage take a long time
		let resolveHandler: () => void;
		const handlerPromise = new Promise<void>((r) => {
			resolveHandler = r;
		});
		handleMessage.mockImplementation(async () => {
			await handlerPromise;
			return {
				content: 'Delayed response',
				sessionId: 'sess-1',
				channelSwitched: false,
				usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
			};
		});

		const interaction = {
			type: 2,
			data: { name: 'chat', options: [{ name: 'message', value: 'hello' }] },
			member: { user: { id: 'user-1' } },
			channel_id: 'ch-1',
			token: 'interaction-token-abc',
			application_id: 'test-app-id-123',
		};

		const res = await signedRequest(interaction);

		// DEFERRED should be returned immediately even though handleMessage is still pending
		expect(res.status).toBe(200);
		const parsed = JSON.parse(res.body);
		expect(parsed.type).toBe(5);

		// handleMessage should have been called (fire-and-forget)
		expect(handleMessage).toHaveBeenCalledTimes(1);

		// Resolve the handler to prevent hanging
		resolveHandler!();
	});

	it('includes interaction token in DiscordInteraction type', async () => {
		const interaction = {
			type: 2,
			data: { name: 'chat', options: [{ name: 'message', value: 'hello' }] },
			member: { user: { id: 'user-1' } },
			channel_id: 'ch-1',
			token: 'interaction-token-xyz',
			application_id: 'test-app-id-123',
		};

		const res = await signedRequest(interaction);

		expect(res.status).toBe(200);
		const parsed = JSON.parse(res.body);
		expect(parsed.type).toBe(5);
	});

	it('calls discordFollowUp callback with result after handleMessage completes', async () => {
		let resolveHandler: () => void;
		const handlerPromise = new Promise<void>((r) => {
			resolveHandler = r;
		});
		const followUpResult = {
			content: 'Axel reply',
			sessionId: 'sess-follow',
			channelSwitched: false,
			usage: { inputTokens: 5, outputTokens: 10, cacheReadTokens: 0, cacheCreationTokens: 0 },
		};
		handleMessage.mockImplementation(async () => {
			await handlerPromise;
			return followUpResult;
		});

		const discordFollowUp = vi.fn().mockResolvedValue(undefined);

		// Recreate server with follow-up callback
		await server.stop();
		const deps = createMockDeps();
		handleMessage = deps.handleMessage as ReturnType<typeof vi.fn>;
		handleMessage.mockImplementation(async () => {
			await handlerPromise;
			return followUpResult;
		});
		(deps as Record<string, unknown>).discordFollowUp = discordFollowUp;
		const config = createTestConfig({ discordPublicKey: publicKeyHex });
		server = createGatewayServer(config, deps);
		httpServer = await server.start();

		const interaction = {
			type: 2,
			data: { name: 'chat', options: [{ name: 'message', value: 'hello' }] },
			member: { user: { id: 'user-1' } },
			channel_id: 'ch-1',
			token: 'interaction-token-follow',
			application_id: 'test-app-id-123',
		};

		const res = await signedRequest(interaction);
		expect(res.status).toBe(200);
		expect(JSON.parse(res.body).type).toBe(5);

		// Resolve the handler
		resolveHandler!();
		// Wait for the fire-and-forget to complete
		await vi.waitFor(() => {
			expect(discordFollowUp).toHaveBeenCalledTimes(1);
		});

		// Follow-up should be called with application_id, token, and content
		expect(discordFollowUp).toHaveBeenCalledWith(
			'test-app-id-123',
			'interaction-token-follow',
			'Axel reply',
		);
	});

	it('calls discordFollowUp with error message on handleMessage failure', async () => {
		handleMessage.mockRejectedValue(new Error('LLM service unavailable'));

		const discordFollowUp = vi.fn().mockResolvedValue(undefined);

		await server.stop();
		const deps = createMockDeps();
		handleMessage = deps.handleMessage as ReturnType<typeof vi.fn>;
		handleMessage.mockRejectedValue(new Error('LLM service unavailable'));
		(deps as Record<string, unknown>).discordFollowUp = discordFollowUp;
		const config = createTestConfig({ discordPublicKey: publicKeyHex });
		server = createGatewayServer(config, deps);
		httpServer = await server.start();

		const interaction = {
			type: 2,
			data: { name: 'chat', options: [{ name: 'message', value: 'hello' }] },
			member: { user: { id: 'user-1' } },
			channel_id: 'ch-1',
			token: 'interaction-token-err',
			application_id: 'test-app-id-123',
		};

		const res = await signedRequest(interaction);
		expect(res.status).toBe(200);
		expect(JSON.parse(res.body).type).toBe(5);

		await vi.waitFor(() => {
			expect(discordFollowUp).toHaveBeenCalledTimes(1);
		});

		// On error, follow-up should contain an error message (not the raw error)
		const followUpContent = discordFollowUp.mock.calls[0]?.[2] as string;
		expect(followUpContent).toContain('처리 중 오류가 발생했습니다');
	});

	it('does not call discordFollowUp when interaction has no token', async () => {
		const discordFollowUp = vi.fn().mockResolvedValue(undefined);

		await server.stop();
		const deps = createMockDeps();
		handleMessage = deps.handleMessage as ReturnType<typeof vi.fn>;
		handleMessage.mockResolvedValue({
			content: 'Mock response',
			sessionId: 'sess-1',
			channelSwitched: false,
			usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
		});
		(deps as Record<string, unknown>).discordFollowUp = discordFollowUp;
		const config = createTestConfig({ discordPublicKey: publicKeyHex });
		server = createGatewayServer(config, deps);
		httpServer = await server.start();

		const interaction = {
			type: 2,
			data: { name: 'chat', options: [{ name: 'message', value: 'hello' }] },
			member: { user: { id: 'user-1' } },
			channel_id: 'ch-1',
			// No token — cannot follow up
		};

		const res = await signedRequest(interaction);
		expect(res.status).toBe(200);
		expect(JSON.parse(res.body).type).toBe(5);

		// Give time for potential follow-up call
		await new Promise((r) => setTimeout(r, 50));

		// Without token, follow-up cannot be sent — handleMessage still runs fire-and-forget
		// but discordFollowUp should NOT be called
		expect(discordFollowUp).not.toHaveBeenCalled();
	});

	it('still returns DEFERRED even when discordFollowUp is not provided', async () => {
		// Default deps (no discordFollowUp)
		const interaction = {
			type: 2,
			data: { name: 'chat', options: [{ name: 'message', value: 'hello' }] },
			member: { user: { id: 'user-1' } },
			channel_id: 'ch-1',
			token: 'interaction-token-noop',
			application_id: 'test-app-id-123',
		};

		const res = await signedRequest(interaction);
		expect(res.status).toBe(200);
		expect(JSON.parse(res.body).type).toBe(5);

		// handleMessage should still be called (fire-and-forget)
		expect(handleMessage).toHaveBeenCalledTimes(1);
	});
});
