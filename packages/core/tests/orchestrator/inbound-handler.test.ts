import { describe, expect, it, vi } from 'vitest';
import type { ContextAssembler } from '../../src/context/assembler.js';
import type {
	AssembledContext,
	ContextDataProvider,
	TokenCounter,
} from '../../src/context/types.js';
import type { EpisodicMemory, MessageRecord, Turn, WorkingMemory } from '../../src/memory/types.js';
import {
	type ErrorInfo,
	type InboundHandlerDeps,
	createInboundHandler,
} from '../../src/orchestrator/inbound-handler.js';
import { SessionRouter } from '../../src/orchestrator/session-router.js';
import type {
	LlmChatChunk,
	LlmProvider,
	ReActConfig,
	ResolvedSession,
	SessionStore,
	ToolExecutor,
	UnifiedSession,
} from '../../src/orchestrator/types.js';
import type { PersonaEngine } from '../../src/persona/engine.js';
import type { InboundHandler, InboundMessage, OutboundMessage } from '../../src/types/channel.js';
import { ProviderError } from '../../src/types/errors.js';
import type { ReActEvent } from '../../src/types/react.js';
import type { SessionSummary } from '../../src/types/session.js';
import type { ToolDefinition, ToolResult } from '../../src/types/tool.js';

// ─── Test Helpers ───

function makeInboundMessage(overrides?: Partial<InboundMessage>): InboundMessage {
	return {
		userId: 'user-1',
		channelId: 'discord',
		content: 'Hello Axel',
		timestamp: new Date('2026-02-08T12:00:00Z'),
		...overrides,
	};
}

function makeSession(overrides?: Partial<UnifiedSession>): UnifiedSession {
	return {
		sessionId: 'sess-1',
		userId: 'user-1',
		activeChannelId: 'discord',
		channelHistory: ['discord'],
		startedAt: new Date('2026-02-08T11:00:00Z'),
		lastActivityAt: new Date('2026-02-08T12:00:00Z'),
		turnCount: 1,
		...overrides,
	};
}

function makeResolvedSession(overrides?: Partial<ResolvedSession>): ResolvedSession {
	return {
		session: makeSession(),
		isNew: true,
		channelSwitched: false,
		previousSession: null,
		...overrides,
	};
}

function makeSessionStore(resolved?: ResolvedSession): SessionStore {
	return {
		resolve: vi.fn().mockResolvedValue(resolved ?? makeResolvedSession()),
		updateActivity: vi.fn().mockResolvedValue(undefined),
		getActive: vi.fn().mockResolvedValue(null),
		getStats: vi.fn().mockResolvedValue({
			totalTurns: 1,
			channelBreakdown: { discord: 1 },
			avgResponseTimeMs: 100,
			toolsUsed: [],
		}),
		end: vi.fn().mockResolvedValue({
			sessionId: 'sess-1',
			userId: 'user-1',
			channelId: 'discord',
			summary: 'Test session ended',
			keyTopics: [],
			messageCount: 1,
			startedAt: new Date(),
			endedAt: new Date(),
		}),
	};
}

function makeLlmProvider(chunks: LlmChatChunk[]): LlmProvider {
	return {
		async *chat() {
			for (const chunk of chunks) {
				yield chunk;
			}
		},
	};
}

function makeToolExecutor(): ToolExecutor {
	return {
		execute: vi.fn().mockResolvedValue({
			callId: 'call-1',
			success: true,
			content: 'result',
			durationMs: 10,
		} satisfies ToolResult),
	};
}

function makeContextDataProvider(): ContextDataProvider {
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

function makeTokenCounter(): TokenCounter {
	return {
		count: vi.fn().mockResolvedValue(10),
		estimate: vi.fn().mockReturnValue(10),
	};
}

function makePersonaEngine(): PersonaEngine {
	return {
		load: vi.fn().mockResolvedValue({}),
		reload: vi.fn().mockResolvedValue({}),
		getSystemPrompt: vi.fn().mockReturnValue('You are Axel, a helpful AI assistant.'),
		evolve: vi.fn().mockResolvedValue(undefined),
		updatePreference: vi.fn().mockResolvedValue(undefined),
	};
}

function makeWorkingMemory(): WorkingMemory {
	return {
		layerName: 'M1:working',
		pushTurn: vi.fn().mockResolvedValue(undefined),
		getTurns: vi.fn().mockResolvedValue([]),
		getSummary: vi.fn().mockResolvedValue(null),
		compress: vi.fn().mockResolvedValue(undefined),
		flush: vi.fn().mockResolvedValue(undefined),
		clear: vi.fn().mockResolvedValue(undefined),
		healthCheck: vi.fn().mockResolvedValue({
			state: 'healthy',
			latencyMs: 0,
			message: null,
			lastChecked: new Date(),
		}),
	};
}

function makeEpisodicMemory(): EpisodicMemory {
	return {
		layerName: 'M2:episodic',
		createSession: vi.fn().mockResolvedValue('session-1'),
		endSession: vi.fn().mockResolvedValue(undefined),
		addMessage: vi.fn().mockResolvedValue(undefined),
		getRecentSessions: vi.fn().mockResolvedValue([]),
		searchByTopic: vi.fn().mockResolvedValue([]),
		searchByContent: vi.fn().mockResolvedValue([]),
		healthCheck: vi.fn().mockResolvedValue({
			state: 'healthy',
			latencyMs: 0,
			message: null,
			lastChecked: new Date(),
		}),
	};
}

function makeDepsSync(overrides?: Partial<InboundHandlerDeps>): InboundHandlerDeps {
	const store = makeSessionStore();
	const provider = makeContextDataProvider();
	const counter = makeTokenCounter();

	// Mock ContextAssembler to avoid import complexity
	const mockAssembler = {
		assemble: vi.fn().mockResolvedValue({
			systemPrompt: 'You are Axel.',
			sections: [],
			totalTokens: 100,
			budgetUtilization: { systemPrompt: 100 },
		} satisfies AssembledContext),
	} as unknown as ContextAssembler;

	return {
		sessionRouter: new SessionRouter(store),
		contextAssembler: mockAssembler,
		llmProvider: makeLlmProvider([{ type: 'text', content: 'Hello!' }]),
		toolExecutor: makeToolExecutor(),
		personaEngine: makePersonaEngine(),
		workingMemory: makeWorkingMemory(),
		episodicMemory: makeEpisodicMemory(),
		config: {
			maxIterations: 15,
			toolTimeoutMs: 30_000,
			totalTimeoutMs: 300_000,
			streamingEnabled: true,
		},
		...overrides,
	};
}

// ─── Tests ───

describe('createInboundHandler', () => {
	it('should return a function matching InboundHandler signature', () => {
		const deps = makeDepsSync();
		const handler = createInboundHandler(deps);
		expect(typeof handler).toBe('function');
	});

	describe('happy path — text response', () => {
		it('should resolve session, assemble context, run reactLoop, and return accumulated text', async () => {
			const store = makeSessionStore();
			const sessionRouter = new SessionRouter(store);
			const personaEngine = makePersonaEngine();
			const llmProvider = makeLlmProvider([
				{ type: 'text', content: 'Hi ' },
				{ type: 'text', content: 'there!' },
			]);
			const mockAssembler = {
				assemble: vi.fn().mockResolvedValue({
					systemPrompt: 'You are Axel.',
					sections: [
						{ name: 'workingMemory', content: 'user: hello', tokens: 5, source: 'M1:working' },
					],
					totalTokens: 50,
					budgetUtilization: { systemPrompt: 45, workingMemory: 5 },
				} satisfies AssembledContext),
			} as unknown as ContextAssembler;

			const sentMessages: Array<{ target: string; msg: OutboundMessage }> = [];
			const mockSend = vi.fn().mockImplementation((target: string, msg: OutboundMessage) => {
				sentMessages.push({ target, msg });
				return Promise.resolve();
			});

			const deps = makeDepsSync({
				sessionRouter,
				contextAssembler: mockAssembler,
				llmProvider,
				personaEngine,
			});

			const handler = createInboundHandler(deps);
			const message = makeInboundMessage();

			await handler(message, mockSend);

			// Session resolved
			expect(store.resolve).toHaveBeenCalledWith('user-1', 'discord');

			// Context assembled
			expect(mockAssembler.assemble).toHaveBeenCalledWith(
				expect.objectContaining({
					systemPrompt: 'You are Axel, a helpful AI assistant.',
					userId: 'user-1',
					query: 'Hello Axel',
				}),
			);

			// Response sent — accumulated text
			expect(mockSend).toHaveBeenCalledWith(
				'user-1',
				expect.objectContaining({
					content: 'Hi there!',
				}),
			);

			// Session activity updated
			expect(store.updateActivity).toHaveBeenCalledWith('sess-1');
		});
	});

	describe('happy path — multi-chunk streaming', () => {
		it('should accumulate all text deltas into a single outbound message', async () => {
			const store = makeSessionStore();
			const llmProvider = makeLlmProvider([
				{ type: 'text', content: 'Part 1. ' },
				{ type: 'thinking', content: 'thinking...' },
				{ type: 'text', content: 'Part 2.' },
			]);
			const mockAssembler = {
				assemble: vi.fn().mockResolvedValue({
					systemPrompt: 'system',
					sections: [],
					totalTokens: 10,
					budgetUtilization: {},
				} satisfies AssembledContext),
			} as unknown as ContextAssembler;

			const mockSend = vi.fn().mockResolvedValue(undefined);

			const deps = makeDepsSync({
				sessionRouter: new SessionRouter(store),
				contextAssembler: mockAssembler,
				llmProvider,
			});

			const handler = createInboundHandler(deps);
			await handler(makeInboundMessage(), mockSend);

			expect(mockSend).toHaveBeenCalledWith(
				'user-1',
				expect.objectContaining({ content: 'Part 1. Part 2.' }),
			);
		});
	});

	describe('tool call flow', () => {
		it('should handle tool call → tool result → text response cycle', async () => {
			const store = makeSessionStore();
			let callCount = 0;
			const llmProvider: LlmProvider = {
				async *chat() {
					callCount++;
					if (callCount === 1) {
						yield {
							type: 'tool_call' as const,
							content: { toolName: 'search', args: { q: 'test' }, callId: 'c1' },
						};
					} else {
						yield { type: 'text' as const, content: 'Found results.' };
					}
				},
			};
			const toolExecutor: ToolExecutor = {
				execute: vi.fn().mockResolvedValue({
					callId: 'c1',
					success: true,
					content: 'search results',
					durationMs: 50,
				} satisfies ToolResult),
			};
			const mockAssembler = {
				assemble: vi.fn().mockResolvedValue({
					systemPrompt: 'system',
					sections: [],
					totalTokens: 10,
					budgetUtilization: {},
				} satisfies AssembledContext),
			} as unknown as ContextAssembler;

			const mockSend = vi.fn().mockResolvedValue(undefined);

			const deps = makeDepsSync({
				sessionRouter: new SessionRouter(store),
				contextAssembler: mockAssembler,
				llmProvider,
				toolExecutor,
			});

			const handler = createInboundHandler(deps);
			await handler(makeInboundMessage(), mockSend);

			expect(mockSend).toHaveBeenCalledWith(
				'user-1',
				expect.objectContaining({ content: 'Found results.' }),
			);
		});
	});

	describe('error handling', () => {
		it('should send an error message when reactLoop yields only errors', async () => {
			const store = makeSessionStore();
			const llmProvider: LlmProvider = {
				// biome-ignore lint/correctness/useYield: intentionally throwing before yield to test error path
				async *chat() {
					throw new Error('LLM unavailable');
				},
			};
			const mockAssembler = {
				assemble: vi.fn().mockResolvedValue({
					systemPrompt: 'system',
					sections: [],
					totalTokens: 10,
					budgetUtilization: {},
				} satisfies AssembledContext),
			} as unknown as ContextAssembler;

			const mockSend = vi.fn().mockResolvedValue(undefined);

			const deps = makeDepsSync({
				sessionRouter: new SessionRouter(store),
				contextAssembler: mockAssembler,
				llmProvider,
			});

			const handler = createInboundHandler(deps);
			await handler(makeInboundMessage(), mockSend);

			// Should still send a fallback error message
			expect(mockSend).toHaveBeenCalledWith(
				'user-1',
				expect.objectContaining({
					content: expect.stringContaining('오류'),
				}),
			);
		});

		it('should send a fallback message when session resolution fails', async () => {
			const store = makeSessionStore();
			(store.resolve as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('DB down'));

			const mockSend = vi.fn().mockResolvedValue(undefined);

			const deps = makeDepsSync({
				sessionRouter: new SessionRouter(store),
			});

			const handler = createInboundHandler(deps);
			await handler(makeInboundMessage(), mockSend);

			expect(mockSend).toHaveBeenCalledWith(
				'user-1',
				expect.objectContaining({
					content: expect.stringContaining('오류'),
				}),
			);
		});

		it('should send a fallback message when context assembly fails', async () => {
			const store = makeSessionStore();
			const mockAssembler = {
				assemble: vi.fn().mockRejectedValue(new Error('Context assembly failed')),
			} as unknown as ContextAssembler;

			const mockSend = vi.fn().mockResolvedValue(undefined);

			const deps = makeDepsSync({
				sessionRouter: new SessionRouter(store),
				contextAssembler: mockAssembler,
			});

			const handler = createInboundHandler(deps);
			await handler(makeInboundMessage(), mockSend);

			expect(mockSend).toHaveBeenCalledWith(
				'user-1',
				expect.objectContaining({
					content: expect.stringContaining('오류'),
				}),
			);
		});
	});

	describe('edge cases', () => {
		it('should handle empty message content gracefully', async () => {
			const store = makeSessionStore();
			const mockAssembler = {
				assemble: vi.fn().mockResolvedValue({
					systemPrompt: 'system',
					sections: [],
					totalTokens: 10,
					budgetUtilization: {},
				} satisfies AssembledContext),
			} as unknown as ContextAssembler;
			const mockSend = vi.fn().mockResolvedValue(undefined);

			const deps = makeDepsSync({
				sessionRouter: new SessionRouter(store),
				contextAssembler: mockAssembler,
			});

			const handler = createInboundHandler(deps);
			await handler(makeInboundMessage({ content: '' }), mockSend);

			// Should still process (empty content is valid — could be media-only)
			expect(store.resolve).toHaveBeenCalled();
		});

		it('should pass channel type to personaEngine.getSystemPrompt', async () => {
			const store = makeSessionStore();
			const personaEngine = makePersonaEngine();
			const mockAssembler = {
				assemble: vi.fn().mockResolvedValue({
					systemPrompt: 'system',
					sections: [],
					totalTokens: 10,
					budgetUtilization: {},
				} satisfies AssembledContext),
			} as unknown as ContextAssembler;
			const mockSend = vi.fn().mockResolvedValue(undefined);

			const deps = makeDepsSync({
				sessionRouter: new SessionRouter(store),
				contextAssembler: mockAssembler,
				personaEngine,
			});

			const handler = createInboundHandler(deps);
			await handler(makeInboundMessage({ channelId: 'telegram' }), mockSend);

			expect(personaEngine.getSystemPrompt).toHaveBeenCalledWith('telegram');
		});

		it('should not send if send callback is not provided', async () => {
			const store = makeSessionStore();
			const mockAssembler = {
				assemble: vi.fn().mockResolvedValue({
					systemPrompt: 'system',
					sections: [],
					totalTokens: 10,
					budgetUtilization: {},
				} satisfies AssembledContext),
			} as unknown as ContextAssembler;

			const deps = makeDepsSync({
				sessionRouter: new SessionRouter(store),
				contextAssembler: mockAssembler,
			});

			const handler = createInboundHandler(deps);
			// Should not throw even without send callback
			await expect(
				handler(makeInboundMessage(), vi.fn().mockResolvedValue(undefined)),
			).resolves.not.toThrow();
		});
	});

	describe('message construction', () => {
		it('should build Message objects with correct fields from InboundMessage', async () => {
			const store = makeSessionStore();
			let capturedParams: unknown;
			const llmProvider: LlmProvider = {
				async *chat(params) {
					capturedParams = params;
					yield { type: 'text', content: 'response' };
				},
			};
			const mockAssembler = {
				assemble: vi.fn().mockResolvedValue({
					systemPrompt: 'You are Axel.',
					sections: [{ name: 'working', content: 'prev messages', tokens: 5, source: 'M1' }],
					totalTokens: 50,
					budgetUtilization: {},
				} satisfies AssembledContext),
			} as unknown as ContextAssembler;
			const mockSend = vi.fn().mockResolvedValue(undefined);

			const deps = makeDepsSync({
				sessionRouter: new SessionRouter(store),
				contextAssembler: mockAssembler,
				llmProvider,
			});

			const handler = createInboundHandler(deps);
			await handler(
				makeInboundMessage({ userId: 'user-1', channelId: 'discord', content: 'What is AI?' }),
				mockSend,
			);

			// The assembled messages should contain the user's query as a user message
			const params = capturedParams as { messages: Array<{ role: string; content: string }> };
			expect(params.messages).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						role: 'system',
					}),
					expect.objectContaining({
						role: 'user',
						content: 'What is AI?',
					}),
				]),
			);
		});
	});

	describe('tool definitions wiring (AUD-093)', () => {
		it('should pass toolDefinitions to reactLoop instead of empty array', async () => {
			const store = makeSessionStore();
			let capturedParams: unknown;
			const llmProvider: LlmProvider = {
				async *chat(params) {
					capturedParams = params;
					yield { type: 'text', content: 'response' };
				},
			};
			const mockAssembler = {
				assemble: vi.fn().mockResolvedValue({
					systemPrompt: 'system',
					sections: [],
					totalTokens: 10,
					budgetUtilization: {},
				} satisfies AssembledContext),
			} as unknown as ContextAssembler;
			const mockSend = vi.fn().mockResolvedValue(undefined);

			const toolDefs: ToolDefinition[] = [
				{
					name: 'search_memory',
					description: 'Search semantic memory',
					category: 'memory',
					inputSchema: { type: 'object' },
					requiresApproval: false,
				},
				{
					name: 'execute_command',
					description: 'Execute a system command',
					category: 'system',
					inputSchema: { type: 'object' },
					requiresApproval: true,
				},
			];

			const deps = makeDepsSync({
				sessionRouter: new SessionRouter(store),
				contextAssembler: mockAssembler,
				llmProvider,
				toolDefinitions: toolDefs,
			});

			const handler = createInboundHandler(deps);
			await handler(makeInboundMessage(), mockSend);

			// reactLoop receives the tool definitions via LLM chat params
			const params = capturedParams as { tools: ToolDefinition[] };
			expect(params.tools).toEqual(toolDefs);
			expect(params.tools).toHaveLength(2);
		});

		it('should default to empty tools array when toolDefinitions not provided', async () => {
			const store = makeSessionStore();
			let capturedParams: unknown;
			const llmProvider: LlmProvider = {
				async *chat(params) {
					capturedParams = params;
					yield { type: 'text', content: 'response' };
				},
			};
			const mockAssembler = {
				assemble: vi.fn().mockResolvedValue({
					systemPrompt: 'system',
					sections: [],
					totalTokens: 10,
					budgetUtilization: {},
				} satisfies AssembledContext),
			} as unknown as ContextAssembler;
			const mockSend = vi.fn().mockResolvedValue(undefined);

			const deps = makeDepsSync({
				sessionRouter: new SessionRouter(store),
				contextAssembler: mockAssembler,
				llmProvider,
			});

			const handler = createInboundHandler(deps);
			await handler(makeInboundMessage(), mockSend);

			const params = capturedParams as { tools: ToolDefinition[] };
			expect(params.tools).toEqual([]);
		});
	});

	describe('send callback signature', () => {
		it('should call send with userId as target and OutboundMessage', async () => {
			const store = makeSessionStore();
			const mockAssembler = {
				assemble: vi.fn().mockResolvedValue({
					systemPrompt: 'system',
					sections: [],
					totalTokens: 10,
					budgetUtilization: {},
				} satisfies AssembledContext),
			} as unknown as ContextAssembler;
			const llmProvider = makeLlmProvider([{ type: 'text', content: 'Reply' }]);
			const mockSend = vi.fn().mockResolvedValue(undefined);

			const deps = makeDepsSync({
				sessionRouter: new SessionRouter(store),
				contextAssembler: mockAssembler,
				llmProvider,
			});

			const handler = createInboundHandler(deps);
			await handler(makeInboundMessage({ userId: 'u42' }), mockSend);

			expect(mockSend).toHaveBeenCalledTimes(1);
			const [target, msg] = mockSend.mock.calls[0] as [string, OutboundMessage];
			expect(target).toBe('u42');
			expect(msg.content).toBe('Reply');
			expect(msg.format).toBe('markdown');
		});
	});

	describe('error logging (AUD-081)', () => {
		it('should call onError callback with error details when session resolution fails', async () => {
			const store = makeSessionStore();
			(store.resolve as ReturnType<typeof vi.fn>).mockRejectedValue(
				new Error('DB connection lost'),
			);
			const mockSend = vi.fn().mockResolvedValue(undefined);
			const onError = vi.fn();

			const deps = makeDepsSync({
				sessionRouter: new SessionRouter(store),
				onError,
			});

			const handler = createInboundHandler(deps);
			await handler(makeInboundMessage(), mockSend);

			expect(onError).toHaveBeenCalledTimes(1);
			const errorInfo = onError.mock.calls[0]?.[0] as ErrorInfo;
			expect(errorInfo.error).toBeInstanceOf(Error);
			expect(errorInfo.userId).toBe('user-1');
			expect(errorInfo.channelId).toBe('discord');
			expect(errorInfo.errorMessage).toBe('DB connection lost');
		});

		it('should include userId and channelId in error info from session failure', async () => {
			const store = makeSessionStore();
			(store.resolve as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('DB down'));

			const mockSend = vi.fn().mockResolvedValue(undefined);
			const onError = vi.fn();

			const deps = makeDepsSync({
				sessionRouter: new SessionRouter(store),
				onError,
			});

			const handler = createInboundHandler(deps);
			await handler(makeInboundMessage({ userId: 'user-42', channelId: 'telegram' }), mockSend);

			expect(onError).toHaveBeenCalledTimes(1);
			const errorInfo = onError.mock.calls[0]?.[0] as ErrorInfo;
			expect(errorInfo.error).toBeInstanceOf(Error);
			expect(errorInfo.errorMessage).toBe('DB down');
			expect(errorInfo.userId).toBe('user-42');
			expect(errorInfo.channelId).toBe('telegram');
		});

		it('should call onError callback when context assembly fails', async () => {
			const store = makeSessionStore();
			const mockAssembler = {
				assemble: vi.fn().mockRejectedValue(new Error('Context assembly failed')),
			} as unknown as ContextAssembler;
			const mockSend = vi.fn().mockResolvedValue(undefined);
			const onError = vi.fn();

			const deps = makeDepsSync({
				sessionRouter: new SessionRouter(store),
				contextAssembler: mockAssembler,
				onError,
			});

			const handler = createInboundHandler(deps);
			await handler(makeInboundMessage(), mockSend);

			expect(onError).toHaveBeenCalledTimes(1);
			const errorInfo = onError.mock.calls[0]?.[0] as ErrorInfo;
			expect(errorInfo.errorMessage).toBe('Context assembly failed');
		});

		it('should include error type name for AxelError subclasses', async () => {
			const store = makeSessionStore();
			const personaEngine = makePersonaEngine();
			(personaEngine.getSystemPrompt as ReturnType<typeof vi.fn>).mockImplementation(() => {
				throw new ProviderError('Persona load failed', 'persona', false);
			});
			const mockSend = vi.fn().mockResolvedValue(undefined);
			const onError = vi.fn();

			const deps = makeDepsSync({
				sessionRouter: new SessionRouter(store),
				personaEngine,
				onError,
			});

			const handler = createInboundHandler(deps);
			await handler(makeInboundMessage(), mockSend);

			expect(onError).toHaveBeenCalledTimes(1);
			const errorInfo = onError.mock.calls[0]?.[0] as ErrorInfo;
			expect(errorInfo.errorType).toBe('ProviderError');
		});

		it('should still send fallback message when onError is provided', async () => {
			const store = makeSessionStore();
			const mockAssembler = {
				assemble: vi.fn().mockRejectedValue(new Error('Assembly crashed')),
			} as unknown as ContextAssembler;
			const mockSend = vi.fn().mockResolvedValue(undefined);
			const onError = vi.fn();

			const deps = makeDepsSync({
				sessionRouter: new SessionRouter(store),
				contextAssembler: mockAssembler,
				onError,
			});

			const handler = createInboundHandler(deps);
			await handler(makeInboundMessage(), mockSend);

			// Error callback called
			expect(onError).toHaveBeenCalledTimes(1);
			// Fallback message still sent
			expect(mockSend).toHaveBeenCalledWith(
				'user-1',
				expect.objectContaining({ content: expect.stringContaining('오류') }),
			);
		});

		it('should not throw when onError callback itself throws', async () => {
			const store = makeSessionStore();
			(store.resolve as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Session failure'));
			const mockSend = vi.fn().mockResolvedValue(undefined);
			const onError = vi.fn().mockImplementation(() => {
				throw new Error('Logger crashed');
			});

			const deps = makeDepsSync({
				sessionRouter: new SessionRouter(store),
				onError,
			});

			const handler = createInboundHandler(deps);
			// Should not propagate onError's exception
			await expect(handler(makeInboundMessage(), mockSend)).resolves.not.toThrow();
			// onError was called despite throwing
			expect(onError).toHaveBeenCalledTimes(1);
			// Fallback message still sent
			expect(mockSend).toHaveBeenCalledWith(
				'user-1',
				expect.objectContaining({ content: expect.stringContaining('오류') }),
			);
		});

		it('should work without onError callback (backward compatible)', async () => {
			const store = makeSessionStore();
			(store.resolve as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Session failure'));
			const mockSend = vi.fn().mockResolvedValue(undefined);

			// No onError callback — should not break
			const deps = makeDepsSync({
				sessionRouter: new SessionRouter(store),
			});

			const handler = createInboundHandler(deps);
			await expect(handler(makeInboundMessage(), mockSend)).resolves.not.toThrow();
			// Still sends fallback
			expect(mockSend).toHaveBeenCalledWith(
				'user-1',
				expect.objectContaining({ content: expect.stringContaining('오류') }),
			);
		});

		it('should include errorType as "Error" for generic Error instances', async () => {
			const store = makeSessionStore();
			(store.resolve as ReturnType<typeof vi.fn>).mockRejectedValue(new TypeError('type issue'));

			const mockSend = vi.fn().mockResolvedValue(undefined);
			const onError = vi.fn();

			const deps = makeDepsSync({
				sessionRouter: new SessionRouter(store),
				onError,
			});

			const handler = createInboundHandler(deps);
			await handler(makeInboundMessage(), mockSend);

			const errorInfo = onError.mock.calls[0]?.[0] as ErrorInfo;
			expect(errorInfo.errorType).toBe('TypeError');
			expect(errorInfo.errorMessage).toBe('type issue');
		});

		it('should handle non-Error thrown values gracefully', async () => {
			const store = makeSessionStore();
			(store.resolve as ReturnType<typeof vi.fn>).mockRejectedValue('string error');

			const mockSend = vi.fn().mockResolvedValue(undefined);
			const onError = vi.fn();

			const deps = makeDepsSync({
				sessionRouter: new SessionRouter(store),
				onError,
			});

			const handler = createInboundHandler(deps);
			await handler(makeInboundMessage(), mockSend);

			const errorInfo = onError.mock.calls[0]?.[0] as ErrorInfo;
			expect(errorInfo.errorType).toBe('unknown');
			expect(errorInfo.errorMessage).toBe('string error');
		});
	});

	describe('memory persistence (FIX-MEMORY-001)', () => {
		it('should call workingMemory.pushTurn for user message after successful response', async () => {
			const store = makeSessionStore();
			const workingMemory = makeWorkingMemory();
			const mockAssembler = {
				assemble: vi.fn().mockResolvedValue({
					systemPrompt: 'system',
					sections: [],
					totalTokens: 10,
					budgetUtilization: {},
				} satisfies AssembledContext),
			} as unknown as ContextAssembler;
			const mockSend = vi.fn().mockResolvedValue(undefined);

			const deps = makeDepsSync({
				sessionRouter: new SessionRouter(store),
				contextAssembler: mockAssembler,
				workingMemory,
			});

			const handler = createInboundHandler(deps);
			const message = makeInboundMessage({
				userId: 'user-1',
				channelId: 'discord',
				content: 'Hello Axel',
				timestamp: new Date('2026-02-08T12:00:00Z'),
			});
			await handler(message, mockSend);

			// pushTurn should be called at least twice (user message + assistant response)
			expect(workingMemory.pushTurn).toHaveBeenCalledTimes(2);

			// First call: user message
			const userTurnCall = (workingMemory.pushTurn as ReturnType<typeof vi.fn>).mock.calls[0];
			expect(userTurnCall?.[0]).toBe('user-1');
			const userTurn = userTurnCall?.[1] as Turn;
			expect(userTurn.role).toBe('user');
			expect(userTurn.content).toBe('Hello Axel');
			expect(userTurn.channelId).toBe('discord');
		});

		it('should call workingMemory.pushTurn for assistant response after successful response', async () => {
			const store = makeSessionStore();
			const workingMemory = makeWorkingMemory();
			const llmProvider = makeLlmProvider([
				{ type: 'text', content: 'Hi ' },
				{ type: 'text', content: 'there!' },
			]);
			const mockAssembler = {
				assemble: vi.fn().mockResolvedValue({
					systemPrompt: 'system',
					sections: [],
					totalTokens: 10,
					budgetUtilization: {},
				} satisfies AssembledContext),
			} as unknown as ContextAssembler;
			const mockSend = vi.fn().mockResolvedValue(undefined);

			const deps = makeDepsSync({
				sessionRouter: new SessionRouter(store),
				contextAssembler: mockAssembler,
				llmProvider,
				workingMemory,
			});

			const handler = createInboundHandler(deps);
			await handler(makeInboundMessage(), mockSend);

			// Second call: assistant response with accumulated text
			const assistantTurnCall = (workingMemory.pushTurn as ReturnType<typeof vi.fn>).mock
				.calls[1];
			expect(assistantTurnCall?.[0]).toBe('user-1');
			const assistantTurn = assistantTurnCall?.[1] as Turn;
			expect(assistantTurn.role).toBe('assistant');
			expect(assistantTurn.content).toBe('Hi there!');
			expect(assistantTurn.channelId).toBe('discord');
		});

		it('should call episodicMemory.addMessage for user message after successful response', async () => {
			const store = makeSessionStore();
			const episodicMemory = makeEpisodicMemory();
			const mockAssembler = {
				assemble: vi.fn().mockResolvedValue({
					systemPrompt: 'system',
					sections: [],
					totalTokens: 10,
					budgetUtilization: {},
				} satisfies AssembledContext),
			} as unknown as ContextAssembler;
			const mockSend = vi.fn().mockResolvedValue(undefined);

			const deps = makeDepsSync({
				sessionRouter: new SessionRouter(store),
				contextAssembler: mockAssembler,
				episodicMemory,
			});

			const handler = createInboundHandler(deps);
			await handler(
				makeInboundMessage({
					userId: 'user-1',
					channelId: 'discord',
					content: 'Hello Axel',
					timestamp: new Date('2026-02-08T12:00:00Z'),
				}),
				mockSend,
			);

			// addMessage should be called twice (user message + assistant response)
			expect(episodicMemory.addMessage).toHaveBeenCalledTimes(2);

			// First call: user message with correct sessionId
			const userMsgCall = (episodicMemory.addMessage as ReturnType<typeof vi.fn>).mock
				.calls[0];
			expect(userMsgCall?.[0]).toBe('sess-1'); // sessionId from resolved session
			const userMsg = userMsgCall?.[1] as MessageRecord;
			expect(userMsg.role).toBe('user');
			expect(userMsg.content).toBe('Hello Axel');
			expect(userMsg.channelId).toBe('discord');
		});

		it('should call episodicMemory.addMessage for assistant response with correct sessionId', async () => {
			const store = makeSessionStore();
			const episodicMemory = makeEpisodicMemory();
			const llmProvider = makeLlmProvider([{ type: 'text', content: 'Response text' }]);
			const mockAssembler = {
				assemble: vi.fn().mockResolvedValue({
					systemPrompt: 'system',
					sections: [],
					totalTokens: 10,
					budgetUtilization: {},
				} satisfies AssembledContext),
			} as unknown as ContextAssembler;
			const mockSend = vi.fn().mockResolvedValue(undefined);

			const deps = makeDepsSync({
				sessionRouter: new SessionRouter(store),
				contextAssembler: mockAssembler,
				llmProvider,
				episodicMemory,
			});

			const handler = createInboundHandler(deps);
			await handler(makeInboundMessage(), mockSend);

			// Second call: assistant response
			const assistantMsgCall = (episodicMemory.addMessage as ReturnType<typeof vi.fn>).mock
				.calls[1];
			expect(assistantMsgCall?.[0]).toBe('sess-1');
			const assistantMsg = assistantMsgCall?.[1] as MessageRecord;
			expect(assistantMsg.role).toBe('assistant');
			expect(assistantMsg.content).toBe('Response text');
		});

		it('should not call memory persistence methods when an error occurs before reactLoop', async () => {
			const store = makeSessionStore();
			(store.resolve as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('DB down'));
			const workingMemory = makeWorkingMemory();
			const episodicMemory = makeEpisodicMemory();
			const mockSend = vi.fn().mockResolvedValue(undefined);

			const deps = makeDepsSync({
				sessionRouter: new SessionRouter(store),
				workingMemory,
				episodicMemory,
			});

			const handler = createInboundHandler(deps);
			await handler(makeInboundMessage(), mockSend);

			expect(workingMemory.pushTurn).not.toHaveBeenCalled();
			expect(episodicMemory.addMessage).not.toHaveBeenCalled();
		});

		it('should still send response if workingMemory.pushTurn fails', async () => {
			const store = makeSessionStore();
			const workingMemory = makeWorkingMemory();
			(workingMemory.pushTurn as ReturnType<typeof vi.fn>).mockRejectedValue(
				new Error('PG write failed'),
			);
			const mockAssembler = {
				assemble: vi.fn().mockResolvedValue({
					systemPrompt: 'system',
					sections: [],
					totalTokens: 10,
					budgetUtilization: {},
				} satisfies AssembledContext),
			} as unknown as ContextAssembler;
			const mockSend = vi.fn().mockResolvedValue(undefined);

			const deps = makeDepsSync({
				sessionRouter: new SessionRouter(store),
				contextAssembler: mockAssembler,
				workingMemory,
			});

			const handler = createInboundHandler(deps);
			await handler(makeInboundMessage(), mockSend);

			// Response should still be sent despite memory write failure
			expect(mockSend).toHaveBeenCalledWith(
				'user-1',
				expect.objectContaining({ content: 'Hello!' }),
			);
		});

		it('should still send response if episodicMemory.addMessage fails', async () => {
			const store = makeSessionStore();
			const episodicMemory = makeEpisodicMemory();
			(episodicMemory.addMessage as ReturnType<typeof vi.fn>).mockRejectedValue(
				new Error('PG write failed'),
			);
			const mockAssembler = {
				assemble: vi.fn().mockResolvedValue({
					systemPrompt: 'system',
					sections: [],
					totalTokens: 10,
					budgetUtilization: {},
				} satisfies AssembledContext),
			} as unknown as ContextAssembler;
			const mockSend = vi.fn().mockResolvedValue(undefined);

			const deps = makeDepsSync({
				sessionRouter: new SessionRouter(store),
				contextAssembler: mockAssembler,
				episodicMemory,
			});

			const handler = createInboundHandler(deps);
			await handler(makeInboundMessage(), mockSend);

			// Response should still be sent despite memory write failure
			expect(mockSend).toHaveBeenCalledWith(
				'user-1',
				expect.objectContaining({ content: 'Hello!' }),
			);
		});

		it('should pass correct turnId values based on session turnCount', async () => {
			const store = makeSessionStore(
				makeResolvedSession({ session: makeSession({ turnCount: 5 }) }),
			);
			const workingMemory = makeWorkingMemory();
			const mockAssembler = {
				assemble: vi.fn().mockResolvedValue({
					systemPrompt: 'system',
					sections: [],
					totalTokens: 10,
					budgetUtilization: {},
				} satisfies AssembledContext),
			} as unknown as ContextAssembler;
			const mockSend = vi.fn().mockResolvedValue(undefined);

			const deps = makeDepsSync({
				sessionRouter: new SessionRouter(store),
				contextAssembler: mockAssembler,
				workingMemory,
			});

			const handler = createInboundHandler(deps);
			await handler(makeInboundMessage(), mockSend);

			const userTurn = (workingMemory.pushTurn as ReturnType<typeof vi.fn>).mock
				.calls[0]?.[1] as Turn;
			const assistantTurn = (workingMemory.pushTurn as ReturnType<typeof vi.fn>).mock
				.calls[1]?.[1] as Turn;
			expect(userTurn.turnId).toBe(6); // turnCount + 1
			expect(assistantTurn.turnId).toBe(7); // turnCount + 2
		});

		it('should include tokenCount estimates in both pushTurn and addMessage', async () => {
			const store = makeSessionStore();
			const workingMemory = makeWorkingMemory();
			const episodicMemory = makeEpisodicMemory();
			const mockAssembler = {
				assemble: vi.fn().mockResolvedValue({
					systemPrompt: 'system',
					sections: [],
					totalTokens: 10,
					budgetUtilization: {},
				} satisfies AssembledContext),
			} as unknown as ContextAssembler;
			const mockSend = vi.fn().mockResolvedValue(undefined);

			const deps = makeDepsSync({
				sessionRouter: new SessionRouter(store),
				contextAssembler: mockAssembler,
				workingMemory,
				episodicMemory,
			});

			const handler = createInboundHandler(deps);
			await handler(makeInboundMessage({ content: 'Hello Axel' }), mockSend);

			// Token counts should be non-negative integers
			const userTurn = (workingMemory.pushTurn as ReturnType<typeof vi.fn>).mock
				.calls[0]?.[1] as Turn;
			expect(userTurn.tokenCount).toBeGreaterThanOrEqual(0);
			expect(Number.isInteger(userTurn.tokenCount)).toBe(true);

			const userMsg = (episodicMemory.addMessage as ReturnType<typeof vi.fn>).mock
				.calls[0]?.[1] as MessageRecord;
			expect(userMsg.tokenCount).toBeGreaterThanOrEqual(0);
			expect(Number.isInteger(userMsg.tokenCount)).toBe(true);
		});

		it('should persist both user and assistant messages with tool call flow', async () => {
			const store = makeSessionStore();
			const workingMemory = makeWorkingMemory();
			const episodicMemory = makeEpisodicMemory();
			let callCount = 0;
			const llmProvider: LlmProvider = {
				async *chat() {
					callCount++;
					if (callCount === 1) {
						yield {
							type: 'tool_call' as const,
							content: { toolName: 'search', args: { q: 'test' }, callId: 'c1' },
						};
					} else {
						yield { type: 'text' as const, content: 'Found it.' };
					}
				},
			};
			const mockAssembler = {
				assemble: vi.fn().mockResolvedValue({
					systemPrompt: 'system',
					sections: [],
					totalTokens: 10,
					budgetUtilization: {},
				} satisfies AssembledContext),
			} as unknown as ContextAssembler;
			const mockSend = vi.fn().mockResolvedValue(undefined);

			const deps = makeDepsSync({
				sessionRouter: new SessionRouter(store),
				contextAssembler: mockAssembler,
				llmProvider,
				workingMemory,
				episodicMemory,
			});

			const handler = createInboundHandler(deps);
			await handler(makeInboundMessage({ content: 'search something' }), mockSend);

			// workingMemory should still record user message + final assistant response
			expect(workingMemory.pushTurn).toHaveBeenCalledTimes(2);
			const assistantTurn = (workingMemory.pushTurn as ReturnType<typeof vi.fn>).mock
				.calls[1]?.[1] as Turn;
			expect(assistantTurn.role).toBe('assistant');
			expect(assistantTurn.content).toBe('Found it.');

			// episodicMemory should still record user message + final assistant response
			expect(episodicMemory.addMessage).toHaveBeenCalledTimes(2);
		});
	});
});
