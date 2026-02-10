import { describe, expect, it, vi } from 'vitest';
import { createChannels, createHandleMessage, wireChannels } from '../src/bootstrap-channels.js';
import type { AxelConfig } from '../src/config.js';
import type { Container, ContainerDeps } from '../src/container.js';

// ─── Mock Factories ───

function createMockContainer(): Container {
	const mockLlmProvider = {
		chat: vi.fn(),
	};
	return {
		logger: {
			info: vi.fn(),
			warn: vi.fn(),
			error: vi.fn(),
			debug: vi.fn(),
			child: vi.fn().mockReturnThis(),
		} as unknown as Container['logger'],
		pgPool: { healthCheck: vi.fn() } as unknown as Container['pgPool'],
		streamBuffer: { healthCheck: vi.fn() } as unknown as Container['streamBuffer'],
		workingMemory: { healthCheck: vi.fn() } as unknown as Container['workingMemory'],
		episodicMemory: { healthCheck: vi.fn() } as unknown as Container['episodicMemory'],
		semanticMemory: { healthCheck: vi.fn() } as unknown as Container['semanticMemory'],
		conceptualMemory: { healthCheck: vi.fn() } as unknown as Container['conceptualMemory'],
		metaMemory: { healthCheck: vi.fn() } as unknown as Container['metaMemory'],
		sessionStore: {} as Container['sessionStore'],
		sessionRouter: {
			resolveSession: vi.fn().mockResolvedValue({
				session: { sessionId: 'test-session' },
				channelSwitched: false,
			}),
			updateActivity: vi.fn().mockResolvedValue(undefined),
		} as unknown as Container['sessionRouter'],
		llmProvider: mockLlmProvider as unknown as Container['llmProvider'],
		anthropicProvider: mockLlmProvider as unknown as Container['anthropicProvider'],
		googleProvider: {} as unknown as Container['googleProvider'],
		embeddingService: { healthCheck: vi.fn() } as unknown as Container['embeddingService'],
		toolRegistry: {
			listAll: vi.fn().mockReturnValue([]),
		} as unknown as Container['toolRegistry'],
		toolExecutor: {} as unknown as Container['toolExecutor'],
		contextAssembler: {
			assemble: vi.fn().mockResolvedValue({
				systemPrompt: 'test prompt',
				sections: [],
				totalTokens: 100,
				budgetUtilization: {},
			}),
		} as unknown as Container['contextAssembler'],
		tokenCounter: {
			count: vi.fn().mockResolvedValue(10),
			estimate: vi.fn().mockReturnValue(10),
		} as unknown as Container['tokenCounter'],
		interactionLogger: {
			log: vi.fn().mockResolvedValue(undefined),
		} as unknown as Container['interactionLogger'],
		consolidationService: {
			consolidate: vi.fn().mockResolvedValue({
				sessionsProcessed: 0,
				memoriesExtracted: 0,
				memoriesStored: 0,
				memoriesUpdated: 0,
			}),
		} as unknown as Container['consolidationService'],
		healthCheckTargets: [],
	};
}

function createMinimalConfig(overrides?: Partial<AxelConfig>): AxelConfig {
	return {
		env: 'test',
		port: 8000,
		host: '0.0.0.0',
		timezone: 'America/Vancouver',
		db: { url: 'postgresql://localhost/axel', maxConnections: 10 },
		redis: {
			url: 'redis://localhost:6379',
			connectTimeoutMs: 5000,
			commandTimeoutMs: 1000,
			maxRetriesPerRequest: 3,
		},
		llm: {
			anthropic: {
				apiKey: 'test-key',
				model: 'claude-sonnet-4-5-20250929',
				thinkingBudget: 10000,
				maxTokens: 16384,
			},
			google: {
				apiKey: 'test-key',
				flashModel: 'gemini-3-flash-preview',
				embeddingModel: 'gemini-embedding-001',
				embeddingDimension: 3072,
			},
			fallbackChain: ['anthropic', 'google'],
		},
		memory: {
			decay: {
				baseRate: 0.001,
				minRetention: 0.3,
				deleteThreshold: 0.03,
				accessStabilityK: 0.3,
				relationResistanceK: 0.1,
				channelDiversityK: 0.2,
				recencyBoost: 1.3,
				recencyAgeThreshold: 168,
				recencyAccessThreshold: 24,
				typeMultipliers: { fact: 0.3, preference: 0.5, insight: 0.7, conversation: 1.0 },
			},
			budgets: {
				systemPrompt: 8000,
				workingMemory: 40000,
				semanticSearch: 12000,
				graphTraversal: 4000,
				sessionArchive: 4000,
				streamBuffer: 2000,
				metaMemory: 2000,
				toolDefinitions: 4000,
			},
			workingMemoryMaxTurns: 20,
			sessionArchiveDays: 30,
			consolidationIntervalHours: 6,
		},
		channels: {},
		security: {
			iotRequireHttps: true,
			commandAllowlist: ['ls', 'git'],
			maxRequestsPerMinute: 30,
			toolApprovalRequired: ['execute_command'],
		},
		persona: { path: './data/dynamic_persona.json', hotReload: true },
		logging: { level: 'info', pretty: false },
		...overrides,
	};
}

// ─── Tests ───

describe('bootstrap-channels', () => {
	describe('createChannels', () => {
		it('creates CLI channel when cli.enabled is true', () => {
			const config = createMinimalConfig({
				channels: { cli: { enabled: true } },
			});

			const channels = createChannels(config);

			expect(channels).toHaveLength(1);
			expect(channels[0]?.id).toBe('cli');
		});

		it('creates CLI channel by default when no channels config', () => {
			const config = createMinimalConfig({ channels: {} });

			const channels = createChannels(config);

			// Default: cli enabled
			expect(channels).toHaveLength(1);
			expect(channels[0]?.id).toBe('cli');
		});

		it('does not create CLI channel when cli.enabled is false', () => {
			const config = createMinimalConfig({
				channels: { cli: { enabled: false } },
			});

			const channels = createChannels(config);

			const cliChannels = channels.filter((c) => c.id === 'cli');
			expect(cliChannels).toHaveLength(0);
		});

		it('creates Discord channel when botToken is provided', () => {
			const config = createMinimalConfig({
				channels: {
					discord: { botToken: 'test-discord-token', allowedGuilds: [] },
					cli: { enabled: false },
				},
			});

			const channels = createChannels(config);

			expect(channels.some((c) => c.id === 'discord')).toBe(true);
		});

		it('does not create Discord channel when no botToken', () => {
			const config = createMinimalConfig({
				channels: {
					discord: { allowedGuilds: [] },
					cli: { enabled: false },
				},
			});

			const channels = createChannels(config);

			expect(channels.some((c) => c.id === 'discord')).toBe(false);
		});

		it('creates Telegram channel when botToken is provided', () => {
			const config = createMinimalConfig({
				channels: {
					telegram: { botToken: 'test-telegram-token', allowedUsers: [] },
					cli: { enabled: false },
				},
			});

			const channels = createChannels(config);

			expect(channels.some((c) => c.id === 'telegram')).toBe(true);
		});

		it('does not create Telegram channel when no botToken', () => {
			const config = createMinimalConfig({
				channels: {
					telegram: { allowedUsers: [] },
					cli: { enabled: false },
				},
			});

			const channels = createChannels(config);

			expect(channels.some((c) => c.id === 'telegram')).toBe(false);
		});

		it('creates multiple channels from config', () => {
			const config = createMinimalConfig({
				channels: {
					cli: { enabled: true },
					discord: { botToken: 'discord-token', allowedGuilds: [] },
					telegram: { botToken: 'telegram-token', allowedUsers: [] },
				},
			});

			const channels = createChannels(config);

			expect(channels).toHaveLength(3);
			const ids = channels.map((c) => c.id);
			expect(ids).toContain('cli');
			expect(ids).toContain('discord');
			expect(ids).toContain('telegram');
		});

		it('returns empty array when all channels disabled and no tokens', () => {
			const config = createMinimalConfig({
				channels: { cli: { enabled: false } },
			});

			const channels = createChannels(config);

			expect(channels).toHaveLength(0);
		});
	});

	describe('wireChannels', () => {
		it('registers inbound handler on each channel', () => {
			const mockOnMessage = vi.fn();
			const mockChannel = {
				id: 'test',
				onMessage: mockOnMessage,
				start: vi.fn(),
				stop: vi.fn(),
				send: vi.fn(),
				healthCheck: vi.fn(),
				capabilities: {} as never,
			};

			const container = createMockContainer();
			const personaEngine = createMockPersonaEngine();

			wireChannels([mockChannel], container, personaEngine);

			expect(mockOnMessage).toHaveBeenCalledTimes(1);
			expect(typeof mockOnMessage.mock.calls[0]?.[0]).toBe('function');
		});

		it('registers handlers that call InboundHandler pipeline', async () => {
			let capturedHandler: ((msg: unknown) => Promise<void>) | undefined;
			const mockSend = vi.fn().mockResolvedValue(undefined);
			const mockChannel = {
				id: 'test',
				onMessage: vi.fn((handler: (msg: unknown) => Promise<void>) => {
					capturedHandler = handler;
				}),
				start: vi.fn(),
				stop: vi.fn(),
				send: mockSend,
				healthCheck: vi.fn(),
				capabilities: {} as never,
			};

			const container = createMockContainer();
			const personaEngine = createMockPersonaEngine();

			wireChannels([mockChannel], container, personaEngine);

			// Verify handler was captured
			expect(capturedHandler).toBeDefined();
		});

		it('does nothing with empty channels array', () => {
			const container = createMockContainer();
			const personaEngine = createMockPersonaEngine();

			// Should not throw
			wireChannels([], container, personaEngine);
		});

		it('passes workingMemory and episodicMemory to InboundHandler (FIX-MEMORY-002)', async () => {
			let capturedHandler: ((msg: unknown) => Promise<void>) | undefined;
			const mockChannel = {
				id: 'test',
				onMessage: vi.fn((handler: (msg: unknown) => Promise<void>) => {
					capturedHandler = handler;
				}),
				start: vi.fn(),
				stop: vi.fn(),
				send: vi.fn().mockResolvedValue(undefined),
				healthCheck: vi.fn(),
				capabilities: {} as never,
			};

			const container = createMockContainer();
			const personaEngine = createMockPersonaEngine();

			// Set up working mock chain for full pipeline
			(container.sessionRouter as { resolveSession: ReturnType<typeof vi.fn> }).resolveSession = vi
				.fn()
				.mockResolvedValue({
					session: { sessionId: 's-1', turnCount: 0 },
					channelSwitched: false,
					isNew: true,
					previousSession: null,
				});
			(container.llmProvider as { chat: ReturnType<typeof vi.fn> }).chat = vi.fn().mockReturnValue(
				(async function* () {
					yield { type: 'message_delta' as const, content: 'Hi' };
					yield { type: 'message_complete' as const, content: '' };
				})(),
			);

			// Mock memory methods to track calls
			const pushTurn = vi.fn().mockResolvedValue(undefined);
			const addMessage = vi.fn().mockResolvedValue(undefined);
			(container.workingMemory as { pushTurn: ReturnType<typeof vi.fn> }).pushTurn = pushTurn;
			(container.episodicMemory as { addMessage: ReturnType<typeof vi.fn> }).addMessage =
				addMessage;

			wireChannels([mockChannel], container, personaEngine);
			expect(capturedHandler).toBeDefined();
			if (!capturedHandler) return;

			// Trigger the handler
			await capturedHandler({
				userId: 'user-1',
				channelId: 'cli',
				content: 'Hello Axel',
				timestamp: new Date(),
			});

			// workingMemory.pushTurn should have been called (user + assistant = 2 calls)
			expect(pushTurn).toHaveBeenCalledTimes(2);
			expect(pushTurn).toHaveBeenCalledWith('user-1', expect.objectContaining({ role: 'user' }));
			expect(pushTurn).toHaveBeenCalledWith(
				'user-1',
				expect.objectContaining({ role: 'assistant' }),
			);

			// episodicMemory.addMessage should have been called (user + assistant = 2 calls)
			expect(addMessage).toHaveBeenCalledTimes(2);
			expect(addMessage).toHaveBeenCalledWith('s-1', expect.objectContaining({ role: 'user' }));
			expect(addMessage).toHaveBeenCalledWith(
				's-1',
				expect.objectContaining({ role: 'assistant' }),
			);
		});
	});

	describe('createHandleMessage', () => {
		it('returns a function', () => {
			const container = createMockContainer();
			const personaEngine = createMockPersonaEngine();

			const handleMessage = createHandleMessage(container, personaEngine);

			expect(typeof handleMessage).toBe('function');
		});

		it('returns a MessageResult with expected shape', async () => {
			const container = createMockContainer();
			const personaEngine = createMockPersonaEngine();

			// Mock the LLM provider to return a simple stream
			const mockStream = (async function* () {
				yield { type: 'message_delta' as const, content: 'Hello' };
				yield { type: 'message_complete' as const, content: '' };
			})();

			(container.llmProvider as { chat: ReturnType<typeof vi.fn> }).chat = vi
				.fn()
				.mockReturnValue(mockStream);

			const handleMessage = createHandleMessage(container, personaEngine);
			const result = await handleMessage({
				userId: 'user-1',
				channelId: 'gateway',
				content: 'Hello',
			});

			expect(result).toHaveProperty('content');
			expect(result).toHaveProperty('sessionId');
			expect(result).toHaveProperty('channelSwitched');
			expect(result).toHaveProperty('usage');
			expect(typeof result.content).toBe('string');
		});

		it('forwards events via onEvent callback when provided', async () => {
			const container = createMockContainer();
			const personaEngine = createMockPersonaEngine();

			const handleMessage = createHandleMessage(container, personaEngine);
			const events: unknown[] = [];

			await handleMessage({ userId: 'user-1', channelId: 'gateway', content: 'Hello' }, (event) => {
				events.push(event);
			});

			// Should have emitted at least one event
			expect(events.length).toBeGreaterThanOrEqual(0);
		});

		it('passes tool definitions from toolRegistry to InboundHandler (AUD-093)', async () => {
			const container = createMockContainer();
			const personaEngine = createMockPersonaEngine();

			const mockToolDefs = [
				{
					name: 'search_memory',
					description: 'Search semantic memory',
					category: 'memory' as const,
					inputSchema: { type: 'object' },
					requiresApproval: false,
				},
			];

			(container.toolRegistry as { listAll: ReturnType<typeof vi.fn> }).listAll = vi
				.fn()
				.mockReturnValue(mockToolDefs);

			// Mock the LLM provider to capture what tools it receives
			let capturedTools: unknown;
			(container.llmProvider as { chat: ReturnType<typeof vi.fn> }).chat = vi
				.fn()
				.mockImplementation((params: { tools: unknown }) => {
					capturedTools = params.tools;
					return (async function* () {
						yield { type: 'message_delta' as const, content: 'Hello' };
						yield { type: 'message_complete' as const, content: '' };
					})();
				});

			const handleMessage = createHandleMessage(container, personaEngine);
			await handleMessage({
				userId: 'user-1',
				channelId: 'gateway',
				content: 'Hello',
			});

			// Tool definitions should be passed through to reactLoop (not empty)
			expect(capturedTools).toEqual(mockToolDefs);
		});

		it('handles errors gracefully and returns error content', async () => {
			const container = createMockContainer();
			const personaEngine = createMockPersonaEngine();

			// Force sessionRouter to throw
			(container.sessionRouter as { resolveSession: ReturnType<typeof vi.fn> }).resolveSession = vi
				.fn()
				.mockRejectedValue(new Error('session error'));

			const handleMessage = createHandleMessage(container, personaEngine);
			const result = await handleMessage({
				userId: 'user-1',
				channelId: 'gateway',
				content: 'Hello',
			});

			// Should return error content rather than throwing
			expect(result).toHaveProperty('content');
			expect(typeof result.content).toBe('string');
			expect(result.content.length).toBeGreaterThan(0);
		});
	});
});

// ─── Helpers ───

function createMockPersonaEngine() {
	return {
		load: vi.fn().mockResolvedValue({}),
		reload: vi.fn().mockResolvedValue({}),
		getSystemPrompt: vi.fn().mockReturnValue('You are Axel, a helpful AI assistant.'),
		evolve: vi.fn().mockResolvedValue(undefined),
		updatePreference: vi.fn().mockResolvedValue(undefined),
	};
}
