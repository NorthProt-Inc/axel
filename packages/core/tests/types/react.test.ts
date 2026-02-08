import { describe, expect, it } from 'vitest';
import type { ReActEvent, ToolCallRequest } from '../../src/types/react.js';

describe('ReAct types', () => {
	describe('ToolCallRequest', () => {
		it('represents a tool invocation request', () => {
			const request: ToolCallRequest = {
				toolName: 'memory_search',
				args: { query: 'user preferences', limit: 5 },
				callId: 'call-001',
			};

			expect(request.toolName).toBe('memory_search');
			expect(request.callId).toBe('call-001');
		});
	});

	describe('ReActEvent', () => {
		it('supports message_delta events', () => {
			const event: ReActEvent = {
				type: 'message_delta',
				content: 'Hello, ',
			};
			expect(event.type).toBe('message_delta');
		});

		it('supports thinking_delta events', () => {
			const event: ReActEvent = {
				type: 'thinking_delta',
				content: 'Analyzing user request...',
			};
			expect(event.type).toBe('thinking_delta');
		});

		it('supports tool_call events', () => {
			const event: ReActEvent = {
				type: 'tool_call',
				tool: {
					toolName: 'file_read',
					args: { path: '/tmp/test.txt' },
					callId: 'call-002',
				},
			};
			expect(event.type).toBe('tool_call');
			if (event.type === 'tool_call') {
				expect(event.tool.toolName).toBe('file_read');
			}
		});

		it('supports tool_result events', () => {
			const event: ReActEvent = {
				type: 'tool_result',
				result: {
					callId: 'call-002',
					success: true,
					content: 'file contents here',
					durationMs: 42,
				},
			};
			expect(event.type).toBe('tool_result');
		});

		it('supports error events', () => {
			const event: ReActEvent = {
				type: 'error',
				error: {
					code: 'PROVIDER',
					message: 'Rate limit exceeded',
					isRetryable: true,
				},
			};
			expect(event.type).toBe('error');
		});

		it('supports done events with token usage', () => {
			const event: ReActEvent = {
				type: 'done',
				usage: {
					inputTokens: 1500,
					outputTokens: 500,
					cacheReadTokens: 200,
					cacheCreationTokens: 0,
				},
			};
			expect(event.type).toBe('done');
			if (event.type === 'done') {
				expect(event.usage.inputTokens).toBe(1500);
			}
		});
	});
});
