import type { Session } from './chat.svelte';

/**
 * Pure functions for gateway session API integration.
 * URL builders, response parsers, and session list management.
 *
 * Gateway endpoints:
 * - GET  /api/v1/session     → active session info
 * - POST /api/v1/session/end → end current session
 */

export interface SessionData {
	readonly sessionId: string;
	readonly userId: string;
	readonly channelId: string;
	readonly startedAt: string;
}

export interface SessionInfo {
	readonly active: boolean;
	readonly session: SessionData | null;
}

export interface SessionEndResult {
	readonly summary: string;
	readonly messageCount?: number;
}

export function buildSessionUrl(baseUrl: string): string {
	const base = baseUrl.replace(/\/+$/, '');
	return `${base}/api/v1/session`;
}

export function buildSessionEndUrl(baseUrl: string): string {
	const base = baseUrl.replace(/\/+$/, '');
	return `${base}/api/v1/session/end`;
}

export function parseSessionResponse(raw: string): SessionInfo | null {
	try {
		const data = JSON.parse(raw) as Record<string, unknown>;
		if (typeof data.active !== 'boolean') {
			return null;
		}

		let session: SessionData | null = null;
		if (data.session !== null && typeof data.session === 'object') {
			const s = data.session as Record<string, unknown>;
			if (typeof s.sessionId === 'string') {
				session = {
					sessionId: s.sessionId,
					userId: typeof s.userId === 'string' ? s.userId : '',
					channelId: typeof s.channelId === 'string' ? s.channelId : '',
					startedAt: typeof s.startedAt === 'string' ? s.startedAt : '',
				};
			}
		}

		return { active: data.active, session };
	} catch {
		return null;
	}
}

export function parseSessionEndResponse(raw: string): SessionEndResult | null {
	try {
		const data = JSON.parse(raw) as Record<string, unknown>;
		return {
			summary: typeof data.summary === 'string' ? data.summary : '',
			messageCount: typeof data.messageCount === 'number' ? data.messageCount : undefined,
		};
	} catch {
		return null;
	}
}

export function addSessionToList(
	existing: readonly Session[],
	info: SessionInfo,
): Session[] {
	if (!info.session) {
		return [...existing];
	}

	const sessionId = info.session.sessionId;
	if (existing.some((s) => s.id === sessionId)) {
		return [...existing];
	}

	return [
		...existing,
		{
			id: sessionId,
			title: `Session ${sessionId.slice(0, 8)}`,
			createdAt: new Date(info.session.startedAt),
		},
	];
}
