/** Session lifecycle state machine (ERR-041) */
export type SessionState =
	| 'initializing'
	| 'active'
	| 'thinking'
	| 'tool_executing'
	| 'summarizing'
	| 'ending'
	| 'ended';

/** Session summary for episodic memory storage */
export interface SessionSummary {
	readonly sessionId: string;
	readonly summary: string;
	readonly keyTopics: readonly string[];
	readonly emotionalTone: string;
	readonly turnCount: number;
	readonly channelHistory: readonly string[];
	readonly startedAt: Date;
	readonly endedAt: Date;
}
