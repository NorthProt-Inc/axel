import * as crypto from 'node:crypto';
import * as http from 'node:http';
import type { HealthStatus } from '@axel/core/types';
import { type WebSocket, WebSocketServer } from 'ws';
import { classifyError } from './classify-error.js';

const MAX_BODY_BYTES = 32_768; // 32KB
const WS_AUTH_TIMEOUT_MS = 5_000;
const RATE_LIMIT_WINDOW_MS = 60_000;

export interface GatewayConfig {
	readonly port: number;
	readonly host: string;
	readonly authToken: string;
	readonly env: 'development' | 'production' | 'test';
	readonly corsOrigins: readonly string[];
	readonly rateLimitPerMinute: number;
}

export interface GatewayDeps {
	readonly healthCheck: () => Promise<HealthStatus>;
}

type RouteHandler = (
	req: http.IncomingMessage,
	res: http.ServerResponse,
	body: string,
) => Promise<void>;

interface Route {
	readonly method: string;
	readonly path: string;
	readonly requiresAuth: boolean;
	readonly handler: RouteHandler;
}

interface AuthenticatedWebSocket extends WebSocket {
	authenticated?: boolean;
	authTimer?: ReturnType<typeof setTimeout>;
}

export function createGatewayServer(config: GatewayConfig, deps: GatewayDeps) {
	let httpServer: http.Server | null = null;
	let wss: WebSocketServer | null = null;
	const startedAt = Date.now();
	const connections = new Set<AuthenticatedWebSocket>();
	const rateLimitBuckets = new Map<string, number[]>();

	const routes: Route[] = [
		{ method: 'GET', path: '/health', requiresAuth: false, handler: handleHealth },
		{ method: 'GET', path: '/health/detailed', requiresAuth: true, handler: handleHealthDetailed },
		{ method: 'POST', path: '/api/v1/chat', requiresAuth: true, handler: handleChat },
		{ method: 'POST', path: '/api/v1/chat/stream', requiresAuth: true, handler: handleChatStream },
	];

	async function start(): Promise<http.Server> {
		httpServer = http.createServer((req, res) => handleRequest(req, res));
		wss = new WebSocketServer({ noServer: true });

		httpServer.on('upgrade', (req: http.IncomingMessage, socket, head: Buffer) => {
			handleUpgrade(req, socket as import('node:net').Socket, head);
		});

		wss.on('connection', (ws: AuthenticatedWebSocket) => {
			connections.add(ws);
			ws.on('close', () => {
				if (ws.authTimer) clearTimeout(ws.authTimer);
				connections.delete(ws);
			});
			setupWsAuth(ws);
		});

		return new Promise<http.Server>((resolve) => {
			httpServer?.listen(config.port, config.host, () => resolve(httpServer as http.Server));
		});
	}

	async function stop(): Promise<void> {
		for (const ws of connections) {
			if (ws.authTimer) clearTimeout(ws.authTimer);
			ws.close(1001, 'Server shutting down');
		}
		connections.clear();
		wss?.close();
		wss = null;

		return new Promise<void>((resolve, reject) => {
			if (!httpServer) return resolve();
			httpServer.close((err) => {
				httpServer = null;
				err ? reject(err) : resolve();
			});
		});
	}

	function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
		const requestId = generateRequestId();
		if (handleCors(req, res)) return;

		let body = '';
		let bodyBytes = 0;
		let aborted = false;

		req.on('data', (chunk: Buffer) => {
			if (aborted) return;
			bodyBytes += chunk.length;
			if (bodyBytes > MAX_BODY_BYTES) {
				aborted = true;
				sendError(res, 413, 'Request body too large', requestId);
				req.destroy();
				return;
			}
			body += chunk.toString();
		});

		req.on('end', () => {
			if (!aborted) processRequest(req, res, body, requestId);
		});
	}

	function processRequest(
		req: http.IncomingMessage,
		res: http.ServerResponse,
		body: string,
		requestId: string,
	): void {
		const method = req.method ?? 'GET';
		const path = (req.url ?? '/').split('?')[0] ?? '/';
		const route = routes.find((r) => r.method === method && r.path === path);

		if (!route) {
			sendError(res, 404, 'Not Found', requestId);
			return;
		}
		if (route.requiresAuth && !verifyAuth(req)) {
			sendError(res, 401, 'Unauthorized', requestId);
			return;
		}
		if (route.requiresAuth && !checkRateLimit(req)) {
			res.setHeader('Retry-After', String(Math.ceil(RATE_LIMIT_WINDOW_MS / 1000)));
			sendError(res, 429, 'Rate limit exceeded', requestId);
			return;
		}

		route.handler(req, res, body).catch((err: unknown) => {
			const classified = classifyError(err, config.env);
			sendError(res, classified.status, classified.message, requestId);
		});
	}

	function checkRateLimit(req: http.IncomingMessage): boolean {
		const clientIp = req.socket.remoteAddress ?? 'unknown';
		const now = Date.now();
		const windowStart = now - RATE_LIMIT_WINDOW_MS;

		let timestamps = rateLimitBuckets.get(clientIp);
		if (!timestamps) {
			timestamps = [];
			rateLimitBuckets.set(clientIp, timestamps);
		}

		while (timestamps.length > 0 && (timestamps[0] ?? 0) < windowStart) {
			timestamps.shift();
		}

		if (timestamps.length >= config.rateLimitPerMinute) return false;
		timestamps.push(now);
		return true;
	}

	function handleCors(req: http.IncomingMessage, res: http.ServerResponse): boolean {
		const origin = req.headers.origin;
		if (origin && config.corsOrigins.includes(origin)) {
			res.setHeader('Access-Control-Allow-Origin', origin);
			res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
			res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
			res.setHeader('Access-Control-Max-Age', '86400');
			res.setHeader('Vary', 'Origin');
		}
		if (req.method === 'OPTIONS') {
			res.writeHead(204);
			res.end();
			return true;
		}
		return false;
	}

	function verifyAuth(req: http.IncomingMessage): boolean {
		const authHeader = req.headers.authorization;
		if (!authHeader?.startsWith('Bearer ')) return false;
		return timingSafeEqual(authHeader.slice(7), config.authToken);
	}

	// ─── WebSocket (ADR-019 first-message auth) ───

	function handleUpgrade(
		req: http.IncomingMessage,
		socket: import('node:net').Socket,
		head: Buffer,
	): void {
		const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
		if (url.pathname !== '/ws') {
			socket.destroy();
			return;
		}
		wss?.handleUpgrade(req, socket, head, (ws) => wss?.emit('connection', ws, req));
	}

	function setupWsAuth(ws: AuthenticatedWebSocket): void {
		ws.authenticated = false;
		ws.authTimer = setTimeout(() => {
			if (!ws.authenticated) ws.close(4001, 'Auth timeout');
		}, WS_AUTH_TIMEOUT_MS);

		ws.on('message', (data: WebSocket.RawData) => {
			ws.authenticated ? handleWsMessage(ws, data) : handleWsAuthMessage(ws, data);
		});
	}

	function handleWsAuthMessage(ws: AuthenticatedWebSocket, data: WebSocket.RawData): void {
		let parsed: Record<string, unknown>;
		try {
			parsed = JSON.parse(data.toString()) as Record<string, unknown>;
		} catch {
			ws.close(4001, 'Unauthorized');
			return;
		}

		if (parsed.type !== 'auth' || typeof parsed.token !== 'string') {
			ws.close(4001, 'Unauthorized');
			return;
		}

		if (!timingSafeEqual(parsed.token, config.authToken)) {
			ws.close(4001, 'Unauthorized');
			return;
		}

		ws.authenticated = true;
		if (ws.authTimer) {
			clearTimeout(ws.authTimer);
			ws.authTimer = undefined;
		}
		ws.send(JSON.stringify({ type: 'auth_ok' }));
	}

	function handleWsMessage(ws: WebSocket, data: WebSocket.RawData): void {
		let parsed: Record<string, unknown>;
		try {
			parsed = JSON.parse(data.toString()) as Record<string, unknown>;
		} catch {
			ws.send(
				JSON.stringify({ type: 'error', error: 'Invalid JSON', requestId: generateRequestId() }),
			);
			return;
		}

		if (parsed.type === 'session_info_request') {
			ws.send(JSON.stringify({ type: 'session_info', session: null }));
			return;
		}

		ws.send(
			JSON.stringify({
				type: 'error',
				error: `Unknown message type: ${String(parsed.type)}`,
				requestId: generateRequestId(),
			}),
		);
	}

	// ─── Route Handlers ───

	async function handleHealth(_req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		sendJson(res, 200, { status: 'ok', timestamp: new Date().toISOString() });
	}

	async function handleHealthDetailed(
		_req: http.IncomingMessage,
		res: http.ServerResponse,
	): Promise<void> {
		const health = await deps.healthCheck();
		const uptime = Math.floor((Date.now() - startedAt) / 1000);
		sendJson(res, health.state === 'healthy' ? 200 : 503, {
			status: health.state,
			timestamp: new Date().toISOString(),
			subsystems: health.checks,
			uptime,
		});
	}

	async function handleChat(
		_req: http.IncomingMessage,
		res: http.ServerResponse,
		body: string,
	): Promise<void> {
		const requestId = generateRequestId();
		const chatInput = parseChatInput(body);
		if (!chatInput) {
			sendError(res, 400, 'Invalid request: content and channelId required', requestId);
			return;
		}

		sendJson(res, 200, {
			content: `Echo: ${chatInput.content}`,
			sessionId: 'stub-session',
			requestId,
			channelSwitched: false,
			toolsUsed: [],
			usage: { tokensIn: 0, tokensOut: 0, model: 'stub' },
		});
	}

	async function handleChatStream(
		_req: http.IncomingMessage,
		res: http.ServerResponse,
		body: string,
	): Promise<void> {
		const requestId = generateRequestId();
		const chatInput = parseChatInput(body);
		if (!chatInput) {
			sendError(res, 400, 'Invalid request: content and channelId required', requestId);
			return;
		}

		res.writeHead(200, {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive',
		});
		res.write(`event: session_info\ndata: ${JSON.stringify({ sessionId: 'stub-session' })}\n\n`);
		res.write(
			`event: message_delta\ndata: ${JSON.stringify({ content: `Echo: ${chatInput.content}` })}\n\n`,
		);
		res.write(
			`event: done\ndata: ${JSON.stringify({ sessionId: 'stub-session', totalTokens: 0 })}\n\n`,
		);
		res.end();
	}

	return { start, stop };
}

// ─── Utilities ───

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
	res.writeHead(status, { 'Content-Type': 'application/json' });
	res.end(JSON.stringify(body));
}

function sendError(
	res: http.ServerResponse,
	status: number,
	message: string,
	requestId: string,
): void {
	sendJson(res, status, { error: message, requestId });
}

function generateRequestId(): string {
	return `req_${crypto.randomBytes(8).toString('hex')}`;
}

function parseChatInput(body: string): { content: string; channelId: string } | null {
	const parsed = parseJsonBody(body);
	if (!parsed) return null;
	const { content, channelId } = parsed;
	if (typeof content !== 'string' || content.length === 0) return null;
	if (typeof channelId !== 'string' || channelId.length === 0) return null;
	return { content, channelId };
}

function parseJsonBody(body: string): Record<string, unknown> | null {
	try {
		const parsed = JSON.parse(body);
		if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
			return parsed as Record<string, unknown>;
		}
		return null;
	} catch {
		return null;
	}
}

function timingSafeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
