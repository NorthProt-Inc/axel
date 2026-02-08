import { CliChannel } from '@axel/channels/cli';
import type { ContextDataProvider, TokenCounter } from '@axel/core/context';
import { ContextAssembler } from '@axel/core/context';
import { createInboundHandler } from '@axel/core/orchestrator';
import { SessionRouter } from '@axel/core/orchestrator';
import type {
	LlmProvider,
	ResolvedSession,
	SessionStats,
	SessionStore,
	ToolExecutor,
	UnifiedSession,
} from '@axel/core/orchestrator';
import type { PersonaEngine } from '@axel/core/persona';
import type { InboundMessage, OutboundMessage } from '@axel/core/types';
import type { SessionSummary } from '@axel/core/types';
import type { ToolCallRequest } from '@axel/core/types';
import type { ToolResult } from '@axel/core/types';
import { describe, expect, it, vi } from 'vitest';

// ─── Mock Factories ───

function createMockSessionStore(): SessionStore {
	const session: UnifiedSession = {
		sessionId: 'e2e-session-001',
		userId: 'cli-user',
		activeChannelId: 'cli',
		channelHistory: ['cli'],
		startedAt: new Date('2026-02-08T00:00:00Z'),
		lastActivityAt: new Date('2026-02-08T00:00:00Z'),
		turnCount: 0,
	};

	const resolved: ResolvedSession = {
		session,
		isNew: true,
		channelSwitched: false,
		previousSession: null,
	};

	return {
		resolve: vi.fn().mockResolvedValue(resolved),
		updateActivity: vi.fn().mockResolvedValue(undefined),
		getActive: vi.fn().mockResolvedValue(session),
		getStats: vi.fn().mockResolvedValue({
			totalTurns: 1,
			channelBreakdown: { cli: 1 },
			avgResponseTimeMs: 100,
			toolsUsed: [],
		} satisfies SessionStats),
		end: vi.fn().mockResolvedValue({
			sessionId: 'e2e-session-001',
			summary: 'Test session',
			keyTopics: ['test'],
			emotionalTone: 'neutral',
			turnCount: 1,
			channelHistory: ['cli'],
			startedAt: new Date('2026-02-08T00:00:00Z'),
			endedAt: new Date('2026-02-08T00:01:00Z'),
		} satisfies SessionSummary),
	};
}

/**
 * Mock LLM that returns a fixed response as streaming chunks.
 *
 * Simulates the real provider behavior: yields text chunks then stops.
 */
function createMockLlmProvider(responseText: string): LlmProvider {
	return {
		chat: vi.fn().mockImplementation(async function* () {
			// Split response into 2 chunks to test stream accumulation
			const mid = Math.floor(responseText.length / 2);
			const part1 = responseText.slice(0, mid);
			const part2 = responseText.slice(mid);

			if (part1.length > 0) {
				yield { type: 'text' as const, content: part1 };
			}
			if (part2.length > 0) {
				yield { type: 'text' as const, content: part2 };
			}
		}),
	};
}

function createMockToolExecutor(): ToolExecutor {
	return {
		execute: vi.fn().mockResolvedValue({
			toolName: 'mock',
			callId: 'call-001',
			output: 'tool result',
			isError: false,
		} satisfies ToolResult),
	};
}

function createMockContextDataProvider(): ContextDataProvider {
	return {
		getWorkingMemory: vi.fn().mockResolvedValue([]),
		searchSemantic: vi.fn().mockResolvedValue([]),
		traverseGraph: vi.fn().mockResolvedValue([]),
		getSessionArchive: vi.fn().mockResolvedValue([]),
		getStreamBuffer: vi.fn().mockResolvedValue([]),
		getMetaMemory: vi.fn().mockResolvedValue([]),
		getToolDefinitions: vi.fn().mockReturnValue([]),
	};
}

function createMockTokenCounter(): TokenCounter {
	return {
		count: vi.fn().mockImplementation(async (text: string) => Math.ceil(text.length / 4)),
		estimate: vi.fn().mockImplementation((text: string) => Math.ceil(text.length / 4)),
	};
}

function createMockPersonaEngine(): PersonaEngine {
	return {
		load: vi.fn().mockResolvedValue({}),
		reload: vi.fn().mockResolvedValue({}),
		getSystemPrompt: vi.fn().mockReturnValue('You are Axel, a helpful AI assistant.'),
		evolve: vi.fn().mockResolvedValue(undefined),
		updatePreference: vi.fn().mockResolvedValue(undefined),
	};
}

/** Create a mock readline EventEmitter for CLI channel testing */
function createMockReadline() {
	const EventEmitter = require('node:events');
	const rl = new EventEmitter();
	rl.close = vi.fn();
	return rl;
}

/** Get the internal readline emitter from a CliChannel */
function getRl(cli: CliChannel): { emit: (event: string, data: string) => void } {
	return (cli as unknown as { rl: { emit: (event: string, data: string) => void } }).rl;
}

// ─── E2E Integration Tests ───

describe('E2E message roundtrip: CLI → InboundHandler → mock LLM → response', () => {
	it('delivers LLM response back to CLI channel on user message', async () => {
		// Arrange: wire full pipeline with mocks
		const expectedResponse = '안녕하세요! 저는 Axel입니다. 무엇을 도와드릴까요?';

		const sessionStore = createMockSessionStore();
		const sessionRouter = new SessionRouter(sessionStore);
		const llmProvider = createMockLlmProvider(expectedResponse);
		const toolExecutor = createMockToolExecutor();
		const dataProvider = createMockContextDataProvider();
		const tokenCounter = createMockTokenCounter();
		const contextAssembler = new ContextAssembler(dataProvider, tokenCounter);
		const personaEngine = createMockPersonaEngine();

		const handler = createInboundHandler({
			sessionRouter,
			contextAssembler,
			llmProvider,
			toolExecutor,
			personaEngine,
		});

		// Capture CLI output
		const writtenOutput: string[] = [];
		const cli = new CliChannel({
			createReadline: createMockReadline,
			write: (text: string) => writtenOutput.push(text),
			onError: (err: unknown) => {
				throw err;
			},
		});

		// Wire handler to CLI channel
		cli.onMessage(async (message: InboundMessage) => {
			const sendCallback = (target: string, msg: OutboundMessage) => cli.send(target, msg);
			await handler(message, sendCallback);
		});

		await cli.start();

		// Act: simulate user typing a line
		getRl(cli).emit('line', '안녕하세요');

		// Wait for async pipeline to complete
		await vi.waitFor(
			() => {
				expect(writtenOutput.length).toBeGreaterThan(0);
			},
			{ timeout: 5000 },
		);

		// Assert: CLI received the LLM response
		const fullOutput = writtenOutput.join('');
		expect(fullOutput).toContain(expectedResponse);

		// Assert: session was resolved
		expect(sessionStore.resolve).toHaveBeenCalledWith('cli-user', 'cli');

		// Assert: session activity was updated
		expect(sessionStore.updateActivity).toHaveBeenCalledWith('e2e-session-001');

		// Assert: LLM was called with correct message structure
		expect(llmProvider.chat).toHaveBeenCalledTimes(1);
		const chatCall = (llmProvider.chat as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
		expect(chatCall).toBeDefined();
		expect(chatCall.messages).toHaveLength(2);
		expect(chatCall.messages[0].role).toBe('system');
		expect(chatCall.messages[1].role).toBe('user');
		expect(chatCall.messages[1].content).toBe('안녕하세요');

		// Assert: context assembly was invoked
		expect(dataProvider.getWorkingMemory).toHaveBeenCalledWith('cli-user', 20);

		// Assert: persona engine provided system prompt
		expect(personaEngine.getSystemPrompt).toHaveBeenCalledWith('cli');

		await cli.stop();
	});

	it('handles multiple sequential messages in same session', async () => {
		const sessionStore = createMockSessionStore();
		const sessionRouter = new SessionRouter(sessionStore);
		const llmProvider = createMockLlmProvider('Response to message');
		const toolExecutor = createMockToolExecutor();
		const dataProvider = createMockContextDataProvider();
		const tokenCounter = createMockTokenCounter();
		const contextAssembler = new ContextAssembler(dataProvider, tokenCounter);
		const personaEngine = createMockPersonaEngine();

		const handler = createInboundHandler({
			sessionRouter,
			contextAssembler,
			llmProvider,
			toolExecutor,
			personaEngine,
		});

		const writtenOutput: string[] = [];
		const cli = new CliChannel({
			createReadline: createMockReadline,
			write: (text: string) => writtenOutput.push(text),
			onError: (err: unknown) => {
				throw err;
			},
		});

		cli.onMessage(async (message: InboundMessage) => {
			const sendCallback = (target: string, msg: OutboundMessage) => cli.send(target, msg);
			await handler(message, sendCallback);
		});

		await cli.start();

		const rl = getRl(cli);

		// First message
		rl.emit('line', 'First message');
		await vi.waitFor(
			() => {
				expect(writtenOutput.length).toBeGreaterThanOrEqual(1);
			},
			{ timeout: 5000 },
		);

		// Second message
		rl.emit('line', 'Second message');
		await vi.waitFor(
			() => {
				expect(writtenOutput.length).toBeGreaterThanOrEqual(2);
			},
			{ timeout: 5000 },
		);

		// Session resolved twice
		expect(sessionStore.resolve).toHaveBeenCalledTimes(2);

		// LLM called twice
		expect(llmProvider.chat).toHaveBeenCalledTimes(2);

		await cli.stop();
	});

	it('sends error message when LLM provider fails', async () => {
		const sessionStore = createMockSessionStore();
		const sessionRouter = new SessionRouter(sessionStore);

		// LLM that fails on first iteration (yields nothing, then error propagates via reactLoop)
		const failingLlm: LlmProvider = {
			chat: vi.fn().mockImplementation(() => {
				// Return an async iterable that throws on iteration
				return {
					[Symbol.asyncIterator]() {
						return {
							async next() {
								throw new Error('LLM API unavailable');
							},
						};
					},
				};
			}),
		};

		const toolExecutor = createMockToolExecutor();
		const dataProvider = createMockContextDataProvider();
		const tokenCounter = createMockTokenCounter();
		const contextAssembler = new ContextAssembler(dataProvider, tokenCounter);
		const personaEngine = createMockPersonaEngine();

		const handler = createInboundHandler({
			sessionRouter,
			contextAssembler,
			llmProvider: failingLlm,
			toolExecutor,
			personaEngine,
		});

		const writtenOutput: string[] = [];
		const cli = new CliChannel({
			createReadline: createMockReadline,
			write: (text: string) => writtenOutput.push(text),
			onError: (err: unknown) => {
				throw err;
			},
		});

		cli.onMessage(async (message: InboundMessage) => {
			const sendCallback = (target: string, msg: OutboundMessage) => cli.send(target, msg);
			await handler(message, sendCallback);
		});

		await cli.start();

		getRl(cli).emit('line', 'Hello');

		await vi.waitFor(
			() => {
				expect(writtenOutput.length).toBeGreaterThan(0);
			},
			{ timeout: 5000 },
		);

		// Should receive the fallback error message
		const fullOutput = writtenOutput.join('');
		expect(fullOutput).toContain('오류가 발생했습니다');

		await cli.stop();
	});

	it('sends error message when session resolution fails', async () => {
		const failingStore: SessionStore = {
			resolve: vi.fn().mockRejectedValue(new Error('DB connection lost')),
			updateActivity: vi.fn(),
			getActive: vi.fn(),
			getStats: vi.fn(),
			end: vi.fn(),
		};
		const sessionRouter = new SessionRouter(failingStore);
		const llmProvider = createMockLlmProvider('Should not reach here');
		const toolExecutor = createMockToolExecutor();
		const dataProvider = createMockContextDataProvider();
		const tokenCounter = createMockTokenCounter();
		const contextAssembler = new ContextAssembler(dataProvider, tokenCounter);
		const personaEngine = createMockPersonaEngine();

		const handler = createInboundHandler({
			sessionRouter,
			contextAssembler,
			llmProvider,
			toolExecutor,
			personaEngine,
		});

		const writtenOutput: string[] = [];
		const cli = new CliChannel({
			createReadline: createMockReadline,
			write: (text: string) => writtenOutput.push(text),
			onError: (err: unknown) => {
				throw err;
			},
		});

		cli.onMessage(async (message: InboundMessage) => {
			const sendCallback = (target: string, msg: OutboundMessage) => cli.send(target, msg);
			await handler(message, sendCallback);
		});

		await cli.start();

		getRl(cli).emit('line', 'Hello');

		await vi.waitFor(
			() => {
				expect(writtenOutput.length).toBeGreaterThan(0);
			},
			{ timeout: 5000 },
		);

		// Should receive fallback error message
		const fullOutput = writtenOutput.join('');
		expect(fullOutput).toContain('오류가 발생했습니다');

		// LLM should NOT have been called
		expect(llmProvider.chat).not.toHaveBeenCalled();

		await cli.stop();
	});

	it('verifies full context assembly pipeline feeds into LLM', async () => {
		const sessionStore = createMockSessionStore();
		const sessionRouter = new SessionRouter(sessionStore);
		const llmProvider = createMockLlmProvider('I remember your preferences.');
		const toolExecutor = createMockToolExecutor();

		// Data provider with actual data to verify context assembly
		const dataProvider = createMockContextDataProvider();
		(dataProvider.getWorkingMemory as ReturnType<typeof vi.fn>).mockResolvedValue([
			{ role: 'user', content: 'Previous message' },
			{ role: 'assistant', content: 'Previous response' },
		]);
		(dataProvider.searchSemantic as ReturnType<typeof vi.fn>).mockResolvedValue([
			{
				score: 0.95,
				memory: {
					id: 'mem-1',
					type: 'fact',
					content: 'User prefers Korean language',
					importance: 0.8,
					embedding: new Float32Array(0),
					channelMentions: {},
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			},
		]);

		const tokenCounter = createMockTokenCounter();
		const contextAssembler = new ContextAssembler(dataProvider, tokenCounter);
		const personaEngine = createMockPersonaEngine();

		const handler = createInboundHandler({
			sessionRouter,
			contextAssembler,
			llmProvider,
			toolExecutor,
			personaEngine,
		});

		const writtenOutput: string[] = [];
		const cli = new CliChannel({
			createReadline: createMockReadline,
			write: (text: string) => writtenOutput.push(text),
			onError: (err: unknown) => {
				throw err;
			},
		});

		cli.onMessage(async (message: InboundMessage) => {
			const sendCallback = (target: string, msg: OutboundMessage) => cli.send(target, msg);
			await handler(message, sendCallback);
		});

		await cli.start();

		getRl(cli).emit('line', 'Do you remember my preferences?');

		await vi.waitFor(
			() => {
				expect(writtenOutput.length).toBeGreaterThan(0);
			},
			{ timeout: 5000 },
		);

		// Verify context data providers were queried
		expect(dataProvider.getWorkingMemory).toHaveBeenCalledWith('cli-user', 20);
		expect(dataProvider.searchSemantic).toHaveBeenCalledWith('Do you remember my preferences?', 10);
		expect(dataProvider.getSessionArchive).toHaveBeenCalledWith('cli-user', 30);
		expect(dataProvider.getStreamBuffer).toHaveBeenCalledWith('cli-user');
		expect(dataProvider.getMetaMemory).toHaveBeenCalledWith('cli-user');

		// Verify LLM received enriched context (system message includes assembled context)
		const chatCall = (llmProvider.chat as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
		const systemMsg = chatCall.messages[0];
		expect(systemMsg.role).toBe('system');
		// System prompt should contain working memory and semantic context
		expect(systemMsg.content).toContain('Previous message');
		expect(systemMsg.content).toContain('User prefers Korean language');

		// Response delivered
		const fullOutput = writtenOutput.join('');
		expect(fullOutput).toContain('I remember your preferences.');

		await cli.stop();
	});

	it('ignores empty input lines (CLI behavior)', async () => {
		const sessionStore = createMockSessionStore();
		const sessionRouter = new SessionRouter(sessionStore);
		const llmProvider = createMockLlmProvider('Response');
		const toolExecutor = createMockToolExecutor();
		const dataProvider = createMockContextDataProvider();
		const tokenCounter = createMockTokenCounter();
		const contextAssembler = new ContextAssembler(dataProvider, tokenCounter);
		const personaEngine = createMockPersonaEngine();

		const handler = createInboundHandler({
			sessionRouter,
			contextAssembler,
			llmProvider,
			toolExecutor,
			personaEngine,
		});

		const writtenOutput: string[] = [];
		const cli = new CliChannel({
			createReadline: createMockReadline,
			write: (text: string) => writtenOutput.push(text),
			onError: (err: unknown) => {
				throw err;
			},
		});

		cli.onMessage(async (message: InboundMessage) => {
			const sendCallback = (target: string, msg: OutboundMessage) => cli.send(target, msg);
			await handler(message, sendCallback);
		});

		await cli.start();

		const rl = getRl(cli);

		// Empty and whitespace-only lines should be ignored by CLI channel
		rl.emit('line', '');
		rl.emit('line', '   ');

		// Give it a moment — these should NOT trigger any handler call
		await new Promise((resolve) => setTimeout(resolve, 100));

		expect(sessionStore.resolve).not.toHaveBeenCalled();
		expect(llmProvider.chat).not.toHaveBeenCalled();
		expect(writtenOutput).toHaveLength(0);

		await cli.stop();
	});

	it('processes LLM response that arrives as single chunk', async () => {
		const sessionStore = createMockSessionStore();
		const sessionRouter = new SessionRouter(sessionStore);

		// Single-chunk LLM
		const singleChunkLlm: LlmProvider = {
			chat: vi.fn().mockImplementation(async function* () {
				yield { type: 'text' as const, content: 'Single chunk response' };
			}),
		};

		const toolExecutor = createMockToolExecutor();
		const dataProvider = createMockContextDataProvider();
		const tokenCounter = createMockTokenCounter();
		const contextAssembler = new ContextAssembler(dataProvider, tokenCounter);
		const personaEngine = createMockPersonaEngine();

		const handler = createInboundHandler({
			sessionRouter,
			contextAssembler,
			llmProvider: singleChunkLlm,
			toolExecutor,
			personaEngine,
		});

		const writtenOutput: string[] = [];
		const cli = new CliChannel({
			createReadline: createMockReadline,
			write: (text: string) => writtenOutput.push(text),
			onError: (err: unknown) => {
				throw err;
			},
		});

		cli.onMessage(async (message: InboundMessage) => {
			const sendCallback = (target: string, msg: OutboundMessage) => cli.send(target, msg);
			await handler(message, sendCallback);
		});

		await cli.start();

		getRl(cli).emit('line', 'Hello');

		await vi.waitFor(
			() => {
				expect(writtenOutput.length).toBeGreaterThan(0);
			},
			{ timeout: 5000 },
		);

		const fullOutput = writtenOutput.join('');
		expect(fullOutput).toContain('Single chunk response');

		await cli.stop();
	});

	it('channel.send delivers outbound message with markdown format', async () => {
		const sessionStore = createMockSessionStore();
		const sessionRouter = new SessionRouter(sessionStore);
		const llmProvider = createMockLlmProvider('**Bold** response');
		const toolExecutor = createMockToolExecutor();
		const dataProvider = createMockContextDataProvider();
		const tokenCounter = createMockTokenCounter();
		const contextAssembler = new ContextAssembler(dataProvider, tokenCounter);
		const personaEngine = createMockPersonaEngine();

		// Use send spy to check OutboundMessage shape
		const sentMessages: OutboundMessage[] = [];

		const handler = createInboundHandler({
			sessionRouter,
			contextAssembler,
			llmProvider,
			toolExecutor,
			personaEngine,
		});

		const writtenOutput: string[] = [];
		const cli = new CliChannel({
			createReadline: createMockReadline,
			write: (text: string) => writtenOutput.push(text),
			onError: (err: unknown) => {
				throw err;
			},
		});

		cli.onMessage(async (message: InboundMessage) => {
			const sendCallback = async (target: string, msg: OutboundMessage) => {
				sentMessages.push(msg);
				await cli.send(target, msg);
			};
			await handler(message, sendCallback);
		});

		await cli.start();

		getRl(cli).emit('line', 'Hello');

		await vi.waitFor(
			() => {
				expect(sentMessages.length).toBeGreaterThan(0);
			},
			{ timeout: 5000 },
		);

		// InboundHandler sends with markdown format
		expect(sentMessages[0]?.format).toBe('markdown');
		expect(sentMessages[0]?.content).toBe('**Bold** response');

		await cli.stop();
	});
});
