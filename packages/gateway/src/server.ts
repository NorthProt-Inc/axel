import * as crypto from 'node:crypto';
import * as http from 'node:http';
import type { HealthStatus } from '@axel/core/types';
import { type WebSocket, WebSocketServer } from 'ws';

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

export function createGatewayServer(config: GatewayConfig, deps: GatewayDeps) {
	let httpServer: http.Server | null = null;
	let wss: WebSocketServer | null = null;
	const startedAt = Date.now();
	const connections = new Set<WebSocket>();

	const routes: Route[] = [
		{ method: 'GET', path: '/health', requiresAuth: false, handler: handleHealth },
		{ method: 'GET', path: '/health/detailed', requiresAuth: true, handler: handleHealthDetailed },
		{ method: 'POST', path: '/api/v1/chat', requiresAuth: true, handler: handleChat },
		{ method: 'POST', path: '/api/v1/chat/stream', requiresAuth: true, handler: handleChatStream },
	];

	async function start(): Promise<http.Server> {
		httpServer = http.createServer((req, res) => {
			handleRequest(req, res);
		});

		wss = new WebSocketServer({ noServer: true });

		httpServer.on('upgrade', (req: http.IncomingMessage, socket, head: Buffer) => {
			handleUpgrade(req, socket as import('node:net').Socket, head);
		});

		wss.on('connection', (ws: WebSocket) => {
			connections.add(ws);
			ws.on('close', () => connections.delete(ws));
			setupWsHandler(ws);
		});

		return new Promise<http.Server>((resolve) => {
			httpServer?.listen(config.port, config.host, () => {
				resolve(httpServer as http.Server);
			});
		});
	}

	async function stop(): Promise<void> {
		// Close all WebSocket connections
		for (const ws of connections) {
			ws.close(1001, 'Server shutting down');
		}
		connections.clear();

		wss?.close();
		wss = null;

		return new Promise<void>((resolve, reject) => {
			if (!httpServer) {
				resolve();
				return;
			}
			httpServer.close((err) => {
				httpServer = null;
				if (err) {
					reject(err);
				} else {
					resolve();
				}
			});
		});
	}

	function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
		const requestId = generateRequestId();

		// CORS
		if (handleCors(req, res)) {
			return;
		}

		// Collect body
		let body = '';
		req.on('data', (chunk: Buffer) => {
			body += chunk.toString();
		});
		req.on('end', () => {
			processRequest(req, res, body, requestId);
		});
	}

	function processRequest(
		req: http.IncomingMessage,
		res: http.ServerResponse,
		body: string,
		requestId: string,
	): void {
		const method = req.method ?? 'GET';
		const url = req.url ?? '/';
		const path = url.split('?')[0] ?? '/';

		const route = routes.find((r) => r.method === method && r.path === path);
		if (!route) {
			sendError(res, 404, 'Not Found', requestId);
			return;
		}

		if (route.requiresAuth && !verifyAuth(req)) {
			sendError(res, 401, 'Unauthorized', requestId);
			return;
		}

		route.handler(req, res, body).catch((err: unknown) => {
			const message = err instanceof Error ? err.message : 'Internal Server Error';
			sendError(
				res,
				500,
				config.env === 'development' ? message : 'Internal Server Error',
				requestId,
			);
		});
	}

	function handleCors(req: http.IncomingMessage, res: http.ServerResponse): boolean {
		const origin = req.headers.origin;

		if (origin && config.corsOrigins.includes(origin)) {
			res.setHeader('Access-Control-Allow-Origin', origin);
			res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
			res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
			res.setHeader('Access-Control-Max-Age', '86400');
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
		if (!authHeader?.startsWith('Bearer ')) {
			return false;
		}
		const token = authHeader.slice(7);
		return timingSafeEqual(token, config.authToken);
	}

	function handleUpgrade(
		req: http.IncomingMessage,
		socket: import('node:net').Socket,
		head: Buffer,
	): void {
		const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
		const path = url.pathname;

		if (path !== '/ws') {
			socket.destroy();
			return;
		}

		const token = url.searchParams.get('token');
		if (!token || !timingSafeEqual(token, config.authToken)) {
			socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
			socket.destroy();
			return;
		}

		wss?.handleUpgrade(req, socket, head, (ws) => {
			wss?.emit('connection', ws, req);
		});
	}

	function setupWsHandler(ws: WebSocket): void {
		ws.on('message', (data: WebSocket.RawData) => {
			handleWsMessage(ws, data);
		});
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

		const type = parsed.type;
		if (type === 'session_info_request') {
			ws.send(JSON.stringify({ type: 'session_info', session: null }));
			return;
		}

		ws.send(
			JSON.stringify({
				type: 'error',
				error: `Unknown message type: ${String(type)}`,
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
		const parsed = parseJsonBody(body);
		if (!parsed) {
			sendError(res, 400, 'Invalid JSON body', requestId);
			return;
		}

		const content = parsed.content;
		const channelId = parsed.channelId;

		if (typeof content !== 'string' || content.length === 0) {
			sendError(res, 400, 'content is required and must be a non-empty string', requestId);
			return;
		}
		if (typeof channelId !== 'string' || channelId.length === 0) {
			sendError(res, 400, 'channelId is required and must be a non-empty string', requestId);
			return;
		}

		// Stub response — full implementation will integrate with orchestrator
		sendJson(res, 200, {
			content: `Echo: ${content}`,
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
		const parsed = parseJsonBody(body);
		if (!parsed) {
			sendError(res, 400, 'Invalid JSON body', requestId);
			return;
		}

		const content = parsed.content;
		const channelId = parsed.channelId;

		if (typeof content !== 'string' || content.length === 0) {
			sendError(res, 400, 'content is required', requestId);
			return;
		}
		if (typeof channelId !== 'string' || channelId.length === 0) {
			sendError(res, 400, 'channelId is required', requestId);
			return;
		}

		res.writeHead(200, {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive',
		});

		res.write(`event: session_info\ndata: ${JSON.stringify({ sessionId: 'stub-session' })}\n\n`);
		res.write(`event: message_delta\ndata: ${JSON.stringify({ content: `Echo: ${content}` })}\n\n`);
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
	if (a.length !== b.length) {
		return false;
	}
	return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
