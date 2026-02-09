import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionTransitionError } from '../../src/orchestrator/session-state-machine.js';
import { SessionRouter } from '../../src/orchestrator/session-router.js';
import type {
	ResolvedSession,
	SessionStats,
	SessionStore,
	UnifiedSession,
} from '../../src/orchestrator/types.js';
import type { SessionState, SessionSummary } from '../../src/types/session.js';

// ─── In-Memory Session Store (test double) ───

function makeInMemorySessionStore(): SessionStore & {
	sessions: Map<string, UnifiedSession>;
} {
	const sessions = new Map<string, UnifiedSession>();

	return {
		sessions,
		resolve: async (userId, channelId) => {
			const existing = sessions.get(userId);
			if (existing) {
				const now = new Date();
				const elapsed = now.getTime() - existing.lastActivityAt.getTime();
				// 30 min timeout
				if (elapsed < 30 * 60 * 1000) {
					const channelSwitched = existing.activeChannelId !== channelId;
					const updated: UnifiedSession = {
						...existing,
						activeChannelId: channelId,
						channelHistory: channelSwitched
							? [...existing.channelHistory, channelId]
							: existing.channelHistory,
						lastActivityAt: now,
					};
					sessions.set(userId, updated);
					return {
						session: updated,
						isNew: false,
						channelSwitched,
						previousSession: null,
					};
				}
			}
			// New session
			const newSession: UnifiedSession = {
				sessionId: `sess-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
				userId,
				activeChannelId: channelId,
				channelHistory: [channelId],
				startedAt: new Date(),
				lastActivityAt: new Date(),
				turnCount: 0,
				state: 'initializing',
			};
			sessions.set(userId, newSession);
			return {
				session: newSession,
				isNew: true,
				channelSwitched: false,
				previousSession: null,
			};
		},
		updateActivity: async (sessionId) => {
			for (const [userId, session] of sessions) {
				if (session.sessionId === sessionId) {
					sessions.set(userId, {
						...session,
						lastActivityAt: new Date(),
						turnCount: session.turnCount + 1,
					});
					return;
				}
			}
		},
		getActive: async (userId) => sessions.get(userId) ?? null,
		getStats: async (sessionId) => {
			for (const session of sessions.values()) {
				if (session.sessionId === sessionId) {
					const breakdown: Record<string, number> = {};
					for (const ch of session.channelHistory) {
						breakdown[ch] = (breakdown[ch] ?? 0) + 1;
					}
					return {
						totalTurns: session.turnCount,
						channelBreakdown: breakdown,
						avgResponseTimeMs: 0,
						toolsUsed: [],
					};
				}
			}
			return { totalTurns: 0, channelBreakdown: {}, avgResponseTimeMs: 0, toolsUsed: [] };
		},
		end: async (sessionId) => {
			for (const [userId, session] of sessions) {
				if (session.sessionId === sessionId) {
					sessions.delete(userId);
					return {
						sessionId,
						summary: `Session ${sessionId} ended`,
						keyTopics: [],
						emotionalTone: 'neutral',
						turnCount: session.turnCount,
						channelHistory: [...session.channelHistory],
						startedAt: session.startedAt,
						endedAt: new Date(),
					};
				}
			}
			return {
				sessionId,
				summary: 'unknown session',
				keyTopics: [],
				emotionalTone: 'neutral',
				turnCount: 0,
				channelHistory: [],
				startedAt: new Date(),
				endedAt: new Date(),
			};
		},
		updateState: async (sessionId: string, newState: SessionState) => {
			for (const [userId, session] of sessions) {
				if (session.sessionId === sessionId) {
					sessions.set(userId, { ...session, state: newState });
					return;
				}
			}
		},
	};
}

// ─── SessionRouter Tests ───

describe('SessionRouter', () => {
	let store: ReturnType<typeof makeInMemorySessionStore>;
	let router: SessionRouter;

	beforeEach(() => {
		store = makeInMemorySessionStore();
		router = new SessionRouter(store);
	});

	describe('resolveSession', () => {
		it('should create new session for unknown user', async () => {
			const result = await router.resolveSession('mark', 'discord');
			expect(result.isNew).toBe(true);
			expect(result.session.userId).toBe('mark');
			expect(result.session.activeChannelId).toBe('discord');
			expect(result.channelSwitched).toBe(false);
		});

		it('should reuse existing session within timeout', async () => {
			const first = await router.resolveSession('mark', 'discord');
			const second = await router.resolveSession('mark', 'discord');
			expect(second.isNew).toBe(false);
			expect(second.session.sessionId).toBe(first.session.sessionId);
		});

		it('should detect channel switch', async () => {
			await router.resolveSession('mark', 'discord');
			const result = await router.resolveSession('mark', 'telegram');
			expect(result.channelSwitched).toBe(true);
			expect(result.session.activeChannelId).toBe('telegram');
			expect(result.session.channelHistory).toContain('discord');
			expect(result.session.channelHistory).toContain('telegram');
		});

		it('should not duplicate channel in history for same channel', async () => {
			await router.resolveSession('mark', 'discord');
			await router.resolveSession('mark', 'discord');
			const result = await router.resolveSession('mark', 'discord');
			// discord should only appear once in history (no duplicates from same-channel resolution)
			const discordCount = result.session.channelHistory.filter((c) => c === 'discord').length;
			expect(discordCount).toBe(1);
		});
	});

	describe('getChannelContext', () => {
		it('should return channel context with switch info', async () => {
			await router.resolveSession('mark', 'discord');
			const resolved = await router.resolveSession('mark', 'telegram');
			const ctx = router.getChannelContext(resolved);
			expect(ctx.currentChannel).toBe('telegram');
			expect(ctx.previousChannel).toBe('discord');
			expect(ctx.channelSwitched).toBe(true);
			expect(ctx.sessionChannels).toContain('discord');
			expect(ctx.sessionChannels).toContain('telegram');
		});

		it('should have null previousChannel for new session', async () => {
			const resolved = await router.resolveSession('mark', 'discord');
			const ctx = router.getChannelContext(resolved);
			expect(ctx.previousChannel).toBeNull();
			expect(ctx.channelSwitched).toBe(false);
		});
	});

	describe('endSession', () => {
		it('should end session and return summary', async () => {
			const resolved = await router.resolveSession('mark', 'discord');
			const summary = await router.endSession(resolved.session.sessionId);
			expect(summary.sessionId).toBe(resolved.session.sessionId);
			expect(summary.endedAt).toBeInstanceOf(Date);
		});

		it('should remove session so next resolve creates new', async () => {
			const first = await router.resolveSession('mark', 'discord');
			await router.endSession(first.session.sessionId);
			const second = await router.resolveSession('mark', 'discord');
			expect(second.isNew).toBe(true);
			expect(second.session.sessionId).not.toBe(first.session.sessionId);
		});
	});

	describe('getActiveSession', () => {
		it('should return null for no active session', async () => {
			const result = await router.getActiveSession('mark');
			expect(result).toBeNull();
		});

		it('should return active session after resolve', async () => {
			await router.resolveSession('mark', 'discord');
			const result = await router.getActiveSession('mark');
			expect(result).not.toBeNull();
			expect(result?.userId).toBe('mark');
		});
	});

	describe('getSessionStats', () => {
		it('should return stats for existing session', async () => {
			const resolved = await router.resolveSession('mark', 'discord');
			const stats = await router.getSessionStats(resolved.session.sessionId);
			expect(stats.totalTurns).toBeGreaterThanOrEqual(0);
			expect(stats.channelBreakdown).toBeDefined();
		});
	});

	describe('updateActivity', () => {
		it('should increment turn count', async () => {
			const resolved = await router.resolveSession('mark', 'discord');
			await router.updateActivity(resolved.session.sessionId);
			const active = await router.getActiveSession('mark');
			expect(active?.turnCount).toBe(1);
		});
	});

	// ─── GAP-SESSION-001: State Transition Validation ───

	describe('state transition validation (ADR-021)', () => {
		it('should set new session state to active after resolveSession', async () => {
			const result = await router.resolveSession('mark', 'discord');
			expect(result.session.state).toBe('active');
		});

		it('should keep state as active for existing session resolution', async () => {
			const first = await router.resolveSession('mark', 'discord');
			const second = await router.resolveSession('mark', 'discord');
			expect(second.session.state).toBe('active');
		});

		it('should transition to active on channel switch', async () => {
			await router.resolveSession('mark', 'discord');
			const result = await router.resolveSession('mark', 'telegram');
			expect(result.session.state).toBe('active');
		});

		it('should validate endSession transitions session through summarizing → ending → ended', async () => {
			const resolved = await router.resolveSession('mark', 'discord');
			const summary = await router.endSession(resolved.session.sessionId);
			expect(summary.sessionId).toBe(resolved.session.sessionId);
			// After endSession, the session should have been ended
			// (store removes it, so we check it was processed without error)
		});

		it('should throw SessionTransitionError when ending a session in thinking state', async () => {
			const resolved = await router.resolveSession('mark', 'discord');
			const sessionId = resolved.session.sessionId;

			// Transition to thinking via public API (active → thinking is valid)
			await router.transitionState(sessionId, 'thinking');

			// thinking → summarizing is invalid per ADR-021
			await expect(router.endSession(sessionId)).rejects.toThrow(SessionTransitionError);
		});

		it('should throw SessionTransitionError when ending a session in tool_executing state', async () => {
			const resolved = await router.resolveSession('mark', 'discord');
			const sessionId = resolved.session.sessionId;

			// active → thinking → tool_executing
			await router.transitionState(sessionId, 'thinking');
			await router.transitionState(sessionId, 'tool_executing');

			// tool_executing → summarizing is invalid per ADR-021
			await expect(router.endSession(sessionId)).rejects.toThrow(SessionTransitionError);
		});

		it('should throw SessionTransitionError for invalid transitionState call', async () => {
			const resolved = await router.resolveSession('mark', 'discord');
			const sessionId = resolved.session.sessionId;

			// active → ended is invalid (must go through summarizing → ending → ended)
			await expect(router.transitionState(sessionId, 'ended')).rejects.toThrow(
				SessionTransitionError,
			);
		});

		it('should call store.updateState during endSession lifecycle', async () => {
			const updateStateSpy = vi.spyOn(store, 'updateState');
			const resolved = await router.resolveSession('mark', 'discord');
			await router.endSession(resolved.session.sessionId);

			// Should have been called for summarizing, ending, ended transitions
			expect(updateStateSpy).toHaveBeenCalledWith(resolved.session.sessionId, 'summarizing');
			expect(updateStateSpy).toHaveBeenCalledWith(resolved.session.sessionId, 'ending');
			expect(updateStateSpy).toHaveBeenCalledWith(resolved.session.sessionId, 'ended');
		});

		it('should call store.updateState to active when resolving a new session', async () => {
			const updateStateSpy = vi.spyOn(store, 'updateState');
			await router.resolveSession('mark', 'discord');
			expect(updateStateSpy).toHaveBeenCalledWith(expect.any(String), 'active');
		});
	});
});
