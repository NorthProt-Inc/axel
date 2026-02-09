import type { InteractionLog, InteractionLogger } from '@axel/core/orchestrator';
import type { Logger } from '@axel/core/logging';
import { NoopLogger } from '@axel/core/logging';
import type { PgPoolDriver } from './pg-pool.js';

/**
 * PostgreSQL interaction logger (GAP-09).
 *
 * Writes telemetry to the interaction_logs table (migration 006).
 * Fire-and-forget — errors are logged but never propagated.
 */
export class PgInteractionLogger implements InteractionLogger {
	private readonly pool: PgPoolDriver;
	private readonly logger: Logger;

	constructor(pool: PgPoolDriver, logger?: Logger) {
		this.pool = pool;
		this.logger = logger ?? new NoopLogger();
	}

	async log(entry: InteractionLog): Promise<void> {
		try {
			await this.pool.query(
				`INSERT INTO interaction_logs
				   (session_id, channel_id, effective_model, tier, router_reason,
				    latency_ms, tokens_in, tokens_out, tool_calls, error)
				 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
				[
					entry.sessionId,
					entry.channelId,
					entry.effectiveModel,
					entry.tier,
					entry.routerReason,
					entry.latencyMs,
					entry.tokensIn,
					entry.tokensOut,
					JSON.stringify(entry.toolCalls),
					entry.error,
				],
			);
		} catch (err: unknown) {
			this.logger.warn('Failed to write interaction log', {
				error: err instanceof Error ? err.message : String(err),
			});
		}
	}
}
