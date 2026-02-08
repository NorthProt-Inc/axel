/**
 * WebSocket authentication utilities — ADR-019 first-message auth pattern.
 *
 * Protocol:
 * 1. Client connects to WS
 * 2. Client sends: { type: "auth", token: "<bearer token>" }
 * 3. Server responds: { type: "auth_ok" } or { type: "auth_error", reason: "..." }
 * 4. 5s timeout — server closes with 4001 if no auth received
 */

export interface WsAuthMessage {
	readonly type: 'auth';
	readonly token: string;
}

export interface WsAuthOk {
	readonly type: 'auth_ok';
}

export interface WsAuthError {
	readonly type: 'auth_error';
	readonly reason: string;
}

export type WsAuthResponse = WsAuthOk | WsAuthError;

export function createAuthMessage(token: string): WsAuthMessage {
	return { type: 'auth', token };
}

export function parseAuthResponse(raw: string): WsAuthResponse | null {
	try {
		const data = JSON.parse(raw) as Record<string, unknown>;
		if (data.type === 'auth_ok') {
			return { type: 'auth_ok' };
		}
		if (data.type === 'auth_error' && typeof data.reason === 'string') {
			return { type: 'auth_error', reason: data.reason };
		}
		return null;
	} catch {
		return null;
	}
}

export function isAuthOk(response: WsAuthResponse): response is WsAuthOk {
	return response.type === 'auth_ok';
}
