import { describe, expect, it } from 'vitest';
import {
	type WsMessage,
	applyChunk,
	applyDone,
	createUserMessage,
	parseWsMessage,
} from '../src/lib/stores/chat-logic.js';
import type { ChatMessage } from '../src/lib/stores/chat.svelte';

describe('Chat Logic — Pure Functions', () => {
	describe('parseWsMessage', () => {
		it('parses chunk message', () => {
			const result = parseWsMessage('{"type":"chunk","content":"hello"}');
			expect(result).toEqual({ type: 'chunk', content: 'hello' });
		});

		it('parses done message', () => {
			const result = parseWsMessage('{"type":"done"}');
			expect(result).toEqual({ type: 'done' });
		});

		it('returns null for invalid JSON', () => {
			const result = parseWsMessage('not json');
			expect(result).toBeNull();
		});

		it('returns null for unknown message type', () => {
			const result = parseWsMessage('{"type":"unknown"}');
			expect(result).toBeNull();
		});

		it('returns null for chunk without content', () => {
			const result = parseWsMessage('{"type":"chunk"}');
			expect(result).toBeNull();
		});
	});

	describe('applyChunk', () => {
		it('creates new assistant message for first chunk', () => {
			const messages: readonly ChatMessage[] = [];
			const result = applyChunk(messages, 'hello', 'test-id');
			expect(result).toHaveLength(1);
			expect(result[0]?.role).toBe('assistant');
			expect(result[0]?.content).toBe('hello');
			expect(result[0]?.streaming).toBe(true);
		});

		it('appends to existing streaming assistant message', () => {
			const messages: readonly ChatMessage[] = [
				{ id: '1', role: 'assistant', content: 'hel', timestamp: new Date(), streaming: true },
			];
			const result = applyChunk(messages, 'lo', 'test-id');
			expect(result).toHaveLength(1);
			expect(result[0]?.content).toBe('hello');
			expect(result[0]?.streaming).toBe(true);
		});

		it('creates new message when last is user message', () => {
			const messages: readonly ChatMessage[] = [
				{ id: '1', role: 'user', content: 'hi', timestamp: new Date() },
			];
			const result = applyChunk(messages, 'response', 'test-id');
			expect(result).toHaveLength(2);
			expect(result[1]?.role).toBe('assistant');
			expect(result[1]?.content).toBe('response');
		});

		it('creates new message when last assistant is not streaming', () => {
			const messages: readonly ChatMessage[] = [
				{ id: '1', role: 'assistant', content: 'done', timestamp: new Date(), streaming: false },
			];
			const result = applyChunk(messages, 'new', 'test-id');
			expect(result).toHaveLength(2);
		});
	});

	describe('applyDone', () => {
		it('marks last streaming assistant message as done', () => {
			const messages: readonly ChatMessage[] = [
				{ id: '1', role: 'assistant', content: 'hello', timestamp: new Date(), streaming: true },
			];
			const result = applyDone(messages);
			expect(result).toHaveLength(1);
			expect(result[0]?.streaming).toBe(false);
		});

		it('returns messages unchanged when no streaming message', () => {
			const messages: readonly ChatMessage[] = [
				{ id: '1', role: 'user', content: 'hi', timestamp: new Date() },
			];
			const result = applyDone(messages);
			expect(result).toEqual(messages);
		});

		it('returns empty array unchanged', () => {
			const result = applyDone([]);
			expect(result).toEqual([]);
		});
	});

	describe('createUserMessage', () => {
		it('creates a user message with given content', () => {
			const msg = createUserMessage('hello');
			expect(msg.role).toBe('user');
			expect(msg.content).toBe('hello');
			expect(msg.id).toBeDefined();
			expect(msg.timestamp).toBeInstanceOf(Date);
		});

		it('generates unique IDs', () => {
			const msg1 = createUserMessage('a');
			const msg2 = createUserMessage('b');
			expect(msg1.id).not.toBe(msg2.id);
		});
	});
});
