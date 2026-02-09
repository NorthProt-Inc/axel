import type { WebSocket } from 'ws';
import { classifyError } from './classify-error.js';
import { generateRequestId, timingSafeEqual } from './http-utils.js';
import type { GatewayConfig, GatewayDeps } from './types.js';

const WS_AUTH_TIMEOUT_MS = 5_000;
const MAX_WS_MESSAGE_BYTES = 65_536; // 64KB
const WS_PING_INTERVAL_MS = 30_000;
const WS_PONG_TIMEOUT_MS = 10_000;
const WS_MAX_MISSED_PONGS = 3;

export interface AuthenticatedWebSocket extends WebSocket {
	authenticated?: boolean;
	authTimer?: ReturnType<typeof setTimeout>;
	heartbeatInterval?: ReturnType<typeof setInterval>;
	pongTimer?: ReturnType<typeof setTimeout>;
	missedPongs?: number;
}

export function setupWsHeartbeat(ws: AuthenticatedWebSocket): void {
	ws.missedPongs = 0;

	ws.on('pong', () => {
		ws.missedPongs = 0;
		if (ws.pongTimer) {
			clearTimeout(ws.pongTimer);
			// biome-ignore lint/performance/noDelete: exactOptionalPropertyTypes prevents undefined assignment
			delete ws.pongTimer;
		}
	});

	ws.heartbeatInterval = setInterval(() => {
		if ((ws.missedPongs ?? 0) >= WS_MAX_MISSED_PONGS) {
			cleanupWsTimers(ws);
			ws.close(1000, 'Heartbeat timeout');
			return;
		}

		ws.ping();
		ws.pongTimer = setTimeout(() => {
			ws.missedPongs = (ws.missedPongs ?? 0) + 1;
		}, WS_PONG_TIMEOUT_MS);
	}, WS_PING_INTERVAL_MS);
}

export function cleanupWsTimers(ws: AuthenticatedWebSocket): void {
	if (ws.authTimer) {
		clearTimeout(ws.authTimer);
		// biome-ignore lint/performance/noDelete: exactOptionalPropertyTypes prevents undefined assignment
		delete ws.authTimer;
	}
	if (ws.heartbeatInterval) {
		clearInterval(ws.heartbeatInterval);
		// biome-ignore lint/performance/noDelete: exactOptionalPropertyTypes prevents undefined assignment
		delete ws.heartbeatInterval;
	}
	if (ws.pongTimer) {
		clearTimeout(ws.pongTimer);
		// biome-ignore lint/performance/noDelete: exactOptionalPropertyTypes prevents undefined assignment
		delete ws.pongTimer;
	}
}

export function setupWsAuth(
	ws: AuthenticatedWebSocket,
	config: GatewayConfig,
	deps: GatewayDeps,
): void {
	ws.authenticated = false;
	ws.authTimer = setTimeout(() => {
		if (!ws.authenticated) ws.close(4001, 'Auth timeout');
	}, WS_AUTH_TIMEOUT_MS);

	ws.on('message', (data: WebSocket.RawData) => {
		const messageBytes = Buffer.isBuffer(data)
			? data.length
			: Array.isArray(data)
				? data.reduce((sum, buf) => sum + buf.length, 0)
				: data.byteLength;

		if (messageBytes > MAX_WS_MESSAGE_BYTES) {
			ws.close(1009, 'Message too big');
			return;
		}

		ws.authenticated
			? handleWsMessage(ws, data, config, deps)
			: handleWsAuthMessage(ws, data, config);
	});
}

function handleWsAuthMessage(
	ws: AuthenticatedWebSocket,
	data: WebSocket.RawData,
	config: GatewayConfig,
): void {
	let parsed: Record<string, unknown>;
	try {
		parsed = JSON.parse(data.toString()) as Record<string, unknown>;
	} catch {
		ws.close(4001, 'Unauthorized');
		return;
	}

	if (parsed['type'] !== 'auth' || typeof parsed['token'] !== 'string') {
		ws.close(4001, 'Unauthorized');
		return;
	}

	if (!timingSafeEqual(parsed['token'], config.authToken)) {
		ws.close(4001, 'Unauthorized');
		return;
	}

	ws.authenticated = true;
	if (ws.authTimer) {
		clearTimeout(ws.authTimer);
		// biome-ignore lint/performance/noDelete: exactOptionalPropertyTypes prevents undefined assignment
		delete ws.authTimer;
	}
	ws.send(JSON.stringify({ type: 'auth_ok' }));
}

function handleWsMessage(
	ws: WebSocket,
	data: WebSocket.RawData,
	config: GatewayConfig,
	deps: GatewayDeps,
): void {
	let parsed: Record<string, unknown>;
	try {
		parsed = JSON.parse(data.toString()) as Record<string, unknown>;
	} catch {
		ws.send(
			JSON.stringify({ type: 'error', error: 'Invalid JSON', requestId: generateRequestId() }),
		);
		return;
	}

	if (parsed['type'] === 'session_info_request') {
		ws.send(JSON.stringify({ type: 'session_info', session: null }));
		return;
	}

	if (parsed['type'] === 'chat') {
		handleWsChatMessage(ws, parsed, config, deps);
		return;
	}

	if (parsed['type'] === 'typing_start' || parsed['type'] === 'typing_stop') {
		// Acknowledged — no-op for now (Phase 2: presence tracking)
		return;
	}

	if (parsed['type'] === 'session_end') {
		handleWsSessionEnd(ws, parsed, deps);
		return;
	}

	ws.send(
		JSON.stringify({
			type: 'error',
			error: `Unknown message type: ${String(parsed['type'])}`,
			requestId: generateRequestId(),
		}),
	);
}

function handleWsChatMessage(
	ws: WebSocket,
	parsed: Record<string, unknown>,
	config: GatewayConfig,
	deps: GatewayDeps,
): void {
	const requestId = generateRequestId();
	const content = parsed['content'];
	const channelId = parsed['channelId'];

	if (typeof content !== 'string' || content.length === 0) {
		ws.send(JSON.stringify({ type: 'error', error: 'Missing content', requestId }));
		return;
	}
	if (typeof channelId !== 'string' || channelId.length === 0) {
		ws.send(JSON.stringify({ type: 'error', error: 'Missing channelId', requestId }));
		return;
	}

	if (!deps.handleMessage) {
		ws.send(JSON.stringify({ type: 'error', error: 'Chat handler not configured', requestId }));
		return;
	}

	deps
		.handleMessage(
			{ userId: 'gateway-user', channelId, content, timestamp: Date.now() },
			(event) => {
				if (ws.readyState === ws.OPEN) {
					ws.send(JSON.stringify(event));
				}
			},
		)
		.then((result) => {
			if (ws.readyState === ws.OPEN) {
				ws.send(
					JSON.stringify({
						type: 'done',
						sessionId: result.sessionId,
						usage: result.usage,
					}),
				);
			}
		})
		.catch((err: unknown) => {
			if (ws.readyState === ws.OPEN) {
				const classified = classifyError(err, config.env);
				ws.send(JSON.stringify({ type: 'error', error: classified.message, requestId }));
			}
		});
}

function handleWsSessionEnd(
	ws: WebSocket,
	parsed: Record<string, unknown>,
	deps: GatewayDeps,
): void {
	const requestId = generateRequestId();
	const sessionId = parsed['sessionId'];

	if (typeof sessionId !== 'string' || sessionId.length === 0) {
		ws.send(JSON.stringify({ type: 'error', error: 'Missing sessionId', requestId }));
		return;
	}

	if (!deps.endSession) {
		ws.send(JSON.stringify({ type: 'error', error: 'Session management not configured', requestId }));
		return;
	}

	deps
		.endSession(sessionId)
		.then((result) => {
			if (ws.readyState === ws.OPEN) {
				ws.send(JSON.stringify({ type: 'session_ended', ...result }));
			}
		})
		.catch((err: unknown) => {
			if (ws.readyState === ws.OPEN) {
				ws.send(
					JSON.stringify({
						type: 'error',
						error: err instanceof Error ? err.message : 'Session end failed',
						requestId,
					}),
				);
			}
		});
}
