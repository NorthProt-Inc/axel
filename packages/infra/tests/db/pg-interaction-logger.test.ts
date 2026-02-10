import type { InteractionLog } from '@axel/core/orchestrator';
import { describe, expect, it, vi } from 'vitest';
import { PgInteractionLogger } from '../../src/db/pg-interaction-logger.js';

function mockPool() {
	return {
		query: vi.fn().mockResolvedValue({ rows: [], rowCount: 1 }),
	};
}

const SAMPLE_LOG: InteractionLog = {
	sessionId: 'sess-001',
	channelId: 'discord',
	effectiveModel: 'claude-sonnet-4-5-20250929',
	tier: 'primary',
	routerReason: 'default',
	latencyMs: 450,
	tokensIn: 200,
	tokensOut: 150,
	toolCalls: [{ toolName: 'search', durationMs: 100, success: true }],
	error: null,
};

describe('PgInteractionLogger', () => {
	it('inserts log entry into interaction_logs table', async () => {
		const pool = mockPool();
		const logger = new PgInteractionLogger(pool);

		await logger.log(SAMPLE_LOG);

		expect(pool.query).toHaveBeenCalledTimes(1);
		const [sql, params] = pool.query.mock.calls[0] as [string, unknown[]];
		expect(sql).toContain('INSERT INTO interaction_logs');
		expect(params).toContain('sess-001');
		expect(params).toContain('discord');
		expect(params).toContain(450);
	});

	it('serializes toolCalls as JSON', async () => {
		const pool = mockPool();
		const logger = new PgInteractionLogger(pool);

		await logger.log(SAMPLE_LOG);

		const params = pool.query.mock.calls[0]?.[1] as unknown[];
		const toolCallsJson = params[8] as string;
		expect(JSON.parse(toolCallsJson)).toEqual([
			{ toolName: 'search', durationMs: 100, success: true },
		]);
	});

	it('does not throw on query failure', async () => {
		const pool = {
			query: vi.fn().mockRejectedValue(new Error('Connection lost')),
		};
		const logger = new PgInteractionLogger(pool);

		await expect(logger.log(SAMPLE_LOG)).resolves.toBeUndefined();
	});

	it('handles null session_id', async () => {
		const pool = mockPool();
		const logger = new PgInteractionLogger(pool);

		await logger.log({ ...SAMPLE_LOG, sessionId: null });

		const params = pool.query.mock.calls[0]?.[1] as unknown[];
		expect(params[0]).toBeNull();
	});
});
