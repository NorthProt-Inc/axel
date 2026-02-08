/**
 * Chat state store using Svelte 5 runes.
 * Manages messages, WebSocket connection, and session state.
 */

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
	const userMsg: ChatMessage = {
		id: crypto.randomUUID(),
		role: 'user',
		content,
		timestamp: new Date(),
	};
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
		const data = JSON.parse(event.data as string) as { type: string; content?: string; sessionId?: string };
		if (data.type === 'chunk' && data.content) {
			const last = messageList[messageList.length - 1];
			if (last?.role === 'assistant' && last.streaming) {
				messageList = [
					...messageList.slice(0, -1),
					{ ...last, content: last.content + data.content },
				];
			} else {
				messageList = [...messageList, {
					id: crypto.randomUUID(),
					role: 'assistant',
					content: data.content,
					timestamp: new Date(),
					streaming: true,
				}];
			}
		} else if (data.type === 'done') {
			const last = messageList[messageList.length - 1];
			if (last?.role === 'assistant' && last.streaming) {
				messageList = [
					...messageList.slice(0, -1),
					{ ...last, streaming: false },
				];
			}
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
