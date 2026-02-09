import { describe, expect, it, vi } from 'vitest';
import { OllamaLlmProvider } from '../../src/llm/ollama-provider.js';
import type { LlmChatParams } from '@axel/core/orchestrator';
import { ProviderError } from '@axel/core/types';

/** Helper: create mock Ollama client */
function createMockClient(responses: AsyncIterable<OllamaChatChunk>): OllamaClient {
	return {
		chat: vi.fn().mockReturnValue(responses),
	};
}

/** Minimal Ollama streaming chunk */
interface OllamaChatChunk {
	readonly message?: {
		readonly role?: string;
		readonly content?: string;
		readonly tool_calls?: readonly {
			readonly function?: {
				readonly name?: string;
				readonly arguments?: Record<string, unknown>;
			};
		}[];
	};
	readonly done?: boolean;
}

/** Ollama client interface (matches ollama-provider.ts) */
interface OllamaClient {
	chat(params: Record<string, unknown>): AsyncIterable<OllamaChatChunk>;
}

function makeParams(overrides?: Partial<LlmChatParams>): LlmChatParams {
	return {
		messages: [
			{
				sessionId: 's1',
				turnId: 1,
				role: 'user',
				content: 'Hello',
				channelId: 'cli',
				timestamp: new Date(),
				emotionalContext: '',
				metadata: {},
			},
		],
		tools: [],
		...overrides,
	};
}

async function collectChunks(stream: AsyncIterable<unknown>): Promise<unknown[]> {
	const chunks: unknown[] = [];
	for await (const chunk of stream) {
		chunks.push(chunk);
	}
	return chunks;
}

async function* streamFrom<T>(items: readonly T[]): AsyncIterable<T> {
	for (const item of items) {
		yield item;
	}
}

describe('OllamaLlmProvider', () => {
	it('yields text chunks from streaming response', async () => {
		const client = createMockClient(
			streamFrom([
				{ message: { role: 'assistant', content: 'Hello' }, done: false },
				{ message: { role: 'assistant', content: ' world' }, done: false },
				{ done: true },
			]),
		);
		const provider = new OllamaLlmProvider(client, { model: 'llama3.2', baseUrl: 'http://localhost:11434' });

		const chunks = await collectChunks(provider.chat(makeParams()));

		expect(chunks).toEqual([
			{ type: 'text', content: 'Hello' },
			{ type: 'text', content: ' world' },
		]);
	});

	it('skips empty content chunks', async () => {
		const client = createMockClient(
			streamFrom([
				{ message: { role: 'assistant', content: '' }, done: false },
				{ message: { role: 'assistant', content: 'data' }, done: false },
				{ done: true },
			]),
		);
		const provider = new OllamaLlmProvider(client, { model: 'llama3.2', baseUrl: 'http://localhost:11434' });

		const chunks = await collectChunks(provider.chat(makeParams()));

		expect(chunks).toEqual([{ type: 'text', content: 'data' }]);
	});

	it('handles tool_calls from Ollama response', async () => {
		const client = createMockClient(
			streamFrom([
				{
					message: {
						role: 'assistant',
						content: '',
						tool_calls: [
							{
								function: {
									name: 'search',
									arguments: { query: 'test' },
								},
							},
						],
					},
					done: false,
				},
				{ done: true },
			]),
		);
		const provider = new OllamaLlmProvider(client, { model: 'llama3.2', baseUrl: 'http://localhost:11434' });

		const chunks = await collectChunks(provider.chat(makeParams()));

		expect(chunks).toHaveLength(1);
		expect(chunks[0]).toMatchObject({
			type: 'tool_call',
			content: {
				toolName: 'search',
				args: { query: 'test' },
			},
		});
	});

	it('builds correct request params with system message', async () => {
		const client = createMockClient(streamFrom([{ done: true }]));
		const provider = new OllamaLlmProvider(client, { model: 'llama3.2', baseUrl: 'http://localhost:11434' });

		const params = makeParams({
			messages: [
				{
					sessionId: 's1',
					turnId: 0,
					role: 'system',
					content: 'You are Axel',
					channelId: null,
					timestamp: new Date(),
					emotionalContext: '',
					metadata: {},
				},
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
		});

		await collectChunks(provider.chat(params));

		expect(client.chat).toHaveBeenCalledWith(
			expect.objectContaining({
				model: 'llama3.2',
				stream: true,
				messages: expect.arrayContaining([
					expect.objectContaining({ role: 'system', content: 'You are Axel' }),
					expect.objectContaining({ role: 'user', content: 'Hi' }),
				]),
			}),
		);
	});

	it('passes tools to Ollama in correct format', async () => {
		const client = createMockClient(streamFrom([{ done: true }]));
		const provider = new OllamaLlmProvider(client, { model: 'llama3.2', baseUrl: 'http://localhost:11434' });

		const params = makeParams({
			tools: [
				{
					name: 'search_web',
					description: 'Search the web',
					category: 'search',
					inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
					requiresApproval: false,
				},
			],
		});

		await collectChunks(provider.chat(params));

		expect(client.chat).toHaveBeenCalledWith(
			expect.objectContaining({
				tools: [
					{
						type: 'function',
						function: {
							name: 'search_web',
							description: 'Search the web',
							parameters: { type: 'object', properties: { query: { type: 'string' } } },
						},
					},
				],
			}),
		);
	});

	it('wraps client errors as ProviderError', async () => {
		const failStream = async function* () {
			throw new Error('Connection refused');
		};
		const client: OllamaClient = {
			chat: vi.fn().mockReturnValue(failStream()),
		};
		const provider = new OllamaLlmProvider(client, { model: 'llama3.2', baseUrl: 'http://localhost:11434' });

		await expect(collectChunks(provider.chat(makeParams()))).rejects.toThrow(ProviderError);
	});

	it('marks ECONNREFUSED as retryable', async () => {
		const connError = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
		const failStream = async function* () {
			throw connError;
		};
		const client: OllamaClient = {
			chat: vi.fn().mockReturnValue(failStream()),
		};
		const provider = new OllamaLlmProvider(client, { model: 'llama3.2', baseUrl: 'http://localhost:11434' });

		try {
			await collectChunks(provider.chat(makeParams()));
		} catch (e) {
			expect(e).toBeInstanceOf(ProviderError);
			expect((e as ProviderError).isRetryable).toBe(true);
		}
	});

	it('marks 500 status as retryable', async () => {
		const serverError = Object.assign(new Error('Internal Server Error'), { status: 500 });
		const failStream = async function* () {
			throw serverError;
		};
		const client: OllamaClient = {
			chat: vi.fn().mockReturnValue(failStream()),
		};
		const provider = new OllamaLlmProvider(client, { model: 'llama3.2', baseUrl: 'http://localhost:11434' });

		try {
			await collectChunks(provider.chat(makeParams()));
		} catch (e) {
			expect(e).toBeInstanceOf(ProviderError);
			expect((e as ProviderError).isRetryable).toBe(true);
		}
	});

	it('supportsVision defaults to false', () => {
		const client = createMockClient(streamFrom([]));
		const provider = new OllamaLlmProvider(client, { model: 'llama3.2', baseUrl: 'http://localhost:11434' });

		expect(provider.supportsVision).toBe(false);
	});

	it('supportsVision can be set to true for vision models', () => {
		const client = createMockClient(streamFrom([]));
		const provider = new OllamaLlmProvider(client, {
			model: 'llava',
			baseUrl: 'http://localhost:11434',
			supportsVision: true,
		});

		expect(provider.supportsVision).toBe(true);
	});

	it('handles multiple tool calls in single response', async () => {
		const client = createMockClient(
			streamFrom([
				{
					message: {
						role: 'assistant',
						content: '',
						tool_calls: [
							{ function: { name: 'search', arguments: { query: 'a' } } },
							{ function: { name: 'read', arguments: { path: '/tmp' } } },
						],
					},
					done: false,
				},
				{ done: true },
			]),
		);
		const provider = new OllamaLlmProvider(client, { model: 'llama3.2', baseUrl: 'http://localhost:11434' });

		const chunks = await collectChunks(provider.chat(makeParams()));

		expect(chunks).toHaveLength(2);
		expect(chunks[0]).toMatchObject({ type: 'tool_call', content: { toolName: 'search' } });
		expect(chunks[1]).toMatchObject({ type: 'tool_call', content: { toolName: 'read' } });
	});

	it('handles mixed content and tool calls', async () => {
		const client = createMockClient(
			streamFrom([
				{ message: { role: 'assistant', content: 'Let me search' }, done: false },
				{
					message: {
						role: 'assistant',
						content: '',
						tool_calls: [{ function: { name: 'search', arguments: { q: 'test' } } }],
					},
					done: false,
				},
				{ done: true },
			]),
		);
		const provider = new OllamaLlmProvider(client, { model: 'llama3.2', baseUrl: 'http://localhost:11434' });

		const chunks = await collectChunks(provider.chat(makeParams()));

		expect(chunks).toHaveLength(2);
		expect(chunks[0]).toMatchObject({ type: 'text', content: 'Let me search' });
		expect(chunks[1]).toMatchObject({ type: 'tool_call', content: { toolName: 'search' } });
	});

	it('generates unique callIds for tool calls', async () => {
		const client = createMockClient(
			streamFrom([
				{
					message: {
						role: 'assistant',
						content: '',
						tool_calls: [
							{ function: { name: 'a', arguments: {} } },
							{ function: { name: 'b', arguments: {} } },
						],
					},
					done: false,
				},
				{ done: true },
			]),
		);
		const provider = new OllamaLlmProvider(client, { model: 'llama3.2', baseUrl: 'http://localhost:11434' });

		const chunks = (await collectChunks(provider.chat(makeParams()))) as Array<{
			content: { callId: string };
		}>;

		const callIds = chunks.map((c) => c.content.callId);
		expect(new Set(callIds).size).toBe(2);
	});
});
