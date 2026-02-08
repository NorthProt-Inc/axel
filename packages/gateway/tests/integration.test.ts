import * as http from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WebSocket from 'ws';
import { createGatewayServer } from '../src/server.js';
import type { GatewayConfig, GatewayDeps } from '../src/server.js';

/**
 * INTEG-003: Gateway → Orchestrator integration tests.
 *
 * Verifies that:
 * 1. POST /api/v1/chat calls handleMessage and returns orchestrator response
 * 2. POST /api/v1/chat/stream streams ReActEvents as SSE
 * 3. WS /ws chat messages route through handleMessage
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

const authHeaders = {
	authorization: 'Bearer test-auth-token-12345',
	'content-type': 'application/json',
};

describe('INTEG-003: Gateway → Orchestrator Integration', () => {
	let server: ReturnType<typeof createGatewayServer>;
	let httpServer: http.Server;
	let handleMessage: ReturnType<typeof vi.fn>;

	beforeEach(async () => {
		handleMessage = vi.fn().mockResolvedValue({
			content: 'Hello from Axel!',
			sessionId: 'sess-123',
			channelSwitched: false,
			usage: { inputTokens: 10, outputTokens: 20, cacheReadTokens: 0, cacheCreationTokens: 0 },
		});

		const config = createTestConfig();
		const deps: GatewayDeps = {
			healthCheck: vi.fn().mockResolvedValue({
				state: 'healthy',
				checks: {},
				timestamp: new Date(),
				uptime: 100,
			}),
			handleMessage,
		};
		server = createGatewayServer(config, deps);
		httpServer = await server.start();
	});

	afterEach(async () => {
		await server.stop();
	});

	describe('POST /api/v1/chat', () => {
		it('calls handleMessage with inbound message data', async () => {
			const res = await makeRequest(httpServer, {
				method: 'POST',
				path: '/api/v1/chat',
				headers: authHeaders,
				body: JSON.stringify({ content: 'Hello Axel', channelId: 'webchat' }),
			});

			expect(res.status).toBe(200);
			expect(handleMessage).toHaveBeenCalledTimes(1);
			expect(handleMessage).toHaveBeenCalledWith(
				expect.objectContaining({
					content: 'Hello Axel',
					channelId: 'webchat',
				}),
			);
		});

		it('returns orchestrator response in body', async () => {
			const res = await makeRequest(httpServer, {
				method: 'POST',
				path: '/api/v1/chat',
				headers: authHeaders,
				body: JSON.stringify({ content: 'Hello', channelId: 'webchat' }),
			});

			expect(res.status).toBe(200);
			const body = JSON.parse(res.body);
			expect(body.content).toBe('Hello from Axel!');
			expect(body.sessionId).toBe('sess-123');
			expect(body.requestId).toBeDefined();
		});

		it('includes usage in response', async () => {
			const res = await makeRequest(httpServer, {
				method: 'POST',
				path: '/api/v1/chat',
				headers: authHeaders,
				body: JSON.stringify({ content: 'Hello', channelId: 'webchat' }),
			});

			const body = JSON.parse(res.body);
			expect(body.usage).toBeDefined();
			expect(body.usage.inputTokens).toBe(10);
			expect(body.usage.outputTokens).toBe(20);
		});

		it('returns 500 when handleMessage throws', async () => {
			handleMessage.mockRejectedValueOnce(new Error('LLM provider down'));

			const res = await makeRequest(httpServer, {
				method: 'POST',
				path: '/api/v1/chat',
				headers: authHeaders,
				body: JSON.stringify({ content: 'Hello', channelId: 'webchat' }),
			});

			expect(res.status).toBe(500);
			const body = JSON.parse(res.body);
			expect(body.error).toBeDefined();
			expect(body.requestId).toBeDefined();
		});

		it('includes userId from config in handleMessage call', async () => {
			const res = await makeRequest(httpServer, {
				method: 'POST',
				path: '/api/v1/chat',
				headers: authHeaders,
				body: JSON.stringify({ content: 'Hello', channelId: 'webchat' }),
			});

			expect(res.status).toBe(200);
			expect(handleMessage).toHaveBeenCalledWith(
				expect.objectContaining({
					userId: expect.any(String),
				}),
			);
		});
	});

	describe('POST /api/v1/chat/stream', () => {
		it('calls handleMessage and streams SSE events', async () => {
			handleMessage.mockImplementationOnce(
				async (
					_msg: unknown,
					onEvent?: (event: { type: string; [key: string]: unknown }) => void,
				) => {
					onEvent?.({ type: 'message_delta', content: 'Hello ' });
					onEvent?.({ type: 'message_delta', content: 'world!' });
					return {
						content: 'Hello world!',
						sessionId: 'sess-456',
						channelSwitched: false,
						usage: {
							inputTokens: 5,
							outputTokens: 10,
							cacheReadTokens: 0,
							cacheCreationTokens: 0,
						},
					};
				},
			);

			const res = await makeRequest(httpServer, {
				method: 'POST',
				path: '/api/v1/chat/stream',
				headers: authHeaders,
				body: JSON.stringify({ content: 'Hello', channelId: 'webchat' }),
			});

			expect(res.status).toBe(200);
			expect(res.headers['content-type']).toBe('text/event-stream');
			expect(res.body).toContain('event: message_delta');
			expect(res.body).toContain('event: done');
		});

		it('streams thinking_delta events', async () => {
			handleMessage.mockImplementationOnce(
				async (
					_msg: unknown,
					onEvent?: (event: { type: string; [key: string]: unknown }) => void,
				) => {
					onEvent?.({ type: 'thinking_delta', content: 'Let me think...' });
					onEvent?.({ type: 'message_delta', content: 'Answer' });
					return {
						content: 'Answer',
						sessionId: 'sess-789',
						channelSwitched: false,
						usage: {
							inputTokens: 5,
							outputTokens: 10,
							cacheReadTokens: 0,
							cacheCreationTokens: 0,
						},
					};
				},
			);

			const res = await makeRequest(httpServer, {
				method: 'POST',
				path: '/api/v1/chat/stream',
				headers: authHeaders,
				body: JSON.stringify({ content: 'Hello', channelId: 'webchat' }),
			});

			expect(res.body).toContain('event: thinking_delta');
			expect(res.body).toContain('event: message_delta');
		});

		it('returns 500 on handleMessage error in stream mode', async () => {
			handleMessage.mockRejectedValueOnce(new Error('Stream error'));

			const res = await makeRequest(httpServer, {
				method: 'POST',
				path: '/api/v1/chat/stream',
				headers: authHeaders,
				body: JSON.stringify({ content: 'Hello', channelId: 'webchat' }),
			});

			// Stream endpoint should still return 200 initially but include error event,
			// OR return 500 before streaming starts
			const body = res.body;
			const isError = res.status >= 400 || body.includes('event: error');
			expect(isError).toBe(true);
		});
	});

	describe('WS /ws chat message', () => {
		async function connectAndAuth(httpServer: http.Server): Promise<WebSocket> {
			const ws = await connectWs(httpServer);
			ws.send(JSON.stringify({ type: 'auth', token: 'test-auth-token-12345' }));
			await waitForMessage(ws); // consume auth_ok
			return ws;
		}

		it('routes chat message through handleMessage', async () => {
			const ws = await connectAndAuth(httpServer);

			ws.send(JSON.stringify({ type: 'chat', content: 'Hello via WS', channelId: 'webchat' }));

			// Should receive at least one message (message_delta or done)
			const msg = await waitForMessage(ws);
			expect(['message_delta', 'done', 'session_info']).toContain(msg.type);

			ws.close();
		});

		it('streams ReActEvents as WS messages', async () => {
			handleMessage.mockImplementationOnce(
				async (
					_msg: unknown,
					onEvent?: (event: { type: string; [key: string]: unknown }) => void,
				) => {
					onEvent?.({ type: 'message_delta', content: 'Hello ' });
					onEvent?.({ type: 'message_delta', content: 'WS!' });
					return {
						content: 'Hello WS!',
						sessionId: 'sess-ws',
						channelSwitched: false,
						usage: {
							inputTokens: 5,
							outputTokens: 10,
							cacheReadTokens: 0,
							cacheCreationTokens: 0,
						},
					};
				},
			);

			const ws = await connectAndAuth(httpServer);

			ws.send(JSON.stringify({ type: 'chat', content: 'Hello', channelId: 'webchat' }));

			const messages: Record<string, unknown>[] = [];
			// Collect messages until done
			for (let i = 0; i < 5; i++) {
				try {
					const msg = await waitForMessage(ws);
					messages.push(msg);
					if (msg.type === 'done') break;
				} catch {
					break;
				}
			}

			const types = messages.map((m) => m.type);
			expect(types).toContain('done');

			ws.close();
		});

		it('rejects chat message missing content', async () => {
			const ws = await connectAndAuth(httpServer);

			ws.send(JSON.stringify({ type: 'chat', channelId: 'webchat' }));
			const msg = await waitForMessage(ws);

			expect(msg.type).toBe('error');
			ws.close();
		});

		it('rejects chat message missing channelId', async () => {
			const ws = await connectAndAuth(httpServer);

			ws.send(JSON.stringify({ type: 'chat', content: 'Hello' }));
			const msg = await waitForMessage(ws);

			expect(msg.type).toBe('error');
			ws.close();
		});
	});
});
