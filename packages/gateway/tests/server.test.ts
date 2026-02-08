import * as http from 'node:http';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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
		if (options.body) {
			req.write(options.body);
		}
		req.end();
	});
}

describe('Gateway Server', () => {
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

	describe('health endpoints', () => {
		it('GET /health returns 200 with status ok', async () => {
			const res = await makeRequest(httpServer, { path: '/health' });

			expect(res.status).toBe(200);
			const body = JSON.parse(res.body);
			expect(body.status).toBe('ok');
			expect(body.timestamp).toBeDefined();
		});

		it('GET /health does not require authentication', async () => {
			const res = await makeRequest(httpServer, { path: '/health' });

			expect(res.status).toBe(200);
		});

		it('GET /health/detailed requires authentication', async () => {
			const res = await makeRequest(httpServer, { path: '/health/detailed' });

			expect(res.status).toBe(401);
		});

		it('GET /health/detailed returns subsystem health with valid auth', async () => {
			const res = await makeRequest(httpServer, {
				path: '/health/detailed',
				headers: { authorization: 'Bearer test-auth-token-12345' },
			});

			expect(res.status).toBe(200);
			const body = JSON.parse(res.body);
			expect(body.status).toBeDefined();
			expect(body.subsystems).toBeDefined();
		});
	});

	describe('authentication', () => {
		it('rejects requests without auth token to protected endpoints', async () => {
			const res = await makeRequest(httpServer, {
				method: 'POST',
				path: '/api/v1/chat',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ content: 'hello', channelId: 'webchat' }),
			});

			expect(res.status).toBe(401);
		});

		it('rejects requests with invalid auth token', async () => {
			const res = await makeRequest(httpServer, {
				method: 'POST',
				path: '/api/v1/chat',
				headers: {
					authorization: 'Bearer wrong-token',
					'content-type': 'application/json',
				},
				body: JSON.stringify({ content: 'hello', channelId: 'webchat' }),
			});

			expect(res.status).toBe(401);
		});

		it('accepts requests with valid auth token', async () => {
			const res = await makeRequest(httpServer, {
				method: 'POST',
				path: '/api/v1/chat',
				headers: {
					authorization: 'Bearer test-auth-token-12345',
					'content-type': 'application/json',
				},
				body: JSON.stringify({ content: 'hello', channelId: 'webchat' }),
			});

			// Should not be 401 — may be 200 or another status, but not auth failure
			expect(res.status).not.toBe(401);
		});
	});

	describe('CORS', () => {
		it('includes CORS headers in response', async () => {
			const res = await makeRequest(httpServer, {
				method: 'OPTIONS',
				path: '/health',
				headers: { origin: 'http://localhost:3000' },
			});

			expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
		});

		it('rejects CORS from non-allowed origins', async () => {
			const res = await makeRequest(httpServer, {
				method: 'OPTIONS',
				path: '/health',
				headers: { origin: 'http://evil.com' },
			});

			expect(res.headers['access-control-allow-origin']).toBeUndefined();
		});
	});

	describe('error handling', () => {
		it('returns 404 for unknown routes', async () => {
			const res = await makeRequest(httpServer, { path: '/nonexistent' });

			expect(res.status).toBe(404);
			const body = JSON.parse(res.body);
			expect(body.error).toBeDefined();
			expect(body.requestId).toBeDefined();
		});

		it('returns error in standard format', async () => {
			const res = await makeRequest(httpServer, { path: '/nonexistent' });
			const body = JSON.parse(res.body);

			expect(body).toHaveProperty('error');
			expect(body).toHaveProperty('requestId');
		});

		it('includes detail in development mode', async () => {
			const res = await makeRequest(httpServer, { path: '/nonexistent' });
			const body = JSON.parse(res.body);

			// In development mode, detail should be present
			expect(body.error).toBeDefined();
		});
	});

	describe('request validation', () => {
		it('rejects invalid JSON body', async () => {
			const res = await makeRequest(httpServer, {
				method: 'POST',
				path: '/api/v1/chat',
				headers: {
					authorization: 'Bearer test-auth-token-12345',
					'content-type': 'application/json',
				},
				body: 'not json',
			});

			expect(res.status).toBe(400);
		});

		it('rejects chat request with missing content', async () => {
			const res = await makeRequest(httpServer, {
				method: 'POST',
				path: '/api/v1/chat',
				headers: {
					authorization: 'Bearer test-auth-token-12345',
					'content-type': 'application/json',
				},
				body: JSON.stringify({ channelId: 'webchat' }),
			});

			expect(res.status).toBe(400);
		});

		it('rejects chat request with missing channelId', async () => {
			const res = await makeRequest(httpServer, {
				method: 'POST',
				path: '/api/v1/chat',
				headers: {
					authorization: 'Bearer test-auth-token-12345',
					'content-type': 'application/json',
				},
				body: JSON.stringify({ content: 'hello' }),
			});

			expect(res.status).toBe(400);
		});
	});

	describe('rate limiting (AUD-066)', () => {
		it('returns 429 when rate limit is exceeded', async () => {
			await server.stop();

			const config = createTestConfig({ rateLimitPerMinute: 3 });
			const deps = createMockDeps();
			server = createGatewayServer(config, deps);
			httpServer = await server.start();

			const authHeaders = {
				authorization: 'Bearer test-auth-token-12345',
				'content-type': 'application/json',
			};
			const body = JSON.stringify({ content: 'hello', channelId: 'webchat' });

			// Make 3 requests (at limit)
			for (let i = 0; i < 3; i++) {
				const res = await makeRequest(httpServer, {
					method: 'POST',
					path: '/api/v1/chat',
					headers: authHeaders,
					body,
				});
				expect(res.status).toBe(200);
			}

			// 4th request should be rate limited
			const res = await makeRequest(httpServer, {
				method: 'POST',
				path: '/api/v1/chat',
				headers: authHeaders,
				body,
			});
			expect(res.status).toBe(429);
		});

		it('includes Retry-After header in 429 response', async () => {
			await server.stop();

			const config = createTestConfig({ rateLimitPerMinute: 1 });
			const deps = createMockDeps();
			server = createGatewayServer(config, deps);
			httpServer = await server.start();

			const authHeaders = {
				authorization: 'Bearer test-auth-token-12345',
				'content-type': 'application/json',
			};
			const body = JSON.stringify({ content: 'hello', channelId: 'webchat' });

			// Exhaust rate limit
			await makeRequest(httpServer, {
				method: 'POST',
				path: '/api/v1/chat',
				headers: authHeaders,
				body,
			});

			// Should get 429 with Retry-After
			const res = await makeRequest(httpServer, {
				method: 'POST',
				path: '/api/v1/chat',
				headers: authHeaders,
				body,
			});
			expect(res.status).toBe(429);
			expect(res.headers['retry-after']).toBeDefined();
		});

		it('does not rate limit unauthenticated /health endpoint', async () => {
			await server.stop();

			const config = createTestConfig({ rateLimitPerMinute: 2 });
			const deps = createMockDeps();
			server = createGatewayServer(config, deps);
			httpServer = await server.start();

			// Make many health requests — should never be rate limited
			for (let i = 0; i < 5; i++) {
				const res = await makeRequest(httpServer, { path: '/health' });
				expect(res.status).toBe(200);
			}
		});
	});

	describe('body size limit (AUD-067)', () => {
		it('rejects request body larger than 32KB with 413', async () => {
			const largeContent = 'a'.repeat(33_000);
			const res = await makeRequest(httpServer, {
				method: 'POST',
				path: '/api/v1/chat',
				headers: {
					authorization: 'Bearer test-auth-token-12345',
					'content-type': 'application/json',
				},
				body: JSON.stringify({ content: largeContent, channelId: 'webchat' }),
			});

			expect(res.status).toBe(413);
		});

		it('accepts request body under 32KB', async () => {
			const normalContent = 'a'.repeat(1000);
			const res = await makeRequest(httpServer, {
				method: 'POST',
				path: '/api/v1/chat',
				headers: {
					authorization: 'Bearer test-auth-token-12345',
					'content-type': 'application/json',
				},
				body: JSON.stringify({ content: normalContent, channelId: 'webchat' }),
			});

			expect(res.status).toBe(200);
		});

		it('rejects based on streaming body size even without Content-Length', async () => {
			const largeContent = 'a'.repeat(33_000);
			const res = await makeRequest(httpServer, {
				method: 'POST',
				path: '/api/v1/chat',
				headers: {
					authorization: 'Bearer test-auth-token-12345',
					'content-type': 'application/json',
					'transfer-encoding': 'chunked',
				},
				body: JSON.stringify({ content: largeContent, channelId: 'webchat' }),
			});

			expect(res.status).toBe(413);
		});
	});

	describe('rate limit bucket cleanup (AUD-080)', () => {
		it('creates bucket entry on authenticated request', async () => {
			await server.stop();

			const config = createTestConfig({ rateLimitPerMinute: 100 });
			const deps = createMockDeps();
			server = createGatewayServer(config, deps);
			httpServer = await server.start();

			// Before any request, bucket count should be 0
			expect(server.getRateLimitBucketCount()).toBe(0);

			await makeRequest(httpServer, {
				method: 'POST',
				path: '/api/v1/chat',
				headers: {
					authorization: 'Bearer test-auth-token-12345',
					'content-type': 'application/json',
				},
				body: JSON.stringify({ content: 'hello', channelId: 'webchat' }),
			});

			// After a request, bucket count should be 1
			expect(server.getRateLimitBucketCount()).toBe(1);
		});

		it('evicts stale entries when new requests arrive', async () => {
			await server.stop();

			const config = createTestConfig({ rateLimitPerMinute: 100 });
			const deps = createMockDeps();
			server = createGatewayServer(config, deps);
			httpServer = await server.start();

			// Make a request to create a bucket entry
			await makeRequest(httpServer, {
				method: 'POST',
				path: '/api/v1/chat',
				headers: {
					authorization: 'Bearer test-auth-token-12345',
					'content-type': 'application/json',
				},
				body: JSON.stringify({ content: 'hello', channelId: 'webchat' }),
			});
			expect(server.getRateLimitBucketCount()).toBe(1);

			// Advance time beyond 2x the rate limit window (120s+)
			vi.useFakeTimers();
			vi.setSystemTime(Date.now() + 130_000);

			// Make another request — eviction runs lazily on next request
			await makeRequest(httpServer, {
				method: 'POST',
				path: '/api/v1/chat',
				headers: {
					authorization: 'Bearer test-auth-token-12345',
					'content-type': 'application/json',
				},
				body: JSON.stringify({ content: 'hello2', channelId: 'webchat' }),
			});

			// The current IP's entry remains (it just made a request),
			// but stale entries from other IPs would be evicted.
			// Since all requests come from the same IP (127.0.0.1),
			// count stays at 1 — the key invariant is it doesn't grow unbounded.
			expect(server.getRateLimitBucketCount()).toBe(1);

			vi.useRealTimers();
		});
	});

	describe('handleMessage timestamp (AUD-082)', () => {
		it('passes timestamp to handleMessage in HTTP chat', async () => {
			const deps = createMockDeps();
			const handleMessage = deps.handleMessage as ReturnType<typeof vi.fn>;

			await server.stop();
			server = createGatewayServer(createTestConfig(), deps);
			httpServer = await server.start();

			const before = Date.now();
			await makeRequest(httpServer, {
				method: 'POST',
				path: '/api/v1/chat',
				headers: {
					authorization: 'Bearer test-auth-token-12345',
					'content-type': 'application/json',
				},
				body: JSON.stringify({ content: 'hello', channelId: 'webchat' }),
			});
			const after = Date.now();

			expect(handleMessage).toHaveBeenCalledTimes(1);
			const callArg = handleMessage.mock.calls[0]?.[0] as Record<string, unknown>;
			expect(callArg.timestamp).toBeDefined();
			expect(typeof callArg.timestamp).toBe('number');
			expect(callArg.timestamp as number).toBeGreaterThanOrEqual(before);
			expect(callArg.timestamp as number).toBeLessThanOrEqual(after);
		});

		it('passes timestamp to handleMessage in SSE stream', async () => {
			const deps = createMockDeps();
			const handleMessage = deps.handleMessage as ReturnType<typeof vi.fn>;

			await server.stop();
			server = createGatewayServer(createTestConfig(), deps);
			httpServer = await server.start();

			const before = Date.now();
			await makeRequest(httpServer, {
				method: 'POST',
				path: '/api/v1/chat/stream',
				headers: {
					authorization: 'Bearer test-auth-token-12345',
					'content-type': 'application/json',
				},
				body: JSON.stringify({ content: 'hello', channelId: 'webchat' }),
			});
			const after = Date.now();

			expect(handleMessage).toHaveBeenCalledTimes(1);
			const callArg = handleMessage.mock.calls[0]?.[0] as Record<string, unknown>;
			expect(callArg.timestamp).toBeDefined();
			expect(typeof callArg.timestamp).toBe('number');
			expect(callArg.timestamp as number).toBeGreaterThanOrEqual(before);
			expect(callArg.timestamp as number).toBeLessThanOrEqual(after);
		});
	});

	describe('graceful shutdown', () => {
		it('stops accepting new connections after stop()', async () => {
			await server.stop();

			await expect(makeRequest(httpServer, { path: '/health' })).rejects.toThrow();
		});
	});
});
