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

export function connectWebSocket(url: string, token: string): void {
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
		}
	});

	ws.addEventListener('close', () => {
		wsConnection = null;
		wsAuthenticated = false;
		isStreaming = false;
	});

	wsConnection = ws;
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

export function switchSession(id: string): void {
	currentSessionId = id;
	messageList = [];
}
