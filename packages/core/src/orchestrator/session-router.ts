import type { SessionSummary } from '../types/session.js';
import type {
	ChannelContext,
	ResolvedSession,
	SessionStats,
	SessionStore,
	UnifiedSession,
} from './types.js';

/**
 * Cross-Channel Session Router (ADR-014).
 *
 * Routes incoming messages to the correct unified session.
 * Delegates actual session storage to the injected SessionStore.
 *
 * Key responsibilities:
 * - Session resolution (new or existing)
 * - Channel context extraction for LLM
 * - Activity tracking
 * - Session lifecycle (end → summary)
 */
export class SessionRouter {
	private readonly store: SessionStore;

	constructor(store: SessionStore) {
		this.store = store;
	}

	/** Resolve session for incoming message (ADR-014 lifecycle) */
	async resolveSession(userId: string, channelId: string): Promise<ResolvedSession> {
		return this.store.resolve(userId, channelId);
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

	/** End session and generate summary for episodic memory */
	async endSession(sessionId: string): Promise<SessionSummary> {
		return this.store.end(sessionId);
	}
}
