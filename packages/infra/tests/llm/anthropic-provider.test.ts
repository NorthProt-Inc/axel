import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LlmChatChunk, LlmChatParams } from '../../../core/src/orchestrator/types.js';
import type { ToolDefinition } from '../../../core/src/types/tool.js';

// ─── Mock Anthropic SDK Client ───

interface MockAnthropicMessage {
	id: string;
	type: string;
	role: string;
	content: Array<{
		type: string;
		text?: string;
		id?: string;
		name?: string;
		input?: Record<string, unknown>;
	}>;
	stop_reason: string | null;
}

interface MockAnthropicStream {
	[Symbol.asyncIterator](): AsyncIterator<{
		type: string;
		index?: number;
		delta?: { type: string; text?: string; partial_json?: string };
		content_block?: { type: string; id?: string; name?: string };
		message?: MockAnthropicMessage;
	}>;
}

interface MockAnthropicClient {
	messages: {
		create: ReturnType<typeof vi.fn>;
	};
}

function createMockAnthropicClient(): MockAnthropicClient {
	return {
		messages: {
			create: vi.fn(),
		},
	};
}

function makeTextStreamEvents(text: string) {
	return [
		{
			type: 'message_start',
			message: { id: 'msg_1', type: 'message', role: 'assistant', content: [], stop_reason: null },
		},
		{ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
		{ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
		{ type: 'content_block_stop', index: 0 },
		{ type: 'message_stop' },
	];
}

function makeToolCallStreamEvents(toolName: string, args: Record<string, unknown>) {
	return [
		{
			type: 'message_start',
			message: { id: 'msg_2', type: 'message', role: 'assistant', content: [], stop_reason: null },
		},
		{
			type: 'content_block_start',
			index: 0,
			content_block: { type: 'tool_use', id: 'call_1', name: toolName },
		},
		{
			type: 'content_block_delta',
			index: 0,
			delta: { type: 'input_json_delta', partial_json: JSON.stringify(args) },
		},
		{ type: 'content_block_stop', index: 0 },
		{ type: 'message_stop' },
	];
}

function makeThinkingStreamEvents(thinking: string) {
	return [
		{
			type: 'message_start',
			message: { id: 'msg_3', type: 'message', role: 'assistant', content: [], stop_reason: null },
		},
		{ type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } },
		{ type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking } },
		{ type: 'content_block_stop', index: 0 },
		{ type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } },
		{ type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: 'Final answer' } },
		{ type: 'content_block_stop', index: 1 },
		{ type: 'message_stop' },
	];
}

async function* toAsyncIterable<T>(items: T[]): AsyncIterable<T> {
	for (const item of items) {
		yield item;
	}
}

const importModule = async () => import('../../src/llm/anthropic-provider.js');

describe('AnthropicLlmProvider', () => {
	let client: MockAnthropicClient;

	beforeEach(() => {
		client = createMockAnthropicClient();
	});

	describe('chat — text streaming', () => {
		it('should yield text chunks from Anthropic stream', async () => {
			const { AnthropicLlmProvider } = await importModule();
			const provider = new AnthropicLlmProvider(client as any, {
				model: 'claude-sonnet-4-5-20250929',
				maxTokens: 4096,
			});
			client.messages.create.mockReturnValue(toAsyncIterable(makeTextStreamEvents('Hello!')));

			const chunks: LlmChatChunk[] = [];
			for await (const chunk of provider.chat({
				messages: [
					{
						sessionId: 's1',
						turnId: 1,
						role: 'user',
						content: 'Hi',
						channelId: 'cli',
						timestamp: new Date(),
						emotionalContext: '',
						metadata: {},
					},
				],
				tools: [],
			})) {
				chunks.push(chunk);
			}

			expect(chunks.some((c) => c.type === 'text' && c.content === 'Hello!')).toBe(true);
		});
	});

	describe('chat — tool calling', () => {
		it('should yield tool_call chunks with parsed arguments', async () => {
			const { AnthropicLlmProvider } = await importModule();
			const provider = new AnthropicLlmProvider(client as any, {
				model: 'claude-sonnet-4-5-20250929',
				maxTokens: 4096,
			});
			client.messages.create.mockReturnValue(
				toAsyncIterable(makeToolCallStreamEvents('read_file', { path: '/tmp/test.txt' })),
			);

			const chunks: LlmChatChunk[] = [];
			for await (const chunk of provider.chat({
				messages: [
					{
						sessionId: 's1',
						turnId: 1,
						role: 'user',
						content: 'Read file',
						channelId: 'cli',
						timestamp: new Date(),
						emotionalContext: '',
						metadata: {},
					},
				],
				tools: [
					{
						name: 'read_file',
						description: 'Read a file',
						category: 'file',
						inputSchema: {},
						requiresApproval: false,
					},
				],
			})) {
				chunks.push(chunk);
			}

			const toolChunk = chunks.find((c) => c.type === 'tool_call');
			expect(toolChunk).toBeDefined();
			if (toolChunk?.type === 'tool_call') {
				expect(toolChunk.content.toolName).toBe('read_file');
				expect(toolChunk.content.callId).toBe('call_1');
			}
		});
	});

	describe('chat — thinking', () => {
		it('should yield thinking chunks when present', async () => {
			const { AnthropicLlmProvider } = await importModule();
			const provider = new AnthropicLlmProvider(client as any, {
				model: 'claude-sonnet-4-5-20250929',
				maxTokens: 4096,
			});
			client.messages.create.mockReturnValue(
				toAsyncIterable(makeThinkingStreamEvents('Let me think...')),
			);

			const chunks: LlmChatChunk[] = [];
			for await (const chunk of provider.chat({
				messages: [
					{
						sessionId: 's1',
						turnId: 1,
						role: 'user',
						content: 'Complex question',
						channelId: 'cli',
						timestamp: new Date(),
						emotionalContext: '',
						metadata: {},
					},
				],
				tools: [],
			})) {
				chunks.push(chunk);
			}

			expect(chunks.some((c) => c.type === 'thinking')).toBe(true);
			expect(chunks.some((c) => c.type === 'text')).toBe(true);
		});
	});

	describe('chat — error handling', () => {
		it('should throw ProviderError on API failure', async () => {
			const { AnthropicLlmProvider } = await importModule();
			const provider = new AnthropicLlmProvider(client as any, {
				model: 'claude-sonnet-4-5-20250929',
				maxTokens: 4096,
			});
			client.messages.create.mockImplementation(() => {
				throw new Error('API rate limit exceeded');
			});

			const chunks: LlmChatChunk[] = [];
			await expect(async () => {
				for await (const chunk of provider.chat({
					messages: [
						{
							sessionId: 's1',
							turnId: 1,
							role: 'user',
							content: 'Hi',
							channelId: 'cli',
							timestamp: new Date(),
							emotionalContext: '',
							metadata: {},
						},
					],
					tools: [],
				})) {
					chunks.push(chunk);
				}
			}).rejects.toThrow();
		});

		it('should mark rate limit errors as retryable', async () => {
			const { AnthropicLlmProvider } = await importModule();
			const { ProviderError } = await import('../../../core/src/types/errors.js');
			const provider = new AnthropicLlmProvider(client as any, {
				model: 'claude-sonnet-4-5-20250929',
				maxTokens: 4096,
			});
			const rateLimitErr = new Error('429 rate limit');
			(rateLimitErr as any).status = 429;
			client.messages.create.mockImplementation(() => {
				throw rateLimitErr;
			});

			try {
				for await (const _ of provider.chat({
					messages: [
						{
							sessionId: 's1',
							turnId: 1,
							role: 'user',
							content: 'Hi',
							channelId: 'cli',
							timestamp: new Date(),
							emotionalContext: '',
							metadata: {},
						},
					],
					tools: [],
				})) {
					// consume
				}
				expect.unreachable('Should have thrown');
			} catch (err) {
				expect(err).toBeInstanceOf(ProviderError);
				expect((err as InstanceType<typeof ProviderError>).isRetryable).toBe(true);
			}
		});

		it('should mark 400 errors as non-retryable', async () => {
			const { AnthropicLlmProvider } = await importModule();
			const { ProviderError } = await import('../../../core/src/types/errors.js');
			const provider = new AnthropicLlmProvider(client as any, {
				model: 'claude-sonnet-4-5-20250929',
				maxTokens: 4096,
			});
			const badRequest = new Error('400 bad request');
			(badRequest as any).status = 400;
			client.messages.create.mockImplementation(() => {
				throw badRequest;
			});

			try {
				for await (const _ of provider.chat({
					messages: [
						{
							sessionId: 's1',
							turnId: 1,
							role: 'user',
							content: 'Hi',
							channelId: 'cli',
							timestamp: new Date(),
							emotionalContext: '',
							metadata: {},
						},
					],
					tools: [],
				})) {
					// consume
				}
				expect.unreachable('Should have thrown');
			} catch (err) {
				expect(err).toBeInstanceOf(ProviderError);
				expect((err as InstanceType<typeof ProviderError>).isRetryable).toBe(false);
			}
		});
	});

	describe('chat — message formatting', () => {
		it('should pass tools as Anthropic tool format', async () => {
			const { AnthropicLlmProvider } = await importModule();
			const provider = new AnthropicLlmProvider(client as any, {
				model: 'claude-sonnet-4-5-20250929',
				maxTokens: 4096,
			});
			client.messages.create.mockReturnValue(toAsyncIterable(makeTextStreamEvents('OK')));

			const tools: ToolDefinition[] = [
				{
					name: 'test_tool',
					description: 'A test tool',
					category: 'system',
					inputSchema: { type: 'object', properties: { x: { type: 'number' } } },
					requiresApproval: false,
				},
			];

			for await (const _ of provider.chat({
				messages: [
					{
						sessionId: 's1',
						turnId: 1,
						role: 'user',
						content: 'Use tool',
						channelId: 'cli',
						timestamp: new Date(),
						emotionalContext: '',
						metadata: {},
					},
				],
				tools,
			})) {
				// consume
			}

			const createArgs = client.messages.create.mock.calls[0]?.[0] as Record<string, unknown>;
			expect(createArgs.tools).toBeDefined();
			expect((createArgs.tools as any[])[0].name).toBe('test_tool');
		});

		it('should set stream: true in API call', async () => {
			const { AnthropicLlmProvider } = await importModule();
			const provider = new AnthropicLlmProvider(client as any, {
				model: 'claude-sonnet-4-5-20250929',
				maxTokens: 4096,
			});
			client.messages.create.mockReturnValue(toAsyncIterable(makeTextStreamEvents('OK')));

			for await (const _ of provider.chat({
				messages: [
					{
						sessionId: 's1',
						turnId: 1,
						role: 'user',
						content: 'Hi',
						channelId: 'cli',
						timestamp: new Date(),
						emotionalContext: '',
						metadata: {},
					},
				],
				tools: [],
			})) {
				// consume
			}

			const createArgs = client.messages.create.mock.calls[0]?.[0] as Record<string, unknown>;
			expect(createArgs.stream).toBe(true);
		});
	});
});
