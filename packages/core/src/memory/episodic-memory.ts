import type { ComponentHealth } from '../types/health.js';
import type { SessionSummary } from '../types/session.js';
import type {
	CreateSessionParams,
	EpisodicMemory,
	MessageRecord,
	SessionListInfo,
} from './types.js';

interface StoredSession {
	readonly sessionId: string;
	readonly userId: string;
	readonly channelId: string;
	readonly metadata: Readonly<Record<string, unknown>>;
	readonly messages: MessageRecord[];
	readonly startedAt: Date;
	summary: string | null;
	endedAt: Date | null;
}

/** In-memory stub for M2 Episodic Memory (ADR-013). Production uses PostgreSQL. */
export class InMemoryEpisodicMemory implements EpisodicMemory {
	readonly layerName = 'M2:episodic' as const;
	private readonly sessions = new Map<string, StoredSession>();
	private nextId = 0;

	async createSession(params: CreateSessionParams): Promise<string> {
		const sessionId = `session-${++this.nextId}`;
		this.sessions.set(sessionId, {
			sessionId,
			userId: params.userId,
			channelId: params.channelId,
			metadata: params.metadata ?? {},
			messages: [],
			startedAt: new Date(),
			summary: null,
			endedAt: null,
		});
		return sessionId;
	}

	async endSession(sessionId: string, summary: string): Promise<void> {
		const session = this.sessions.get(sessionId);
		if (!session) {
			throw new Error(`Session not found: ${sessionId}`);
		}
		// Mutate the stored session (internal mutable state)
		(session as { summary: string | null }).summary = summary;
		(session as { endedAt: Date | null }).endedAt = new Date();
	}

	async addMessage(sessionId: string, message: MessageRecord): Promise<void> {
		const session = this.sessions.get(sessionId);
		if (!session) {
			throw new Error(`Session not found: ${sessionId}`);
		}
		session.messages.push(message);
	}

	async getRecentSessions(userId: string, limit: number): Promise<readonly SessionSummary[]> {
		const completed = [...this.sessions.values()]
			.filter((s) => s.userId === userId && s.endedAt !== null)
			.sort((a, b) => (b.endedAt?.getTime() ?? 0) - (a.endedAt?.getTime() ?? 0))
			.slice(0, limit);

		return completed.map((s) => this.toSessionSummary(s));
	}

	async searchByTopic(topic: string, limit: number): Promise<readonly SessionSummary[]> {
		const lowerTopic = topic.toLowerCase();
		return [...this.sessions.values()]
			.filter(
				(s) =>
					s.endedAt !== null &&
					(s.summary?.toLowerCase().includes(lowerTopic) ||
						s.messages.some((m) => m.content.toLowerCase().includes(lowerTopic))),
			)
			.slice(0, limit)
			.map((s) => this.toSessionSummary(s));
	}

	async getSessionMessages(sessionId: string): Promise<readonly MessageRecord[]> {
		const session = this.sessions.get(sessionId);
		if (!session) return [];
		return [...session.messages];
	}

	async listSessions(userId: string, limit = 50): Promise<readonly SessionListInfo[]> {
		return [...this.sessions.values()]
			.filter((s) => s.userId === userId)
			.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
			.slice(0, limit)
			.map((s) => ({
				sessionId: s.sessionId,
				title: s.summary ?? `Session ${s.sessionId.slice(0, 8)}`,
				channelId: s.channelId,
				turnCount: s.messages.length,
				startedAt: s.startedAt,
				endedAt: s.endedAt,
			}));
	}

	async searchByContent(query: string, limit: number): Promise<readonly MessageRecord[]> {
		const lowerQuery = query.toLowerCase();
		const results: MessageRecord[] = [];
		for (const session of this.sessions.values()) {
			for (const msg of session.messages) {
				if (msg.content.toLowerCase().includes(lowerQuery)) {
					results.push(msg);
					if (results.length >= limit) {
						return results;
					}
				}
			}
		}
		return results;
	}

	async healthCheck(): Promise<ComponentHealth> {
		return {
			state: 'healthy',
			latencyMs: 0,
			message: null,
			lastChecked: new Date(),
		};
	}

	private toSessionSummary(session: StoredSession): SessionSummary {
		const channels = [...new Set(session.messages.map((m) => m.channelId))];
		return {
			sessionId: session.sessionId,
			summary: session.summary ?? '',
			keyTopics: [],
			emotionalTone: 'neutral',
			turnCount: session.messages.length,
			channelHistory: channels.length > 0 ? channels : [session.channelId],
			startedAt: session.startedAt,
			endedAt: session.endedAt ?? new Date(),
		};
	}
}
