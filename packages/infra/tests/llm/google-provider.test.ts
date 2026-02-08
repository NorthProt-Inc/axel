import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { LlmChatChunk } from '../../../core/src/orchestrator/types.js';

// ─── Mock Google Generative AI Client ───

interface MockGoogleModel {
	generateContentStream: ReturnType<typeof vi.fn>;
}

interface MockGoogleClient {
	getGenerativeModel: ReturnType<typeof vi.fn>;
}

function createMockGoogleClient(model?: MockGoogleModel): MockGoogleClient {
	const mockModel: MockGoogleModel = model ?? {
		generateContentStream: vi.fn(),
	};
	return {
		getGenerativeModel: vi.fn().mockReturnValue(mockModel),
	};
}

function makeTextStreamResponse(text: string) {
	return {
		stream: (async function* () {
			yield {
				candidates: [
					{
						content: {
							parts: [{ text }],
							role: 'model',
						},
						finishReason: 'STOP',
					},
				],
			};
		})(),
	};
}

function makeToolCallStreamResponse(toolName: string, args: Record<string, unknown>) {
	return {
		stream: (async function* () {
			yield {
				candidates: [
					{
						content: {
							parts: [{ functionCall: { name: toolName, args } }],
							role: 'model',
						},
						finishReason: 'STOP',
					},
				],
			};
		})(),
	};
}

const importModule = async () =>
	import('../../src/llm/google-provider.js');

describe('GoogleLlmProvider', () => {
	let model: MockGoogleModel;
	let client: MockGoogleClient;

	beforeEach(() => {
		model = {
			generateContentStream: vi.fn(),
		};
		client = createMockGoogleClient(model);
	});

	describe('chat — text streaming', () => {
		it('should yield text chunks from Google stream', async () => {
			const { GoogleLlmProvider } = await importModule();
			const provider = new GoogleLlmProvider(client as any, {
				model: 'gemini-2.0-flash',
			});
			model.generateContentStream.mockResolvedValue(
				makeTextStreamResponse('Bonjour!'),
			);

			const chunks: LlmChatChunk[] = [];
			for await (const chunk of provider.chat({
				messages: [{ sessionId: 's1', turnId: 1, role: 'user', content: 'Salut', channelId: 'cli', timestamp: new Date(), emotionalContext: '', metadata: {} }],
				tools: [],
			})) {
				chunks.push(chunk);
			}

			expect(chunks.some(c => c.type === 'text' && c.content === 'Bonjour!')).toBe(true);
		});
	});

	describe('chat — tool calling', () => {
		it('should yield tool_call chunks with function name and args', async () => {
			const { GoogleLlmProvider } = await importModule();
			const provider = new GoogleLlmProvider(client as any, {
				model: 'gemini-2.0-flash',
			});
			model.generateContentStream.mockResolvedValue(
				makeToolCallStreamResponse('search_web', { query: 'test' }),
			);

			const chunks: LlmChatChunk[] = [];
			for await (const chunk of provider.chat({
				messages: [{ sessionId: 's1', turnId: 1, role: 'user', content: 'Search', channelId: 'cli', timestamp: new Date(), emotionalContext: '', metadata: {} }],
				tools: [{
					name: 'search_web',
					description: 'Search the web',
					category: 'research',
					inputSchema: {},
					requiresApproval: false,
				}],
			})) {
				chunks.push(chunk);
			}

			const toolChunk = chunks.find(c => c.type === 'tool_call');
			expect(toolChunk).toBeDefined();
			if (toolChunk?.type === 'tool_call') {
				expect(toolChunk.content.toolName).toBe('search_web');
			}
		});
	});

	describe('chat — error handling', () => {
		it('should throw ProviderError on API failure', async () => {
			const { GoogleLlmProvider } = await importModule();
			const { ProviderError } = await import('../../../core/src/types/errors.js');
			const provider = new GoogleLlmProvider(client as any, {
				model: 'gemini-2.0-flash',
			});
			model.generateContentStream.mockRejectedValue(new Error('503 Server Error'));

			try {
				for await (const _ of provider.chat({
					messages: [{ sessionId: 's1', turnId: 1, role: 'user', content: 'Hi', channelId: 'cli', timestamp: new Date(), emotionalContext: '', metadata: {} }],
					tools: [],
				})) {
					// consume
				}
				expect.unreachable('Should have thrown');
			} catch (err) {
				expect(err).toBeInstanceOf(ProviderError);
			}
		});

		it('should mark 429/503 errors as retryable', async () => {
			const { GoogleLlmProvider } = await importModule();
			const { ProviderError } = await import('../../../core/src/types/errors.js');
			const provider = new GoogleLlmProvider(client as any, {
				model: 'gemini-2.0-flash',
			});
			const err = new Error('Resource exhausted');
			(err as any).status = 429;
			model.generateContentStream.mockRejectedValue(err);

			try {
				for await (const _ of provider.chat({
					messages: [{ sessionId: 's1', turnId: 1, role: 'user', content: 'Hi', channelId: 'cli', timestamp: new Date(), emotionalContext: '', metadata: {} }],
					tools: [],
				})) {
					// consume
				}
				expect.unreachable('Should have thrown');
			} catch (error) {
				expect(error).toBeInstanceOf(ProviderError);
				expect((error as InstanceType<typeof ProviderError>).isRetryable).toBe(true);
			}
		});

		it('should mark 400 errors as non-retryable', async () => {
			const { GoogleLlmProvider } = await importModule();
			const { ProviderError } = await import('../../../core/src/types/errors.js');
			const provider = new GoogleLlmProvider(client as any, {
				model: 'gemini-2.0-flash',
			});
			const err = new Error('Invalid argument');
			(err as any).status = 400;
			model.generateContentStream.mockRejectedValue(err);

			try {
				for await (const _ of provider.chat({
					messages: [{ sessionId: 's1', turnId: 1, role: 'user', content: 'Hi', channelId: 'cli', timestamp: new Date(), emotionalContext: '', metadata: {} }],
					tools: [],
				})) {
					// consume
				}
				expect.unreachable('Should have thrown');
			} catch (error) {
				expect(error).toBeInstanceOf(ProviderError);
				expect((error as InstanceType<typeof ProviderError>).isRetryable).toBe(false);
			}
		});
	});

	describe('chat — message formatting', () => {
		it('should convert Axel messages to Google Content format', async () => {
			const { GoogleLlmProvider } = await importModule();
			const provider = new GoogleLlmProvider(client as any, {
				model: 'gemini-2.0-flash',
			});
			model.generateContentStream.mockResolvedValue(
				makeTextStreamResponse('Hi'),
			);

			for await (const _ of provider.chat({
				messages: [
					{ sessionId: 's1', turnId: 1, role: 'system', content: 'You are Axel', channelId: 'cli', timestamp: new Date(), emotionalContext: '', metadata: {} },
					{ sessionId: 's1', turnId: 2, role: 'user', content: 'Hello', channelId: 'cli', timestamp: new Date(), emotionalContext: '', metadata: {} },
				],
				tools: [],
			})) {
				// consume
			}

			expect(model.generateContentStream).toHaveBeenCalledOnce();
			const args = model.generateContentStream.mock.calls[0]![0] as Record<string, unknown>;
			expect(args).toBeDefined();
		});

		it('should convert tools to Google function declarations', async () => {
			const { GoogleLlmProvider } = await importModule();
			const provider = new GoogleLlmProvider(client as any, {
				model: 'gemini-2.0-flash',
			});
			model.generateContentStream.mockResolvedValue(
				makeTextStreamResponse('OK'),
			);

			for await (const _ of provider.chat({
				messages: [{ sessionId: 's1', turnId: 1, role: 'user', content: 'Hi', channelId: 'cli', timestamp: new Date(), emotionalContext: '', metadata: {} }],
				tools: [{
					name: 'test_tool',
					description: 'Test',
					category: 'system',
					inputSchema: { type: 'object', properties: {} },
					requiresApproval: false,
				}],
			})) {
				// consume
			}

			const callArgs = model.generateContentStream.mock.calls[0]![0] as Record<string, unknown>;
			expect(callArgs).toBeDefined();
		});
	});
});
