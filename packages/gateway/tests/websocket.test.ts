import type * as http from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WebSocket from 'ws';
import { createGatewayServer } from '../src/server.js';
import type { GatewayConfig, GatewayDeps } from '../src/server.js';

function createTestConfig(overrides?: Partial<GatewayConfig>): GatewayConfig {
	return {
		port: 0,
		host: '127.0.0.1',
		authToken: 'test-auth-token-12345',
		env: 'development',
		corsOrigins: ['http://localhost:3000'],
		rateLimitPerMinute: 100,
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
	};
}

function connectWs(httpServer: http.Server): Promise<WebSocket> {
	return new Promise((resolve, reject) => {
		const addr = httpServer.address() as { port: number };
		const ws = new WebSocket(`ws://127.0.0.1:${addr.port}/ws`);
		ws.on('open', () => resolve(ws));
		ws.on('error', reject);
	});
}

function waitForMessage(ws: WebSocket): Promise<Record<string, unknown>> {
	return new Promise((resolve, reject) => {
		const timeout = setTimeout(() => reject(new Error('WS message timeout')), 5000);
		ws.once('message', (data: WebSocket.RawData) => {
			clearTimeout(timeout);
			resolve(JSON.parse(data.toString()));
		});
	});
}

function waitForClose(ws: WebSocket): Promise<{ code: number; reason: string }> {
	return new Promise((resolve) => {
		ws.on('close', (code: number, reason: Buffer) => {
			resolve({ code, reason: reason.toString() });
		});
	});
}

describe('Gateway WebSocket — First-Message Auth (ADR-019)', () => {
	let server: ReturnType<typeof createGatewayServer>;
	let httpServer: http.Server;

	beforeEach(async () => {
		const config = createTestConfig();
		const deps = createMockDeps();
		server = createGatewayServer(config, deps);
		httpServer = await server.start();
	});

	afterEach(async () => {
		await server.stop();
	});

	describe('first-message auth', () => {
		it('accepts connection and waits for auth message (no query param needed)', async () => {
			const ws = await connectWs(httpServer);

			expect(ws.readyState).toBe(WebSocket.OPEN);
			ws.close();
		});

		it('authenticates with valid token in first message', async () => {
			const ws = await connectWs(httpServer);

			ws.send(JSON.stringify({ type: 'auth', token: 'test-auth-token-12345' }));
			const msg = await waitForMessage(ws);

			expect(msg.type).toBe('auth_ok');
			ws.close();
		});

		it('rejects invalid token in auth message with code 4001', async () => {
			const ws = await connectWs(httpServer);
			const closePromise = waitForClose(ws);

			ws.send(JSON.stringify({ type: 'auth', token: 'wrong-token' }));
			const { code } = await closePromise;

			expect(code).toBe(4001);
		});

		it('rejects non-auth first message before authentication', async () => {
			const ws = await connectWs(httpServer);
			const closePromise = waitForClose(ws);

			ws.send(JSON.stringify({ type: 'session_info_request' }));
			const { code } = await closePromise;

			expect(code).toBe(4001);
		});

		it('closes with 4001 after 5s auth timeout', async () => {
			const ws = await connectWs(httpServer);
			const closePromise = waitForClose(ws);

			// Wait for timeout — use fake timers
			// In real test we just wait, but we can verify the timeout behavior
			// by checking the close happens with 4001
			const { code } = await closePromise;

			expect(code).toBe(4001);
		}, 10_000);

		it('rejects auth message with missing token field', async () => {
			const ws = await connectWs(httpServer);
			const closePromise = waitForClose(ws);

			ws.send(JSON.stringify({ type: 'auth' }));
			const { code } = await closePromise;

			expect(code).toBe(4001);
		});
	});

	describe('authenticated message handling', () => {
		async function connectAndAuth(httpServer: http.Server): Promise<WebSocket> {
			const ws = await connectWs(httpServer);
			ws.send(JSON.stringify({ type: 'auth', token: 'test-auth-token-12345' }));
			await waitForMessage(ws); // consume auth_ok
			return ws;
		}

		it('responds to session_info_request after auth', async () => {
			const ws = await connectAndAuth(httpServer);

			ws.send(JSON.stringify({ type: 'session_info_request' }));
			const msg = await waitForMessage(ws);

			expect(msg.type).toBe('session_info');
			ws.close();
		});

		it('returns error for invalid JSON after auth', async () => {
			const ws = await connectAndAuth(httpServer);

			ws.send('not json');
			const msg = await waitForMessage(ws);

			expect(msg.type).toBe('error');
			ws.close();
		});

		it('returns error for unknown message type after auth', async () => {
			const ws = await connectAndAuth(httpServer);

			ws.send(JSON.stringify({ type: 'unknown_type' }));
			const msg = await waitForMessage(ws);

			expect(msg.type).toBe('error');
			ws.close();
		});
	});

	describe('WS message size limit (AUD-079)', () => {
		it('closes connection with 1009 when authenticated message exceeds 64KB', async () => {
			const ws = await connectWs(httpServer);

			// Authenticate first
			ws.send(JSON.stringify({ type: 'auth', token: 'test-auth-token-12345' }));
			await waitForMessage(ws); // consume auth_ok

			const closePromise = waitForClose(ws);

			// Send a message larger than 64KB
			const largeContent = 'a'.repeat(70_000);
			ws.send(JSON.stringify({ type: 'chat', content: largeContent, channelId: 'webchat' }));

			const { code } = await closePromise;
			expect(code).toBe(1009); // Message Too Big
		});

		it('accepts messages under 64KB', async () => {
			const ws = await connectWs(httpServer);

			ws.send(JSON.stringify({ type: 'auth', token: 'test-auth-token-12345' }));
			await waitForMessage(ws); // consume auth_ok

			// Send a message under 64KB
			const normalContent = 'a'.repeat(1000);
			ws.send(JSON.stringify({ type: 'chat', content: normalContent, channelId: 'webchat' }));
			const msg = await waitForMessage(ws);

			// Should get a response (error about missing handler or actual response), not disconnection
			expect(msg).toBeDefined();
			ws.close();
		});

		it('rejects oversized unauthenticated messages with 1009', async () => {
			const ws = await connectWs(httpServer);
			const closePromise = waitForClose(ws);

			// Send an oversized auth message before authenticating
			const largeToken = 'a'.repeat(70_000);
			ws.send(JSON.stringify({ type: 'auth', token: largeToken }));

			const { code } = await closePromise;
			expect(code).toBe(1009);
		});
	});

	describe('close behavior', () => {
		it('closes cleanly when server stops', async () => {
			const ws = await connectWs(httpServer);
			ws.send(JSON.stringify({ type: 'auth', token: 'test-auth-token-12345' }));
			await waitForMessage(ws); // consume auth_ok

			const closedPromise = new Promise<number>((resolve) => {
				ws.on('close', (code: number) => resolve(code));
			});

			await server.stop();

			const code = await closedPromise;
			expect(code).toBe(1001); // Going Away
		});
	});
});
