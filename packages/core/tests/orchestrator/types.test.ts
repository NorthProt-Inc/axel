import { describe, expect, it } from 'vitest';
import { z } from 'zod';

// Will be implemented in packages/core/src/orchestrator/types.ts
import {
	DEFAULT_REACT_CONFIG,
	type ChannelContext,
	type LlmChatChunk,
	type LlmProvider,
	type ReActConfig,
	ReActConfigSchema,
	type ResolvedSession,
	type SessionStats,
	type SessionStore,
	type ToolExecutor,
	type UnifiedSession,
} from '../../src/orchestrator/types.js';

// ─── ReActConfig Schema Tests ───

describe('ReActConfigSchema', () => {
	it('should validate valid config', () => {
		const config: ReActConfig = {
			maxIterations: 15,
			toolTimeoutMs: 30_000,
			totalTimeoutMs: 300_000,
			streamingEnabled: true,
		};
		const result = ReActConfigSchema.safeParse(config);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data).toStrictEqual(config);
		}
	});

	it('should reject non-positive maxIterations', () => {
		const result = ReActConfigSchema.safeParse({
			maxIterations: 0,
			toolTimeoutMs: 30_000,
			totalTimeoutMs: 300_000,
			streamingEnabled: true,
		});
		expect(result.success).toBe(false);
	});

	it('should reject negative timeouts', () => {
		const result = ReActConfigSchema.safeParse({
			maxIterations: 15,
			toolTimeoutMs: -1,
			totalTimeoutMs: 300_000,
			streamingEnabled: true,
		});
		expect(result.success).toBe(false);
	});

	it('should reject non-integer maxIterations', () => {
		const result = ReActConfigSchema.safeParse({
			maxIterations: 1.5,
			toolTimeoutMs: 30_000,
			totalTimeoutMs: 300_000,
			streamingEnabled: true,
		});
		expect(result.success).toBe(false);
	});

	it('should require all fields', () => {
		const result = ReActConfigSchema.safeParse({ maxIterations: 15 });
		expect(result.success).toBe(false);
	});
});

describe('DEFAULT_REACT_CONFIG', () => {
	it('should match plan spec defaults', () => {
		expect(DEFAULT_REACT_CONFIG.maxIterations).toBe(15);
		expect(DEFAULT_REACT_CONFIG.toolTimeoutMs).toBe(30_000);
		expect(DEFAULT_REACT_CONFIG.totalTimeoutMs).toBe(300_000);
		expect(DEFAULT_REACT_CONFIG.streamingEnabled).toBe(true);
	});

	it('should pass its own schema validation', () => {
		const result = ReActConfigSchema.safeParse(DEFAULT_REACT_CONFIG);
		expect(result.success).toBe(true);
	});
});

// ─── Interface Structural Tests ───

describe('UnifiedSession type', () => {
	it('should have required readonly fields', () => {
		const session: UnifiedSession = {
			sessionId: 'sess-001',
			userId: 'mark',
			activeChannelId: 'discord',
			channelHistory: ['discord'],
			startedAt: new Date(),
			lastActivityAt: new Date(),
			turnCount: 0,
		};
		expect(session.sessionId).toBe('sess-001');
		expect(session.userId).toBe('mark');
		expect(session.activeChannelId).toBe('discord');
		expect(session.channelHistory).toStrictEqual(['discord']);
		expect(session.turnCount).toBe(0);
	});
});

describe('ResolvedSession type', () => {
	it('should have session, isNew, channelSwitched, previousSession', () => {
		const resolved: ResolvedSession = {
			session: {
				sessionId: 'sess-002',
				userId: 'mark',
				activeChannelId: 'telegram',
				channelHistory: ['discord', 'telegram'],
				startedAt: new Date(),
				lastActivityAt: new Date(),
				turnCount: 5,
			},
			isNew: false,
			channelSwitched: true,
			previousSession: null,
		};
		expect(resolved.isNew).toBe(false);
		expect(resolved.channelSwitched).toBe(true);
		expect(resolved.previousSession).toBeNull();
	});
});

describe('ChannelContext type', () => {
	it('should express channel switching metadata', () => {
		const ctx: ChannelContext = {
			currentChannel: 'telegram',
			previousChannel: 'discord',
			channelSwitched: true,
			sessionChannels: ['discord', 'telegram'],
		};
		expect(ctx.channelSwitched).toBe(true);
		expect(ctx.previousChannel).toBe('discord');
	});
});

describe('SessionStats type', () => {
	it('should have per-channel breakdown', () => {
		const stats: SessionStats = {
			totalTurns: 8,
			channelBreakdown: { discord: 5, telegram: 3 },
			avgResponseTimeMs: 1200,
			toolsUsed: ['code_review', 'file_search'],
		};
		expect(stats.totalTurns).toBe(8);
		expect(stats.channelBreakdown).toStrictEqual({ discord: 5, telegram: 3 });
	});
});

// ─── DI Interface Structural Tests ───

describe('LlmProvider interface', () => {
	it('should accept chat params and return async iterable of chunks', async () => {
		const mockProvider: LlmProvider = {
			async *chat(_params) {
				yield { type: 'text', content: 'Hello' };
			},
		};
		const chunks: LlmChatChunk[] = [];
		for await (const chunk of mockProvider.chat({
			messages: [],
			tools: [],
		})) {
			chunks.push(chunk);
		}
		expect(chunks).toHaveLength(1);
		expect(chunks[0]).toStrictEqual({ type: 'text', content: 'Hello' });
	});
});

describe('ToolExecutor interface', () => {
	it('should execute a tool call and return ToolResult', async () => {
		const executor: ToolExecutor = {
			execute: async (call, _timeoutMs) => ({
				callId: call.callId,
				success: true,
				content: 'result',
				durationMs: 100,
			}),
		};
		const result = await executor.execute(
			{ toolName: 'test', args: {}, callId: 'c1' },
			30_000,
		);
		expect(result.callId).toBe('c1');
		expect(result.success).toBe(true);
	});
});

describe('SessionStore interface', () => {
	it('should resolve, update, and end sessions', async () => {
		const store: SessionStore = {
			resolve: async (_userId, channelId) => ({
				session: {
					sessionId: 'sess-new',
					userId: 'mark',
					activeChannelId: channelId,
					channelHistory: [channelId],
					startedAt: new Date(),
					lastActivityAt: new Date(),
					turnCount: 0,
				},
				isNew: true,
				channelSwitched: false,
				previousSession: null,
			}),
			updateActivity: async () => {},
			getActive: async () => null,
			getStats: async () => ({
				totalTurns: 0,
				channelBreakdown: {},
				avgResponseTimeMs: 0,
				toolsUsed: [],
			}),
			end: async () => ({
				sessionId: 'sess-new',
				summary: 'test summary',
				keyTopics: [],
				emotionalTone: 'neutral',
				turnCount: 0,
				channelHistory: [],
				startedAt: new Date(),
				endedAt: new Date(),
			}),
		};
		const resolved = await store.resolve('mark', 'discord');
		expect(resolved.isNew).toBe(true);
		const active = await store.getActive('mark');
		expect(active).toBeNull();
	});
});
