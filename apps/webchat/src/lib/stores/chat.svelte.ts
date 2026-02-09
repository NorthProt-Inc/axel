/**
 * Chat state store using Svelte 5 runes.
 * Manages messages, WebSocket connection, and session state.
 * Pure logic delegated to chat-logic.ts for testability.
 */

import { parseWsMessage, applyChunk, applyDone, createUserMessage } from './chat-logic.js';
import { createAuthMessage, parseAuthResponse, isAuthOk } from './ws-auth.js';

export interface ChatMessage {
	readonly id: string;
	readonly role: 'user' | 'assistant' | 'system';
	readonly content: string;
	readonly timestamp: Date;
	readonly streaming?: boolean;
}

export interface Session {
	readonly id: string;
	readonly title: string;
	readonly createdAt: Date;
}

let messageList = $state<ChatMessage[]>([]);
let sessionList = $state<Session[]>([]);
let currentSessionId = $state<string | null>(null);
let isStreaming = $state(false);
let wsConnection = $state<WebSocket | null>(null);
let wsAuthenticated = $state(false);
let apiBaseUrl = '';
let apiToken = '';

export const messages = {
	get value() {
		return messageList;
	},
};

export const sessions = {
	get value() {
		return sessionList;
	},
};

export const streaming = {
	get value() {
		return isStreaming;
	},
};

export function sendMessage(content: string): void {
	const userMsg = createUserMessage(content);
	messageList = [...messageList, userMsg];

	if (wsConnection?.readyState === WebSocket.OPEN && wsAuthenticated) {
		wsConnection.send(
			JSON.stringify({
				type: 'chat',
				content,
				channelId: 'webchat',
				sessionId: currentSessionId,
			}),
		);
		isStreaming = true;
	}
}

export function connectWebSocket(url: string, token: string, gatewayUrl?: string): void {
	apiToken = token;
	apiBaseUrl = gatewayUrl ?? url.replace(/^ws/, 'http').replace(/\/ws$/, '');

	const ws = new WebSocket(url);
	let authenticated = false;

	ws.addEventListener('open', () => {
		ws.send(JSON.stringify(createAuthMessage(token)));
	});

	ws.addEventListener('message', (event) => {
		const raw = event.data as string;

		if (!authenticated) {
			const authResp = parseAuthResponse(raw);
			if (authResp && isAuthOk(authResp)) {
				authenticated = true;
				wsAuthenticated = true;
			}
			return;
		}

		const parsed = parseWsMessage(raw);
		if (!parsed) return;

		if (parsed.type === 'chunk') {
			messageList = applyChunk(messageList, parsed.content, crypto.randomUUID());
		} else if (parsed.type === 'done') {
			messageList = applyDone(messageList);
			isStreaming = false;
			if (parsed.sessionId) {
				currentSessionId = parsed.sessionId;
			}
		}
	});

	ws.addEventListener('close', () => {
		wsConnection = null;
		wsAuthenticated = false;
		isStreaming = false;
	});

	wsConnection = ws;
}

export async function loadSessions(): Promise<void> {
	try {
		const res = await fetch(`${apiBaseUrl}/api/v1/sessions`, {
			headers: { Authorization: `Bearer ${apiToken}` },
		});
		if (!res.ok) return;
		const data = (await res.json()) as {
			sessions: readonly {
				sessionId: string;
				title?: string;
				channelId: string;
				startedAt: string;
			}[];
		};
		sessionList = data.sessions.map((s) => ({
			id: s.sessionId,
			title: s.title ?? `Session ${s.sessionId.slice(0, 8)}`,
			createdAt: new Date(s.startedAt),
		}));
	} catch {
		// Silent — session loading failure is non-critical
	}
}

export async function loadMessages(sessionId: string): Promise<void> {
	try {
		const res = await fetch(`${apiBaseUrl}/api/v1/sessions/${sessionId}/messages`, {
			headers: { Authorization: `Bearer ${apiToken}` },
		});
		if (!res.ok) return;
		const data = (await res.json()) as {
			messages: readonly {
				role: string;
				content: string;
				timestamp: string;
			}[];
		};
		messageList = data.messages.map((m) => ({
			id: crypto.randomUUID(),
			role: m.role as 'user' | 'assistant' | 'system',
			content: m.content,
			timestamp: new Date(m.timestamp),
		}));
	} catch {
		// Silent — message loading failure is non-critical
	}
}

export function createSession(): void {
	const session: Session = {
		id: crypto.randomUUID(),
		title: 'New Chat',
		createdAt: new Date(),
	};
	sessionList = [...sessionList, session];
	currentSessionId = session.id;
	messageList = [];
}

export async function switchSession(id: string): Promise<void> {
	currentSessionId = id;
	await loadMessages(id);
}
