import type { SessionState, SessionSummary } from '../types/session.js';
import { transition } from './session-state-machine.js';
import type {
	ChannelContext,
	ResolvedSession,
	SessionStats,
	SessionStore,
	UnifiedSession,
} from './types.js';

/**
 * Cross-Channel Session Router (ADR-014 + ADR-021).
 *
 * Routes incoming messages to the correct unified session.
 * Delegates actual session storage to the injected SessionStore.
 * Validates state transitions per ADR-021 session state machine.
 *
 * Key responsibilities:
 * - Session resolution (new or existing) with state transition
 * - Channel context extraction for LLM
 * - Activity tracking
 * - Session lifecycle (end → summary) with state validation
 */
export class SessionRouter {
	private readonly store: SessionStore;

	/** Internal state cache for transition validation (sessionId → session) */
	private readonly stateCache = new Map<string, UnifiedSession>();

	constructor(store: SessionStore) {
		this.store = store;
	}

	/**
	 * Resolve session for incoming message (ADR-014 lifecycle).
	 *
	 * For new sessions: transitions initializing → active (ADR-021).
	 * For existing sessions: session remains in its current state.
	 */
	async resolveSession(userId: string, channelId: string): Promise<ResolvedSession> {
		const resolved = await this.store.resolve(userId, channelId);

		if (resolved.isNew) {
			// New session: validate initializing → active (ADR-021)
			transition(resolved.session.state, 'active');
			await this.store.updateState(resolved.session.sessionId, 'active');
			const activeSession: UnifiedSession = { ...resolved.session, state: 'active' };
			this.stateCache.set(activeSession.sessionId, activeSession);
			return { ...resolved, session: activeSession };
		}

		// Existing session: cache latest state
		this.stateCache.set(resolved.session.sessionId, resolved.session);
		return resolved;
	}

	/**
	 * Transition session to a new state with validation (ADR-021).
	 *
	 * Used by orchestrator (react-loop) for active → thinking, thinking → tool_executing, etc.
	 *
	 * @throws {SessionTransitionError} if the transition is not valid
	 */
	async transitionState(sessionId: string, newState: SessionState): Promise<void> {
		const cached = this.stateCache.get(sessionId);
		if (!cached) {
			return;
		}

		transition(cached.state, newState);
		await this.store.updateState(sessionId, newState);
		this.stateCache.set(sessionId, { ...cached, state: newState });
	}

	/**
	 * Extract channel context from resolved session for LLM.
	 *
	 * Provides channel switching metadata so LLM can:
	 * - Understand cross-channel conversation flow
	 * - Reference previous channel context naturally
	 * - Adapt response tone via PersonaEngine adaptations
	 */
	getChannelContext(resolved: ResolvedSession): ChannelContext {
		const { session, channelSwitched, isNew } = resolved;
		const history = session.channelHistory;

		let previousChannel: string | null = null;
		if (channelSwitched && history.length >= 2) {
			previousChannel = history[history.length - 2] ?? null;
		}

		return {
			currentChannel: session.activeChannelId,
			previousChannel,
			channelSwitched: channelSwitched && !isNew,
			sessionChannels: [...session.channelHistory],
		};
	}

	/** Update session activity after a turn */
	async updateActivity(sessionId: string): Promise<void> {
		await this.store.updateActivity(sessionId);
	}

	/** Get active session for proactive messaging */
	async getActiveSession(userId: string): Promise<UnifiedSession | null> {
		return this.store.getActive(userId);
	}

	/** Get session statistics */
	async getSessionStats(sessionId: string): Promise<SessionStats> {
		return this.store.getStats(sessionId);
	}

	/**
	 * End session and generate summary for episodic memory (ADR-021).
	 *
	 * Validates state transitions: active → summarizing → ending → ended.
	 *
	 * @throws {SessionTransitionError} if session is not in 'active' state
	 */
	async endSession(sessionId: string): Promise<SessionSummary> {
		const cached = this.stateCache.get(sessionId);

		if (cached) {
			// Validate: active → summarizing (ADR-021)
			transition(cached.state, 'summarizing');
			await this.store.updateState(sessionId, 'summarizing');

			// summarizing → ending
			transition('summarizing', 'ending');
			await this.store.updateState(sessionId, 'ending');
		}

		const summary = await this.store.end(sessionId);

		if (cached) {
			// ending → ended
			transition('ending', 'ended');
			await this.store.updateState(sessionId, 'ended');
			this.stateCache.delete(sessionId);
		}

		return summary;
	}
}
