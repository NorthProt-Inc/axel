import * as http from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGatewayServer } from '../src/server.js';
import type { GatewayConfig, GatewayDeps } from '../src/types.js';

/**
 * HARDEN-005: Proxy-aware rate limiting (AUD-087).
 *
 * When trustedProxies is configured, parse X-Forwarded-For header
 * to extract the real client IP instead of req.socket.remoteAddress.
 */

function createTestConfig(overrides?: Partial<GatewayConfig>): GatewayConfig {
	return {
		port: 0,
		host: '127.0.0.1',
		authToken: 'test-auth-token-12345',
		env: 'development',
		corsOrigins: ['http://localhost:3000'],
		rateLimitPerMinute: 3,
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
			content: 'ok',
			sessionId: 'sess',
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

describe('HARDEN-005: Proxy-aware rate limiting (AUD-087)', () => {
	let server: ReturnType<typeof createGatewayServer>;
	let httpServer: http.Server;

	afterEach(async () => {
		await server.stop();
	});

	it('uses req.socket.remoteAddress when trustedProxies is not configured', async () => {
		const config = createTestConfig({ rateLimitPerMinute: 3 });
		server = createGatewayServer(config, createMockDeps());
		httpServer = await server.start();

		// All requests come from 127.0.0.1 (same socket), so all share one bucket
		const authHeader = { authorization: 'Bearer test-auth-token-12345' };
		for (let i = 0; i < 3; i++) {
			const res = await makeRequest(httpServer, {
				method: 'POST',
				path: '/api/v1/chat',
				headers: { ...authHeader, 'content-type': 'application/json' },
				body: JSON.stringify({ content: 'hello', channelId: 'test' }),
			});
			expect(res.status).toBe(200);
		}

		// 4th request should be rate limited
		const res = await makeRequest(httpServer, {
			method: 'POST',
			path: '/api/v1/chat',
			headers: { ...authHeader, 'content-type': 'application/json' },
			body: JSON.stringify({ content: 'hello', channelId: 'test' }),
		});
		expect(res.status).toBe(429);
	});

	it('ignores X-Forwarded-For when trustedProxies is not configured', async () => {
		const config = createTestConfig({ rateLimitPerMinute: 3 });
		server = createGatewayServer(config, createMockDeps());
		httpServer = await server.start();

		const authHeader = { authorization: 'Bearer test-auth-token-12345' };
		// Even with different X-Forwarded-For, all share the same socket IP bucket
		for (let i = 0; i < 3; i++) {
			await makeRequest(httpServer, {
				method: 'POST',
				path: '/api/v1/chat',
				headers: {
					...authHeader,
					'content-type': 'application/json',
					'x-forwarded-for': `10.0.0.${i + 1}`,
				},
				body: JSON.stringify({ content: 'hello', channelId: 'test' }),
			});
		}

		// 4th request - different XFF but still rate limited (same socket IP)
		const res = await makeRequest(httpServer, {
			method: 'POST',
			path: '/api/v1/chat',
			headers: {
				...authHeader,
				'content-type': 'application/json',
				'x-forwarded-for': '10.0.0.99',
			},
			body: JSON.stringify({ content: 'hello', channelId: 'test' }),
		});
		expect(res.status).toBe(429);
	});

	it('uses X-Forwarded-For client IP when trustedProxies is configured', async () => {
		const config = createTestConfig({
			rateLimitPerMinute: 2,
			trustedProxies: ['127.0.0.1'],
		});
		server = createGatewayServer(config, createMockDeps());
		httpServer = await server.start();

		const authHeader = { authorization: 'Bearer test-auth-token-12345' };

		// Two requests from client 10.0.0.1 - should fill that bucket
		for (let i = 0; i < 2; i++) {
			const res = await makeRequest(httpServer, {
				method: 'POST',
				path: '/api/v1/chat',
				headers: {
					...authHeader,
					'content-type': 'application/json',
					'x-forwarded-for': '10.0.0.1',
				},
				body: JSON.stringify({ content: 'hello', channelId: 'test' }),
			});
			expect(res.status).toBe(200);
		}

		// 3rd from same client IP → rate limited
		const limited = await makeRequest(httpServer, {
			method: 'POST',
			path: '/api/v1/chat',
			headers: {
				...authHeader,
				'content-type': 'application/json',
				'x-forwarded-for': '10.0.0.1',
			},
			body: JSON.stringify({ content: 'hello', channelId: 'test' }),
		});
		expect(limited.status).toBe(429);

		// But a different client IP should still be allowed
		const differentClient = await makeRequest(httpServer, {
			method: 'POST',
			path: '/api/v1/chat',
			headers: {
				...authHeader,
				'content-type': 'application/json',
				'x-forwarded-for': '10.0.0.2',
			},
			body: JSON.stringify({ content: 'hello', channelId: 'test' }),
		});
		expect(differentClient.status).toBe(200);
	});

	it('handles multi-hop X-Forwarded-For by taking leftmost non-trusted IP', async () => {
		const config = createTestConfig({
			rateLimitPerMinute: 2,
			trustedProxies: ['127.0.0.1', '10.0.0.254'],
		});
		server = createGatewayServer(config, createMockDeps());
		httpServer = await server.start();

		const authHeader = { authorization: 'Bearer test-auth-token-12345' };

		// X-Forwarded-For: <client>, <proxy1>, <proxy2>
		// Trusted: 127.0.0.1 (socket), 10.0.0.254 (hop)
		// Real client: 192.168.1.1
		for (let i = 0; i < 2; i++) {
			const res = await makeRequest(httpServer, {
				method: 'POST',
				path: '/api/v1/chat',
				headers: {
					...authHeader,
					'content-type': 'application/json',
					'x-forwarded-for': '192.168.1.1, 10.0.0.254',
				},
				body: JSON.stringify({ content: 'hello', channelId: 'test' }),
			});
			expect(res.status).toBe(200);
		}

		// 3rd from same real client → rate limited
		const limited = await makeRequest(httpServer, {
			method: 'POST',
			path: '/api/v1/chat',
			headers: {
				...authHeader,
				'content-type': 'application/json',
				'x-forwarded-for': '192.168.1.1, 10.0.0.254',
			},
			body: JSON.stringify({ content: 'hello', channelId: 'test' }),
		});
		expect(limited.status).toBe(429);
	});

	it('falls back to socket IP when X-Forwarded-For is absent even with trustedProxies', async () => {
		const config = createTestConfig({
			rateLimitPerMinute: 2,
			trustedProxies: ['127.0.0.1'],
		});
		server = createGatewayServer(config, createMockDeps());
		httpServer = await server.start();

		const authHeader = { authorization: 'Bearer test-auth-token-12345' };

		// No XFF header — should fall back to socket IP
		for (let i = 0; i < 2; i++) {
			const res = await makeRequest(httpServer, {
				method: 'POST',
				path: '/api/v1/chat',
				headers: { ...authHeader, 'content-type': 'application/json' },
				body: JSON.stringify({ content: 'hello', channelId: 'test' }),
			});
			expect(res.status).toBe(200);
		}

		const limited = await makeRequest(httpServer, {
			method: 'POST',
			path: '/api/v1/chat',
			headers: { ...authHeader, 'content-type': 'application/json' },
			body: JSON.stringify({ content: 'hello', channelId: 'test' }),
		});
		expect(limited.status).toBe(429);
	});
});
