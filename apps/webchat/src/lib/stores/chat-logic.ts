import type { ChatMessage } from './chat.svelte';

/**
 * Pure functions for chat store logic.
 * Extracted from chat.svelte.ts for testability.
 */

export interface WsChunkMessage {
	readonly type: 'chunk';
	readonly content: string;
}

export interface WsDoneMessage {
	readonly type: 'done';
	readonly sessionId?: string;
}

export type WsMessage = WsChunkMessage | WsDoneMessage;

export function parseWsMessage(raw: string): WsMessage | null {
	try {
		const data = JSON.parse(raw) as Record<string, unknown>;
		if (data.type === 'chunk' && typeof data.content === 'string') {
			return { type: 'chunk', content: data.content };
		}
		if (data.type === 'message_complete' && typeof data.content === 'string') {
			return { type: 'chunk', content: data.content };
		}
		if (data.type === 'done') {
			return {
				type: 'done',
				sessionId: typeof data.sessionId === 'string' ? data.sessionId : undefined,
			};
		}
		return null;
	} catch {
		return null;
	}
}

export function applyChunk(
	messages: readonly ChatMessage[],
	content: string,
	fallbackId: string,
): ChatMessage[] {
	const last = messages[messages.length - 1];
	if (last?.role === 'assistant' && last.streaming) {
		return [...messages.slice(0, -1), { ...last, content: last.content + content }];
	}
	return [
		...messages,
		{
			id: fallbackId,
			role: 'assistant',
			content,
			timestamp: new Date(),
			streaming: true,
		},
	];
}

export function applyDone(messages: readonly ChatMessage[]): ChatMessage[] {
	const last = messages[messages.length - 1];
	if (last?.role === 'assistant' && last.streaming) {
		return [...messages.slice(0, -1), { ...last, streaming: false }];
	}
	return [...messages];
}

export function createUserMessage(content: string): ChatMessage {
	return {
		id: crypto.randomUUID(),
		role: 'user',
		content,
		timestamp: new Date(),
	};
}
