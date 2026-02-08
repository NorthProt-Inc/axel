/**
 * Chat state store using Svelte 5 runes.
 * Manages messages, WebSocket connection, and session state.
 * Pure logic delegated to chat-logic.ts for testability.
 */

import { parseWsMessage, applyChunk, applyDone, createUserMessage } from './chat-logic.js';

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

export const messages = {
	get value() { return messageList; },
};

export const sessions = {
	get value() { return sessionList; },
};

export const streaming = {
	get value() { return isStreaming; },
};

export function sendMessage(content: string): void {
	const userMsg = createUserMessage(content);
	messageList = [...messageList, userMsg];

	if (wsConnection?.readyState === WebSocket.OPEN) {
		wsConnection.send(JSON.stringify({
			type: 'message',
			content,
			sessionId: currentSessionId,
		}));
		isStreaming = true;
	}
}

export function connectWebSocket(url: string): void {
	const ws = new WebSocket(url);

	ws.addEventListener('message', (event) => {
		const parsed = parseWsMessage(event.data as string);
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
