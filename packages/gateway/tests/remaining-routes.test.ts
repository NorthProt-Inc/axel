import * as http from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGatewayServer } from '../src/server.js';
import type { GatewayConfig, GatewayDeps } from '../src/types.js';

/**
 * INTEG-004: Remaining gateway route tests.
 *
 * Routes under test:
 * - POST /api/v1/memory/search
 * - GET  /api/v1/memory/stats
 * - GET  /api/v1/session
 * - POST /api/v1/session/end
 * - GET  /api/v1/tools
 * - POST /api/v1/tools/execute
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

// ─── POST /api/v1/memory/search ───

describe('INTEG-004: POST /api/v1/memory/search', () => {
	let server: ReturnType<typeof createGatewayServer>;
	let httpServer: http.Server;
	let searchMemory: ReturnType<typeof vi.fn>;

	beforeEach(async () => {
		searchMemory = vi.fn().mockResolvedValue({
			results: [
				{
					content: 'User prefers dark mode',
					memoryType: 'preference',
					importance: 0.8,
					score: 0.92,
					createdAt: '2026-01-15T10:00:00Z',
				},
			],
			totalMatches: 1,
		});

		const config = createTestConfig();
		const deps: GatewayDeps = {
			healthCheck: vi
				.fn()
				.mockResolvedValue({ state: 'healthy', checks: {}, timestamp: new Date(), uptime: 100 }),
			handleMessage: vi.fn().mockResolvedValue({
				content: '',
				sessionId: '',
				channelSwitched: false,
				usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
			}),
			searchMemory,
		};
		server = createGatewayServer(config, deps);
		httpServer = await server.start();
	});

	afterEach(async () => {
		await server.stop();
	});

	it('returns search results from searchMemory dep', async () => {
		const res = await makeRequest(httpServer, {
			method: 'POST',
			path: '/api/v1/memory/search',
			headers: authHeaders,
			body: JSON.stringify({ query: 'dark mode preference' }),
		});

		expect(res.status).toBe(200);
		const body = JSON.parse(res.body);
		expect(body.results).toHaveLength(1);
		expect(body.results[0].content).toBe('User prefers dark mode');
		expect(body.totalMatches).toBe(1);
	});

	it('calls searchMemory with query parameters', async () => {
		await makeRequest(httpServer, {
			method: 'POST',
			path: '/api/v1/memory/search',
			headers: authHeaders,
			body: JSON.stringify({ query: 'test query', limit: 5, memoryTypes: ['fact'] }),
		});

		expect(searchMemory).toHaveBeenCalledTimes(1);
		expect(searchMemory).toHaveBeenCalledWith(
			expect.objectContaining({
				query: 'test query',
				limit: 5,
				memoryTypes: ['fact'],
			}),
		);
	});

	it('rejects missing query field with 400', async () => {
		const res = await makeRequest(httpServer, {
			method: 'POST',
			path: '/api/v1/memory/search',
			headers: authHeaders,
			body: JSON.stringify({ limit: 5 }),
		});

		expect(res.status).toBe(400);
	});

	it('requires authentication', async () => {
		const res = await makeRequest(httpServer, {
			method: 'POST',
			path: '/api/v1/memory/search',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ query: 'test' }),
		});

		expect(res.status).toBe(401);
	});

	it('returns 503 when searchMemory dep is not configured', async () => {
		await server.stop();

		const config = createTestConfig();
		const deps: GatewayDeps = {
			healthCheck: vi
				.fn()
				.mockResolvedValue({ state: 'healthy', checks: {}, timestamp: new Date(), uptime: 100 }),
		};
		server = createGatewayServer(config, deps);
		httpServer = await server.start();

		const res = await makeRequest(httpServer, {
			method: 'POST',
			path: '/api/v1/memory/search',
			headers: authHeaders,
			body: JSON.stringify({ query: 'test' }),
		});

		expect(res.status).toBe(503);
	});
});

// ─── GET /api/v1/memory/stats ───

describe('INTEG-004: GET /api/v1/memory/stats', () => {
	let server: ReturnType<typeof createGatewayServer>;
	let httpServer: http.Server;
	let getMemoryStats: ReturnType<typeof vi.fn>;

	beforeEach(async () => {
		getMemoryStats = vi.fn().mockResolvedValue({
			totalMemories: 42,
			byType: { fact: 10, preference: 8, insight: 12, conversation: 12 },
			avgImportance: 0.65,
		});

		const config = createTestConfig();
		const deps: GatewayDeps = {
			healthCheck: vi
				.fn()
				.mockResolvedValue({ state: 'healthy', checks: {}, timestamp: new Date(), uptime: 100 }),
			getMemoryStats,
		};
		server = createGatewayServer(config, deps);
		httpServer = await server.start();
	});

	afterEach(async () => {
		await server.stop();
	});

	it('returns memory statistics', async () => {
		const res = await makeRequest(httpServer, {
			path: '/api/v1/memory/stats',
			headers: authHeaders,
		});

		expect(res.status).toBe(200);
		const body = JSON.parse(res.body);
		expect(body.totalMemories).toBe(42);
		expect(body.byType).toBeDefined();
	});

	it('requires authentication', async () => {
		const res = await makeRequest(httpServer, {
			path: '/api/v1/memory/stats',
		});

		expect(res.status).toBe(401);
	});

	it('returns 503 when getMemoryStats dep is not configured', async () => {
		await server.stop();

		const config = createTestConfig();
		const deps: GatewayDeps = {
			healthCheck: vi
				.fn()
				.mockResolvedValue({ state: 'healthy', checks: {}, timestamp: new Date(), uptime: 100 }),
		};
		server = createGatewayServer(config, deps);
		httpServer = await server.start();

		const res = await makeRequest(httpServer, {
			path: '/api/v1/memory/stats',
			headers: authHeaders,
		});

		expect(res.status).toBe(503);
	});
});

// ─── GET /api/v1/session ───

describe('INTEG-004: GET /api/v1/session', () => {
	let server: ReturnType<typeof createGatewayServer>;
	let httpServer: http.Server;
	let getSession: ReturnType<typeof vi.fn>;

	beforeEach(async () => {
		getSession = vi.fn().mockResolvedValue({
			sessionId: 'sess-active-1',
			userId: 'gateway-user',
			activeChannelId: 'webchat',
			channelHistory: ['webchat'],
			startedAt: '2026-02-08T10:00:00Z',
			lastActivityAt: '2026-02-08T10:05:00Z',
			turnCount: 3,
		});

		const config = createTestConfig();
		const deps: GatewayDeps = {
			healthCheck: vi
				.fn()
				.mockResolvedValue({ state: 'healthy', checks: {}, timestamp: new Date(), uptime: 100 }),
			getSession,
		};
		server = createGatewayServer(config, deps);
		httpServer = await server.start();
	});

	afterEach(async () => {
		await server.stop();
	});

	it('returns active session info', async () => {
		const res = await makeRequest(httpServer, {
			path: '/api/v1/session',
			headers: authHeaders,
		});

		expect(res.status).toBe(200);
		const body = JSON.parse(res.body);
		expect(body.active).toBe(true);
		expect(body.session.sessionId).toBe('sess-active-1');
	});

	it('returns null session when no active session', async () => {
		getSession.mockResolvedValueOnce(null);

		const res = await makeRequest(httpServer, {
			path: '/api/v1/session',
			headers: authHeaders,
		});

		expect(res.status).toBe(200);
		const body = JSON.parse(res.body);
		expect(body.active).toBe(false);
		expect(body.session).toBeNull();
	});

	it('requires authentication', async () => {
		const res = await makeRequest(httpServer, {
			path: '/api/v1/session',
		});

		expect(res.status).toBe(401);
	});

	it('returns 503 when getSession dep is not configured', async () => {
		await server.stop();

		const config = createTestConfig();
		const deps: GatewayDeps = {
			healthCheck: vi
				.fn()
				.mockResolvedValue({ state: 'healthy', checks: {}, timestamp: new Date(), uptime: 100 }),
		};
		server = createGatewayServer(config, deps);
		httpServer = await server.start();

		const res = await makeRequest(httpServer, {
			path: '/api/v1/session',
			headers: authHeaders,
		});

		expect(res.status).toBe(503);
	});
});

// ─── POST /api/v1/session/end ───

describe('INTEG-004: POST /api/v1/session/end', () => {
	let server: ReturnType<typeof createGatewayServer>;
	let httpServer: http.Server;
	let getSession: ReturnType<typeof vi.fn>;
	let endSession: ReturnType<typeof vi.fn>;

	beforeEach(async () => {
		getSession = vi.fn().mockResolvedValue({
			sessionId: 'sess-end-1',
			userId: 'gateway-user',
			activeChannelId: 'webchat',
			channelHistory: ['webchat'],
			startedAt: '2026-02-08T10:00:00Z',
			lastActivityAt: '2026-02-08T10:05:00Z',
			turnCount: 5,
		});

		endSession = vi.fn().mockResolvedValue({
			sessionId: 'sess-end-1',
			summary: 'Discussed dark mode preferences',
			keyTopics: ['dark mode', 'UI'],
			emotionalTone: 'neutral',
			turnCount: 5,
			channelHistory: ['webchat'],
			startedAt: '2026-02-08T10:00:00Z',
			endedAt: '2026-02-08T10:05:30Z',
		});

		const config = createTestConfig();
		const deps: GatewayDeps = {
			healthCheck: vi
				.fn()
				.mockResolvedValue({ state: 'healthy', checks: {}, timestamp: new Date(), uptime: 100 }),
			getSession,
			endSession,
		};
		server = createGatewayServer(config, deps);
		httpServer = await server.start();
	});

	afterEach(async () => {
		await server.stop();
	});

	it('ends active session and returns summary', async () => {
		const res = await makeRequest(httpServer, {
			method: 'POST',
			path: '/api/v1/session/end',
			headers: authHeaders,
		});

		expect(res.status).toBe(200);
		const body = JSON.parse(res.body);
		expect(body.sessionId).toBe('sess-end-1');
		expect(body.summary).toBe('Discussed dark mode preferences');
		expect(body.keyTopics).toContain('dark mode');
	});

	it('calls endSession with session id from getSession', async () => {
		await makeRequest(httpServer, {
			method: 'POST',
			path: '/api/v1/session/end',
			headers: authHeaders,
		});

		expect(getSession).toHaveBeenCalledTimes(1);
		expect(endSession).toHaveBeenCalledWith('sess-end-1');
	});

	it('returns 404 when no active session', async () => {
		getSession.mockResolvedValueOnce(null);

		const res = await makeRequest(httpServer, {
			method: 'POST',
			path: '/api/v1/session/end',
			headers: authHeaders,
		});

		expect(res.status).toBe(404);
	});

	it('requires authentication', async () => {
		const res = await makeRequest(httpServer, {
			method: 'POST',
			path: '/api/v1/session/end',
		});

		expect(res.status).toBe(401);
	});
});

// ─── GET /api/v1/tools ───

describe('INTEG-004: GET /api/v1/tools', () => {
	let server: ReturnType<typeof createGatewayServer>;
	let httpServer: http.Server;
	let listTools: ReturnType<typeof vi.fn>;

	beforeEach(async () => {
		listTools = vi.fn().mockReturnValue([
			{
				name: 'memory_search',
				description: 'Search memory',
				category: 'memory',
				inputSchema: { type: 'object' },
				requiresApproval: false,
			},
			{
				name: 'file_write',
				description: 'Write a file',
				category: 'file',
				inputSchema: { type: 'object' },
				requiresApproval: true,
			},
		]);

		const config = createTestConfig();
		const deps: GatewayDeps = {
			healthCheck: vi
				.fn()
				.mockResolvedValue({ state: 'healthy', checks: {}, timestamp: new Date(), uptime: 100 }),
			listTools,
		};
		server = createGatewayServer(config, deps);
		httpServer = await server.start();
	});

	afterEach(async () => {
		await server.stop();
	});

	it('returns list of available tools', async () => {
		const res = await makeRequest(httpServer, {
			path: '/api/v1/tools',
			headers: authHeaders,
		});

		expect(res.status).toBe(200);
		const body = JSON.parse(res.body);
		expect(body.tools).toHaveLength(2);
		expect(body.tools[0].name).toBe('memory_search');
		expect(body.tools[1].requiresApproval).toBe(true);
	});

	it('requires authentication', async () => {
		const res = await makeRequest(httpServer, {
			path: '/api/v1/tools',
		});

		expect(res.status).toBe(401);
	});

	it('returns 503 when listTools dep is not configured', async () => {
		await server.stop();

		const config = createTestConfig();
		const deps: GatewayDeps = {
			healthCheck: vi
				.fn()
				.mockResolvedValue({ state: 'healthy', checks: {}, timestamp: new Date(), uptime: 100 }),
		};
		server = createGatewayServer(config, deps);
		httpServer = await server.start();

		const res = await makeRequest(httpServer, {
			path: '/api/v1/tools',
			headers: authHeaders,
		});

		expect(res.status).toBe(503);
	});
});

// ─── POST /api/v1/tools/execute ───

describe('INTEG-004: POST /api/v1/tools/execute', () => {
	let server: ReturnType<typeof createGatewayServer>;
	let httpServer: http.Server;
	let executeTool: ReturnType<typeof vi.fn>;

	beforeEach(async () => {
		executeTool = vi.fn().mockResolvedValue({
			success: true,
			content: { found: true, data: 'result' },
			durationMs: 42,
		});

		const config = createTestConfig();
		const deps: GatewayDeps = {
			healthCheck: vi
				.fn()
				.mockResolvedValue({ state: 'healthy', checks: {}, timestamp: new Date(), uptime: 100 }),
			executeTool,
		};
		server = createGatewayServer(config, deps);
		httpServer = await server.start();
	});

	afterEach(async () => {
		await server.stop();
	});

	it('executes tool and returns result', async () => {
		const res = await makeRequest(httpServer, {
			method: 'POST',
			path: '/api/v1/tools/execute',
			headers: authHeaders,
			body: JSON.stringify({ name: 'memory_search', args: { query: 'test' } }),
		});

		expect(res.status).toBe(200);
		const body = JSON.parse(res.body);
		expect(body.name).toBe('memory_search');
		expect(body.success).toBe(true);
		expect(body.result).toBeDefined();
		expect(body.executionMs).toBe(42);
	});

	it('calls executeTool with name and args', async () => {
		await makeRequest(httpServer, {
			method: 'POST',
			path: '/api/v1/tools/execute',
			headers: authHeaders,
			body: JSON.stringify({ name: 'file_write', args: { path: '/tmp/test' } }),
		});

		expect(executeTool).toHaveBeenCalledWith(
			expect.objectContaining({
				name: 'file_write',
				args: { path: '/tmp/test' },
			}),
		);
	});

	it('rejects missing name with 400', async () => {
		const res = await makeRequest(httpServer, {
			method: 'POST',
			path: '/api/v1/tools/execute',
			headers: authHeaders,
			body: JSON.stringify({ args: { query: 'test' } }),
		});

		expect(res.status).toBe(400);
	});

	it('rejects missing args with 400', async () => {
		const res = await makeRequest(httpServer, {
			method: 'POST',
			path: '/api/v1/tools/execute',
			headers: authHeaders,
			body: JSON.stringify({ name: 'memory_search' }),
		});

		expect(res.status).toBe(400);
	});

	it('requires authentication', async () => {
		const res = await makeRequest(httpServer, {
			method: 'POST',
			path: '/api/v1/tools/execute',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ name: 'test', args: {} }),
		});

		expect(res.status).toBe(401);
	});

	it('returns 503 when executeTool dep is not configured', async () => {
		await server.stop();

		const config = createTestConfig();
		const deps: GatewayDeps = {
			healthCheck: vi
				.fn()
				.mockResolvedValue({ state: 'healthy', checks: {}, timestamp: new Date(), uptime: 100 }),
		};
		server = createGatewayServer(config, deps);
		httpServer = await server.start();

		const res = await makeRequest(httpServer, {
			method: 'POST',
			path: '/api/v1/tools/execute',
			headers: authHeaders,
			body: JSON.stringify({ name: 'test', args: {} }),
		});

		expect(res.status).toBe(503);
	});

	it('returns error details when tool execution fails', async () => {
		executeTool.mockResolvedValueOnce({
			success: false,
			content: null,
			error: 'Tool not found',
			durationMs: 1,
		});

		const res = await makeRequest(httpServer, {
			method: 'POST',
			path: '/api/v1/tools/execute',
			headers: authHeaders,
			body: JSON.stringify({ name: 'nonexistent', args: {} }),
		});

		expect(res.status).toBe(200);
		const body = JSON.parse(res.body);
		expect(body.success).toBe(false);
		expect(body.error).toBe('Tool not found');
	});
});
