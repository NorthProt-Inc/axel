import * as http from 'node:http';
import { WebSocketServer } from 'ws';
import { classifyError } from './classify-error.js';
import {
	generateRequestId,
	parseChatInput,
	parseJsonBody,
	sendError,
	sendJson,
	timingSafeEqual,
} from './http-utils.js';
import type { GatewayConfig, GatewayDeps, Route } from './types.js';
import { type AuthenticatedWebSocket, setupWsAuth } from './ws-handler.js';

const MAX_BODY_BYTES = 32_768; // 32KB
const RATE_LIMIT_WINDOW_MS = 60_000;

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
		{
			method: 'POST',
			path: '/api/v1/memory/search',
			requiresAuth: true,
			handler: handleMemorySearch,
		},
		{ method: 'GET', path: '/api/v1/memory/stats', requiresAuth: true, handler: handleMemoryStats },
		{ method: 'GET', path: '/api/v1/session', requiresAuth: true, handler: handleSession },
		{ method: 'POST', path: '/api/v1/session/end', requiresAuth: true, handler: handleSessionEnd },
		{ method: 'GET', path: '/api/v1/tools', requiresAuth: true, handler: handleTools },
		{
			method: 'POST',
			path: '/api/v1/tools/execute',
			requiresAuth: true,
			handler: handleToolExecute,
		},
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
			setupWsAuth(ws, config, deps);
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

	// ─── HTTP Request Pipeline ───

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

		if (!deps.handleMessage) {
			sendError(res, 503, 'Chat handler not configured', requestId);
			return;
		}

		const result = await deps.handleMessage({
			userId: 'gateway-user',
			channelId: chatInput.channelId,
			content: chatInput.content,
		});

		sendJson(res, 200, {
			content: result.content,
			sessionId: result.sessionId,
			requestId,
			channelSwitched: result.channelSwitched,
			usage: result.usage,
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

		if (!deps.handleMessage) {
			sendError(res, 503, 'Chat handler not configured', requestId);
			return;
		}

		res.writeHead(200, {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive',
		});

		try {
			const result = await deps.handleMessage(
				{
					userId: 'gateway-user',
					channelId: chatInput.channelId,
					content: chatInput.content,
				},
				(event) => {
					res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
				},
			);

			res.write(
				`event: done\ndata: ${JSON.stringify({
					sessionId: result.sessionId,
					usage: result.usage,
				})}\n\n`,
			);
		} catch (err: unknown) {
			const classified = classifyError(err, config.env);
			res.write(
				`event: error\ndata: ${JSON.stringify({
					error: classified.message,
					requestId,
				})}\n\n`,
			);
		}
		res.end();
	}

	// ─── Memory Routes ───

	async function handleMemorySearch(
		_req: http.IncomingMessage,
		res: http.ServerResponse,
		body: string,
	): Promise<void> {
		const requestId = generateRequestId();
		if (!deps.searchMemory) {
			sendError(res, 503, 'Memory search not configured', requestId);
			return;
		}
		const parsed = parseJsonBody(body);
		if (!parsed || typeof parsed.query !== 'string' || parsed.query.length === 0) {
			sendError(res, 400, 'Invalid request: query required', requestId);
			return;
		}
		const result = await deps.searchMemory({
			query: parsed.query,
			limit: typeof parsed.limit === 'number' ? parsed.limit : undefined,
			memoryTypes: Array.isArray(parsed.memoryTypes) ? (parsed.memoryTypes as string[]) : undefined,
			channelFilter: typeof parsed.channelFilter === 'string' ? parsed.channelFilter : undefined,
			minImportance: typeof parsed.minImportance === 'number' ? parsed.minImportance : undefined,
			hybridSearch: typeof parsed.hybridSearch === 'boolean' ? parsed.hybridSearch : undefined,
		});
		sendJson(res, 200, { results: result.results, totalMatches: result.totalMatches, requestId });
	}

	async function handleMemoryStats(
		_req: http.IncomingMessage,
		res: http.ServerResponse,
	): Promise<void> {
		const requestId = generateRequestId();
		if (!deps.getMemoryStats) {
			sendError(res, 503, 'Memory stats not configured', requestId);
			return;
		}
		const stats = await deps.getMemoryStats();
		sendJson(res, 200, { ...stats, requestId });
	}

	// ─── Session Routes ───

	async function handleSession(
		_req: http.IncomingMessage,
		res: http.ServerResponse,
	): Promise<void> {
		const requestId = generateRequestId();
		if (!deps.getSession) {
			sendError(res, 503, 'Session service not configured', requestId);
			return;
		}
		const session = await deps.getSession('gateway-user');
		sendJson(res, 200, { active: session !== null, session, requestId });
	}

	async function handleSessionEnd(
		_req: http.IncomingMessage,
		res: http.ServerResponse,
	): Promise<void> {
		const requestId = generateRequestId();
		if (!deps.getSession || !deps.endSession) {
			sendError(res, 503, 'Session service not configured', requestId);
			return;
		}
		const session = await deps.getSession('gateway-user');
		if (!session) {
			sendError(res, 404, 'No active session', requestId);
			return;
		}
		const sessionId = (session as Record<string, unknown>).sessionId as string;
		const summary = await deps.endSession(sessionId);
		sendJson(res, 200, { ...summary, requestId });
	}

	// ─── Tool Routes ───

	async function handleTools(_req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		const requestId = generateRequestId();
		if (!deps.listTools) {
			sendError(res, 503, 'Tool registry not configured', requestId);
			return;
		}
		const tools = deps.listTools();
		sendJson(res, 200, { tools, requestId });
	}

	async function handleToolExecute(
		_req: http.IncomingMessage,
		res: http.ServerResponse,
		body: string,
	): Promise<void> {
		const requestId = generateRequestId();
		if (!deps.executeTool) {
			sendError(res, 503, 'Tool executor not configured', requestId);
			return;
		}
		const parsed = parseJsonBody(body);
		if (!parsed || typeof parsed.name !== 'string' || parsed.name.length === 0) {
			sendError(res, 400, 'Invalid request: name required', requestId);
			return;
		}
		if (!parsed.args || typeof parsed.args !== 'object' || Array.isArray(parsed.args)) {
			sendError(res, 400, 'Invalid request: args required', requestId);
			return;
		}
		const result = await deps.executeTool({
			name: parsed.name,
			args: parsed.args as Record<string, unknown>,
		});
		sendJson(res, 200, {
			name: parsed.name,
			success: result.success,
			result: result.content,
			error: result.error,
			executionMs: result.durationMs,
			requestId,
		});
	}

	return { start, stop };
}
