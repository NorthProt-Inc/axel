import type * as http from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WebSocket from 'ws';
import { createGatewayServer } from '../src/server.js';
import type { GatewayConfig, GatewayDeps } from '../src/server.js';

function createTestConfig(): GatewayConfig {
	return {
		port: 0,
		host: '127.0.0.1',
		authToken: 'test-auth-token-12345',
		env: 'development',
		corsOrigins: ['http://localhost:3000'],
		rateLimitPerMinute: 100,
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

function connectWs(httpServer: http.Server, token?: string): Promise<WebSocket> {
	return new Promise((resolve, reject) => {
		const addr = httpServer.address() as { port: number };
		const url = token
			? `ws://127.0.0.1:${addr.port}/ws?token=${token}`
			: `ws://127.0.0.1:${addr.port}/ws`;
		const ws = new WebSocket(url);
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

describe('Gateway WebSocket', () => {
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

	describe('connection', () => {
		it('accepts WebSocket connections with valid token in query', async () => {
			const ws = await connectWs(httpServer, 'test-auth-token-12345');

			expect(ws.readyState).toBe(WebSocket.OPEN);
			ws.close();
		});

		it('rejects WebSocket connections without token', async () => {
			await expect(connectWs(httpServer)).rejects.toThrow();
		});

		it('rejects WebSocket connections with invalid token', async () => {
			await expect(connectWs(httpServer, 'wrong-token')).rejects.toThrow();
		});
	});

	describe('message handling', () => {
		it('responds to session_info_request with session_info', async () => {
			const ws = await connectWs(httpServer, 'test-auth-token-12345');

			ws.send(JSON.stringify({ type: 'session_info_request' }));
			const msg = await waitForMessage(ws);

			expect(msg.type).toBe('session_info');
			ws.close();
		});

		it('returns error for invalid JSON', async () => {
			const ws = await connectWs(httpServer, 'test-auth-token-12345');

			ws.send('not json');
			const msg = await waitForMessage(ws);

			expect(msg.type).toBe('error');
			ws.close();
		});

		it('returns error for unknown message type', async () => {
			const ws = await connectWs(httpServer, 'test-auth-token-12345');

			ws.send(JSON.stringify({ type: 'unknown_type' }));
			const msg = await waitForMessage(ws);

			expect(msg.type).toBe('error');
			ws.close();
		});
	});

	describe('close behavior', () => {
		it('closes cleanly when server stops', async () => {
			const ws = await connectWs(httpServer, 'test-auth-token-12345');
			const closedPromise = new Promise<number>((resolve) => {
				ws.on('close', (code: number) => resolve(code));
			});

			await server.stop();

			const code = await closedPromise;
			expect(code).toBe(1001); // Going Away
		});
	});
});
