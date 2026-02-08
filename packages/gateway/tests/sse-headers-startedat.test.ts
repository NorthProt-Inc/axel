import * as http from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGatewayServer } from '../src/server.js';
import type { GatewayConfig, GatewayDeps } from '../src/types.js';

/**
 * HARDEN-007: SSE security headers + startedAt timing.
 *
 * (1) QA-020-L3: SSE writeHead in handleChatStream is missing
 *     X-Content-Type-Options + X-Frame-Options security headers.
 *     All other responses (via sendJson) already have them.
 *
 * (2) AUD-094: startedAt is set when createGatewayServer is called,
 *     not when start() is called. Should measure actual uptime from
 *     httpServer.listen callback.
 */

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
		handleMessage: vi.fn().mockResolvedValue({
			content: 'Mock SSE response',
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

describe('HARDEN-007: SSE security headers', () => {
	let server: ReturnType<typeof createGatewayServer>;
	let httpServer: http.Server;

	beforeEach(async () => {
		const deps = createMockDeps();
		const config = createTestConfig();
		server = createGatewayServer(config, deps);
		httpServer = await server.start();
	});

	afterEach(async () => {
		await server.stop();
	});

	it('includes X-Content-Type-Options: nosniff in SSE response', async () => {
		const res = await makeRequest(httpServer, {
			method: 'POST',
			path: '/api/v1/chat/stream',
			headers: {
				'content-type': 'application/json',
				authorization: 'Bearer test-auth-token-12345',
			},
			body: JSON.stringify({ content: 'hello', channelId: 'ch-1' }),
		});

		expect(res.status).toBe(200);
		expect(res.headers['x-content-type-options']).toBe('nosniff');
	});

	it('includes X-Frame-Options: DENY in SSE response', async () => {
		const res = await makeRequest(httpServer, {
			method: 'POST',
			path: '/api/v1/chat/stream',
			headers: {
				'content-type': 'application/json',
				authorization: 'Bearer test-auth-token-12345',
			},
			body: JSON.stringify({ content: 'hello', channelId: 'ch-1' }),
		});

		expect(res.status).toBe(200);
		expect(res.headers['x-frame-options']).toBe('DENY');
	});

	it('preserves existing SSE headers alongside security headers', async () => {
		const res = await makeRequest(httpServer, {
			method: 'POST',
			path: '/api/v1/chat/stream',
			headers: {
				'content-type': 'application/json',
				authorization: 'Bearer test-auth-token-12345',
			},
			body: JSON.stringify({ content: 'hello', channelId: 'ch-1' }),
		});

		expect(res.status).toBe(200);
		expect(res.headers['content-type']).toBe('text/event-stream');
		expect(res.headers['cache-control']).toBe('no-cache');
		expect(res.headers.connection).toBe('keep-alive');
	});
});

describe('HARDEN-007: startedAt timing', () => {
	it('reports uptime from start() not from createGatewayServer()', async () => {
		const deps: GatewayDeps = {
			healthCheck: vi.fn().mockResolvedValue({
				state: 'healthy',
				checks: {},
				timestamp: new Date(),
				uptime: 100,
			}),
		};
		const config = createTestConfig();

		// Create the server — if startedAt is set here, uptime will include this gap
		const server = createGatewayServer(config, deps);

		// Wait long enough that floor(gap/1000) >= 2 seconds
		await new Promise((r) => setTimeout(r, 2100));

		const httpServer = await server.start();

		// Request health/detailed immediately after start
		const res = await makeRequest(httpServer, {
			method: 'GET',
			path: '/health/detailed',
			headers: {
				authorization: 'Bearer test-auth-token-12345',
			},
		});

		expect(res.status).toBe(200);
		const parsed = JSON.parse(res.body);
		// If startedAt is set in start(), uptime should be 0.
		// If startedAt was set in createGatewayServer(), uptime would be >= 2.
		expect(parsed.uptime).toBeLessThan(2);

		await server.stop();
	});
});
