/** Telemetry log entry for a single LLM interaction */
export interface InteractionLog {
	readonly sessionId: string | null;
	readonly channelId: string;
	readonly effectiveModel: string;
	readonly tier: string;
	readonly routerReason: string;
	readonly latencyMs: number;
	readonly tokensIn: number | null;
	readonly tokensOut: number | null;
	readonly toolCalls: readonly {
		readonly toolName: string;
		readonly durationMs: number;
		readonly success: boolean;
	}[];
	readonly error: string | null;
}

/** Telemetry adapter — fire-and-forget logging */
export interface InteractionLogger {
	log(entry: InteractionLog): Promise<void>;
}
