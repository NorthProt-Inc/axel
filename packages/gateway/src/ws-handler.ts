import type { WebSocket } from 'ws';
import { classifyError } from './classify-error.js';
import { generateRequestId, timingSafeEqual } from './http-utils.js';
import type { GatewayConfig, GatewayDeps } from './types.js';

const WS_AUTH_TIMEOUT_MS = 5_000;
const MAX_WS_MESSAGE_BYTES = 65_536; // 64KB

export interface AuthenticatedWebSocket extends WebSocket {
	authenticated?: boolean;
	authTimer?: ReturnType<typeof setTimeout>;
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
