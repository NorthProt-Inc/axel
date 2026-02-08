import { describe, expect, it, vi } from 'vitest';
import type { ToolCallRequest } from '../../src/types/react.js';
import type { ToolResult } from '../../src/types/tool.js';
import {
	ProviderError,
	ToolError,
	TimeoutError,
	PermanentError,
} from '../../src/types/errors.js';
import type { Message } from '../../src/types/message.js';
import type {
	LlmChatChunk,
	LlmProvider,
	ReActConfig,
	ToolExecutor,
} from '../../src/orchestrator/types.js';
import { reactLoop } from '../../src/orchestrator/react-loop.js';

// ─── Helpers ───

function makeConfig(overrides?: Partial<ReActConfig>): ReActConfig {
	return {
		maxIterations: 15,
		toolTimeoutMs: 30_000,
		totalTimeoutMs: 300_000,
		streamingEnabled: true,
		...overrides,
	};
}

function makeMessages(count = 1): Message[] {
	return Array.from({ length: count }, (_, i) => ({
		sessionId: 'sess-1',
		turnId: i,
		role: 'user' as const,
		content: `message ${i}`,
		channelId: 'discord',
		timestamp: new Date(),
		emotionalContext: '',
		metadata: {},
	}));
}

function makeLlmProvider(chunks: LlmChatChunk[][]): LlmProvider {
	let callCount = 0;
	return {
		async *chat(_params) {
			const batch = chunks[callCount] ?? [];
			callCount++;
			for (const chunk of batch) {
				yield chunk;
			}
		},
	};
}

function makeToolExecutor(
	fn?: (call: ToolCallRequest, timeoutMs: number) => Promise<ToolResult>,
): ToolExecutor {
	return {
		execute: fn ?? (async (call) => ({
			callId: call.callId,
			success: true,
			content: 'tool result',
			durationMs: 50,
		})),
	};
}

async function collectEvents(
	gen: AsyncGenerator<unknown>,
): Promise<unknown[]> {
	const events = [];
	for await (const event of gen) {
		events.push(event);
	}
	return events;
}

// ─── Basic Flow Tests ───

describe('reactLoop', () => {
	describe('happy path', () => {
		it('should yield message_delta and done for text-only response', async () => {
			const provider = makeLlmProvider([
				[{ type: 'text', content: 'Hello world' }],
			]);
			const executor = makeToolExecutor();

			const events = await collectEvents(
				reactLoop({
					messages: makeMessages(),
					tools: [],
					llmProvider: provider,
					toolExecutor: executor,
					config: makeConfig(),
				}),
			);

			expect(events).toContainEqual({
				type: 'message_delta',
				content: 'Hello world',
			});
			// Last event should be done with usage
			const lastEvent = events[events.length - 1] as { type: string };
			expect(lastEvent.type).toBe('done');
		});

		it('should yield thinking_delta for thinking chunks', async () => {
			const provider = makeLlmProvider([
				[
					{ type: 'thinking', content: 'Let me think...' },
					{ type: 'text', content: 'The answer is 42' },
				],
			]);
			const executor = makeToolExecutor();

			const events = await collectEvents(
				reactLoop({
					messages: makeMessages(),
					tools: [],
					llmProvider: provider,
					toolExecutor: executor,
					config: makeConfig(),
				}),
			);

			expect(events).toContainEqual({
				type: 'thinking_delta',
				content: 'Let me think...',
			});
			expect(events).toContainEqual({
				type: 'message_delta',
				content: 'The answer is 42',
			});
		});
	});

	describe('tool execution', () => {
		it('should execute tool call and continue loop', async () => {
			const toolCall: ToolCallRequest = {
				toolName: 'code_review',
				args: { file: 'main.ts' },
				callId: 'call-1',
			};
			const provider = makeLlmProvider([
				[{ type: 'tool_call', content: toolCall }],
				[{ type: 'text', content: 'Review complete' }],
			]);
			const executor = makeToolExecutor();

			const events = await collectEvents(
				reactLoop({
					messages: makeMessages(),
					tools: [
						{
							name: 'code_review',
							description: 'Review code',
							category: 'system',
							inputSchema: {},
							requiresApproval: false,
						},
					],
					llmProvider: provider,
					toolExecutor: executor,
					config: makeConfig(),
				}),
			);

			const toolCallEvent = events.find((e) => (e as { type: string }).type === 'tool_call');
			expect(toolCallEvent).toBeDefined();
			const toolResultEvent = events.find((e) => (e as { type: string }).type === 'tool_result');
			expect(toolResultEvent).toBeDefined();
			expect(events).toContainEqual({
				type: 'message_delta',
				content: 'Review complete',
			});
		});

		it('should handle multiple tool calls in sequence', async () => {
			const call1: ToolCallRequest = {
				toolName: 'search',
				args: {},
				callId: 'c1',
			};
			const call2: ToolCallRequest = {
				toolName: 'read',
				args: {},
				callId: 'c2',
			};
			const provider = makeLlmProvider([
				[{ type: 'tool_call', content: call1 }],
				[{ type: 'tool_call', content: call2 }],
				[{ type: 'text', content: 'Done' }],
			]);
			const executor = makeToolExecutor();

			const events = await collectEvents(
				reactLoop({
					messages: makeMessages(),
					tools: [],
					llmProvider: provider,
					toolExecutor: executor,
					config: makeConfig(),
				}),
			);

			const toolResults = events.filter(
				(e) => (e as { type: string }).type === 'tool_result',
			);
			expect(toolResults).toHaveLength(2);
		});
	});

	// ─── Error Handling Tests ───

	describe('error handling', () => {
		it('should handle retryable tool error — yield error event and continue', async () => {
			const toolCall: ToolCallRequest = {
				toolName: 'flaky_tool',
				args: {},
				callId: 'c1',
			};
			const provider = makeLlmProvider([
				[{ type: 'tool_call', content: toolCall }],
				[{ type: 'text', content: 'Recovered after tool error' }],
			]);
			const executor = makeToolExecutor(async () => {
				throw new ToolError('temporary failure', 'flaky_tool', true);
			});

			const events = await collectEvents(
				reactLoop({
					messages: makeMessages(),
					tools: [],
					llmProvider: provider,
					toolExecutor: executor,
					config: makeConfig(),
				}),
			);

			const errorEvent = events.find(
				(e) => (e as { type: string }).type === 'error',
			) as { type: string; error: { code: string; isRetryable: boolean } } | undefined;
			expect(errorEvent).toBeDefined();
			expect(errorEvent?.error.code).toBe('TOOL');
			expect(errorEvent?.error.isRetryable).toBe(true);

			// Loop should continue — LLM gets another chance
			expect(events).toContainEqual({
				type: 'message_delta',
				content: 'Recovered after tool error',
			});
		});

		it('should handle permanent tool error — yield error, continue for LLM recovery', async () => {
			const toolCall: ToolCallRequest = {
				toolName: 'broken_tool',
				args: {},
				callId: 'c1',
			};
			const provider = makeLlmProvider([
				[{ type: 'tool_call', content: toolCall }],
				[{ type: 'text', content: 'I could not use that tool' }],
			]);
			const executor = makeToolExecutor(async () => {
				throw new ToolError('permanent failure', 'broken_tool', false);
			});

			const events = await collectEvents(
				reactLoop({
					messages: makeMessages(),
					tools: [],
					llmProvider: provider,
					toolExecutor: executor,
					config: makeConfig(),
				}),
			);

			const errorEvent = events.find(
				(e) => (e as { type: string }).type === 'error',
			) as { type: string; error: { isRetryable: boolean } } | undefined;
			expect(errorEvent).toBeDefined();
			expect(errorEvent?.error.isRetryable).toBe(false);

			// LLM should still get a chance to respond
			expect(events).toContainEqual({
				type: 'message_delta',
				content: 'I could not use that tool',
			});
		});

		it('should handle retryable LLM provider error — retry and succeed', async () => {
			let callCount = 0;
			const provider: LlmProvider = {
				async *chat(_params) {
					callCount++;
					if (callCount === 1) {
						throw new ProviderError('rate limited', 'anthropic', true);
					}
					yield { type: 'text', content: 'Success after retry' };
				},
			};
			const executor = makeToolExecutor();

			const events = await collectEvents(
				reactLoop({
					messages: makeMessages(),
					tools: [],
					llmProvider: provider,
					toolExecutor: executor,
					config: makeConfig({ totalTimeoutMs: 10_000 }),
				}),
			);

			expect(events).toContainEqual({
				type: 'message_delta',
				content: 'Success after retry',
			});
		});

		it('should handle permanent LLM provider error — stop loop with error', async () => {
			const provider: LlmProvider = {
				async *chat(_params) {
					throw new ProviderError('model not found', 'anthropic', false);
				},
			};
			const executor = makeToolExecutor();

			const events = await collectEvents(
				reactLoop({
					messages: makeMessages(),
					tools: [],
					llmProvider: provider,
					toolExecutor: executor,
					config: makeConfig(),
				}),
			);

			const errorEvent = events.find(
				(e) => (e as { type: string }).type === 'error',
			) as { type: string; error: { code: string } } | undefined;
			expect(errorEvent).toBeDefined();
			expect(errorEvent?.error.code).toBe('PROVIDER');

			// No message_delta should appear
			const messageDelta = events.find(
				(e) => (e as { type: string }).type === 'message_delta',
			);
			expect(messageDelta).toBeUndefined();
		});

		it('should handle unknown errors by wrapping in AxelErrorInfo', async () => {
			const provider: LlmProvider = {
				async *chat(_params) {
					throw new Error('something unexpected');
				},
			};
			const executor = makeToolExecutor();

			const events = await collectEvents(
				reactLoop({
					messages: makeMessages(),
					tools: [],
					llmProvider: provider,
					toolExecutor: executor,
					config: makeConfig(),
				}),
			);

			const errorEvent = events.find(
				(e) => (e as { type: string }).type === 'error',
			) as { type: string; error: { code: string; message: string } } | undefined;
			expect(errorEvent).toBeDefined();
			expect(errorEvent?.error.code).toBe('PERMANENT');
			expect(errorEvent?.error.message).toContain('something unexpected');
		});
	});

	// ─── Iteration Limit Tests ───

	describe('iteration limits', () => {
		it('should stop after maxIterations', async () => {
			const toolCall: ToolCallRequest = {
				toolName: 'infinite',
				args: {},
				callId: 'c1',
			};
			// Always returns a tool call — never a text response
			const provider = makeLlmProvider(
				Array.from({ length: 20 }, () => [
					{ type: 'tool_call' as const, content: toolCall },
				]),
			);
			const executor = makeToolExecutor();

			const events = await collectEvents(
				reactLoop({
					messages: makeMessages(),
					tools: [],
					llmProvider: provider,
					toolExecutor: executor,
					config: makeConfig({ maxIterations: 3 }),
				}),
			);

			const toolResults = events.filter(
				(e) => (e as { type: string }).type === 'tool_result',
			);
			expect(toolResults.length).toBeLessThanOrEqual(3);

			// Should yield a max iteration exceeded error
			const lastError = events.find(
				(e) =>
					(e as { type: string }).type === 'error' &&
					(e as { error: { message: string } }).error.message.includes('max iterations'),
			);
			expect(lastError).toBeDefined();
		});
	});

	// ─── Total Timeout Tests ───

	describe('total timeout', () => {
		it('should stop with timeout error when totalTimeoutMs exceeded', async () => {
			// LLM is slow — takes longer than total timeout
			const provider: LlmProvider = {
				async *chat(_params) {
					await new Promise((resolve) => setTimeout(resolve, 200));
					yield { type: 'text', content: 'slow response' };
				},
			};
			const executor = makeToolExecutor();

			const events = await collectEvents(
				reactLoop({
					messages: makeMessages(),
					tools: [],
					llmProvider: provider,
					toolExecutor: executor,
					config: makeConfig({ totalTimeoutMs: 50 }),
				}),
			);

			const timeoutError = events.find(
				(e) =>
					(e as { type: string }).type === 'error' &&
					(e as { error: { code: string } }).error.code === 'TIMEOUT',
			);
			expect(timeoutError).toBeDefined();
		});
	});

	// ─── Done Event ───

	describe('done event', () => {
		it('should always end with a done event containing token usage', async () => {
			const provider = makeLlmProvider([
				[{ type: 'text', content: 'Hi' }],
			]);
			const executor = makeToolExecutor();

			const events = await collectEvents(
				reactLoop({
					messages: makeMessages(),
					tools: [],
					llmProvider: provider,
					toolExecutor: executor,
					config: makeConfig(),
				}),
			);

			const lastEvent = events[events.length - 1] as {
				type: string;
				usage: { inputTokens: number; outputTokens: number };
			};
			expect(lastEvent.type).toBe('done');
			expect(lastEvent.usage).toBeDefined();
			expect(lastEvent.usage.inputTokens).toBeGreaterThanOrEqual(0);
			expect(lastEvent.usage.outputTokens).toBeGreaterThanOrEqual(0);
		});
	});

	// ─── Edge Cases ───

	describe('edge cases', () => {
		it('should handle empty LLM response (no chunks)', async () => {
			const provider = makeLlmProvider([[]]);
			const executor = makeToolExecutor();

			const events = await collectEvents(
				reactLoop({
					messages: makeMessages(),
					tools: [],
					llmProvider: provider,
					toolExecutor: executor,
					config: makeConfig(),
				}),
			);

			// Should still produce a done event
			const lastEvent = events[events.length - 1] as { type: string };
			expect(lastEvent.type).toBe('done');
		});

		it('should handle messages being empty', async () => {
			const provider = makeLlmProvider([
				[{ type: 'text', content: 'No context' }],
			]);
			const executor = makeToolExecutor();

			const events = await collectEvents(
				reactLoop({
					messages: [],
					tools: [],
					llmProvider: provider,
					toolExecutor: executor,
					config: makeConfig(),
				}),
			);

			expect(events.length).toBeGreaterThanOrEqual(1);
		});

		it('should handle tool executor returning error result (not throwing)', async () => {
			const toolCall: ToolCallRequest = {
				toolName: 'failing',
				args: {},
				callId: 'c1',
			};
			const provider = makeLlmProvider([
				[{ type: 'tool_call', content: toolCall }],
				[{ type: 'text', content: 'Tool failed gracefully' }],
			]);
			const executor = makeToolExecutor(async (call) => ({
				callId: call.callId,
				success: false,
				content: null,
				error: 'Something went wrong',
				durationMs: 10,
			}));

			const events = await collectEvents(
				reactLoop({
					messages: makeMessages(),
					tools: [],
					llmProvider: provider,
					toolExecutor: executor,
					config: makeConfig(),
				}),
			);

			// tool_result should still be yielded (with success=false)
			const toolResult = events.find(
				(e) => (e as { type: string }).type === 'tool_result',
			) as { result: ToolResult } | undefined;
			expect(toolResult).toBeDefined();
			expect(toolResult?.result.success).toBe(false);
		});
	});
});
