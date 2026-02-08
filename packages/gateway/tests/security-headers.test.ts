import * as http from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGatewayServer } from '../src/server.js';
import type { GatewayConfig, GatewayDeps } from '../src/types.js';

/**
 * FIX-AUDIT-E-004: AUD-086 security headers + AUD-090 unsafe cast.
 *
 * AUD-086: All HTTP responses must include:
 *   - X-Content-Type-Options: nosniff
 *   - X-Frame-Options: DENY
 *
 * AUD-090: handleSessionEnd unsafe cast in route-handlers.ts
 *   - Replace `(session as Record<string, unknown>).sessionId as string`
 *     with proper type narrowing.
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

const authHeaders = {
	authorization: 'Bearer test-auth-token-12345',
	'content-type': 'application/json',
};

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

// ─── AUD-086: Security Headers ───

describe('FIX-AUDIT-E-004: AUD-086 security headers', () => {
	let server: ReturnType<typeof createGatewayServer>;
	let httpServer: http.Server;

	beforeEach(async () => {
		const config = createTestConfig();
		const deps: GatewayDeps = {
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
		server = createGatewayServer(config, deps);
		httpServer = await server.start();
	});

	afterEach(async () => {
		await server.stop();
	});

	it('includes X-Content-Type-Options: nosniff on JSON responses', async () => {
		const res = await makeRequest(httpServer, { path: '/health' });

		expect(res.status).toBe(200);
		expect(res.headers['x-content-type-options']).toBe('nosniff');
	});

	it('includes X-Frame-Options: DENY on JSON responses', async () => {
		const res = await makeRequest(httpServer, { path: '/health' });

		expect(res.status).toBe(200);
		expect(res.headers['x-frame-options']).toBe('DENY');
	});

	it('includes security headers on error responses', async () => {
		const res = await makeRequest(httpServer, { path: '/nonexistent' });

		expect(res.status).toBe(404);
		expect(res.headers['x-content-type-options']).toBe('nosniff');
		expect(res.headers['x-frame-options']).toBe('DENY');
	});

	it('includes security headers on authenticated endpoints', async () => {
		const res = await makeRequest(httpServer, {
			method: 'POST',
			path: '/api/v1/chat',
			headers: authHeaders,
			body: JSON.stringify({ content: 'hello', channelId: 'webchat' }),
		});

		expect(res.status).toBe(200);
		expect(res.headers['x-content-type-options']).toBe('nosniff');
		expect(res.headers['x-frame-options']).toBe('DENY');
	});

	it('includes security headers on 401 responses', async () => {
		const res = await makeRequest(httpServer, {
			method: 'POST',
			path: '/api/v1/chat',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ content: 'hello', channelId: 'webchat' }),
		});

		expect(res.status).toBe(401);
		expect(res.headers['x-content-type-options']).toBe('nosniff');
		expect(res.headers['x-frame-options']).toBe('DENY');
	});
});

// ─── AUD-090: handleSessionEnd unsafe cast ───

describe('FIX-AUDIT-E-004: AUD-090 handleSessionEnd type safety', () => {
	let server: ReturnType<typeof createGatewayServer>;
	let httpServer: http.Server;
	let getSession: ReturnType<typeof vi.fn>;
	let endSession: ReturnType<typeof vi.fn>;

	beforeEach(async () => {
		getSession = vi.fn().mockResolvedValue({
			sessionId: 'sess-typed-1',
			userId: 'gateway-user',
			activeChannelId: 'webchat',
		});
		endSession = vi.fn().mockResolvedValue({
			sessionId: 'sess-typed-1',
			summary: 'Test summary',
		});

		const config = createTestConfig();
		const deps: GatewayDeps = {
			healthCheck: vi.fn().mockResolvedValue({
				state: 'healthy',
				checks: {},
				timestamp: new Date(),
				uptime: 100,
			}),
			getSession,
			endSession,
		};
		server = createGatewayServer(config, deps);
		httpServer = await server.start();
	});

	afterEach(async () => {
		await server.stop();
	});

	it('extracts sessionId safely from session object', async () => {
		const res = await makeRequest(httpServer, {
			method: 'POST',
			path: '/api/v1/session/end',
			headers: authHeaders,
		});

		expect(res.status).toBe(200);
		expect(endSession).toHaveBeenCalledWith('sess-typed-1');
	});

	it('returns 500 when session has no sessionId field', async () => {
		getSession.mockResolvedValueOnce({ userId: 'gateway-user', activeChannelId: 'webchat' });

		const res = await makeRequest(httpServer, {
			method: 'POST',
			path: '/api/v1/session/end',
			headers: authHeaders,
		});

		expect(res.status).toBe(500);
	});

	it('returns 500 when session has non-string sessionId', async () => {
		getSession.mockResolvedValueOnce({ sessionId: 12345, userId: 'gateway-user' });

		const res = await makeRequest(httpServer, {
			method: 'POST',
			path: '/api/v1/session/end',
			headers: authHeaders,
		});

		expect(res.status).toBe(500);
	});
});
