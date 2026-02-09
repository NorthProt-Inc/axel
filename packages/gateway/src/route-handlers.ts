import type * as http from 'node:http';
import { generateRequestId, parseJsonBody, sendError, sendJson } from './http-utils.js';
import type { GatewayDeps, RouteHandler } from './types.js';

/** Create route handlers for memory, session, and tool endpoints. */
export function createResourceHandlers(deps: GatewayDeps): {
	handleMemorySearch: RouteHandler;
	handleMemoryStats: RouteHandler;
	handleSession: RouteHandler;
	handleSessionEnd: RouteHandler;
	handleSessions: RouteHandler;
	handleSessionMessages: RouteHandler;
	handleTools: RouteHandler;
	handleToolExecute: RouteHandler;
} {
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
		if (!parsed || typeof parsed['query'] !== 'string' || parsed['query'].length === 0) {
			sendError(res, 400, 'Invalid request: query required', requestId);
			return;
		}
		const result = await deps.searchMemory({
			query: parsed['query'],
			...(typeof parsed['limit'] === 'number' ? { limit: parsed['limit'] } : {}),
			...(Array.isArray(parsed['memoryTypes']) ? { memoryTypes: parsed['memoryTypes'] as string[] } : {}),
			...(typeof parsed['channelFilter'] === 'string' ? { channelFilter: parsed['channelFilter'] } : {}),
			...(typeof parsed['minImportance'] === 'number' ? { minImportance: parsed['minImportance'] } : {}),
			...(typeof parsed['hybridSearch'] === 'boolean' ? { hybridSearch: parsed['hybridSearch'] } : {}),
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
		const sessionId = session['sessionId'];
		if (typeof sessionId !== 'string' || sessionId.length === 0) {
			sendError(res, 500, 'Internal error', requestId);
			return;
		}
		const summary = await deps.endSession(sessionId);
		sendJson(res, 200, { ...summary, requestId });
	}

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
		if (!parsed || typeof parsed['name'] !== 'string' || parsed['name'].length === 0) {
			sendError(res, 400, 'Invalid request: name required', requestId);
			return;
		}
		if (!parsed['args'] || typeof parsed['args'] !== 'object' || Array.isArray(parsed['args'])) {
			sendError(res, 400, 'Invalid request: args required', requestId);
			return;
		}
		const result = await deps.executeTool({
			name: parsed['name'],
			args: parsed['args'] as Record<string, unknown>,
		});
		sendJson(res, 200, {
			name: parsed['name'],
			success: result.success,
			result: result.content,
			error: result.error,
			executionMs: result.durationMs,
			requestId,
		});
	}

	async function handleSessions(
		_req: http.IncomingMessage,
		res: http.ServerResponse,
	): Promise<void> {
		const requestId = generateRequestId();
		if (!deps.listSessions) {
			sendError(res, 503, 'Session history not configured', requestId);
			return;
		}
		const sessions = await deps.listSessions('gateway-user');
		sendJson(res, 200, { sessions, requestId });
	}

	async function handleSessionMessages(
		req: http.IncomingMessage,
		res: http.ServerResponse,
	): Promise<void> {
		const requestId = generateRequestId();
		if (!deps.getSessionMessages) {
			sendError(res, 503, 'Session messages not configured', requestId);
			return;
		}
		const url = req.url ?? '';
		const match = /\/api\/v1\/sessions\/([^/]+)\/messages/.exec(url);
		if (!match?.[1]) {
			sendError(res, 400, 'Missing sessionId', requestId);
			return;
		}
		const messages = await deps.getSessionMessages(match[1]);
		sendJson(res, 200, { messages, requestId });
	}

	return {
		handleMemorySearch,
		handleMemoryStats,
		handleSession,
		handleSessionEnd,
		handleSessions,
		handleSessionMessages,
		handleTools,
		handleToolExecute,
	};
}
