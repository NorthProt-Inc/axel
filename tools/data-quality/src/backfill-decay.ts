import type { Client } from 'pg';

/** Decay rate constant. Half-life ≈ ln(2)/λ ≈ 69.3 days */
const LAMBDA = 0.01;

export interface DecayResult {
	readonly memoriesDecayed: number;
}

export function calculateDecay(importance: number, createdAt: Date, now: Date): number {
	const ageDays = (now.getTime() - createdAt.getTime()) / 86_400_000;
	return importance * Math.exp(-LAMBDA * ageDays);
}

export async function backfillDecayDryRun(client: Client): Promise<DecayResult> {
	const res = await client.query<{ cnt: string }>(
		`SELECT COUNT(*)::text AS cnt FROM memories WHERE decayed_importance IS NULL`,
	);
	return {
		memoriesDecayed: Number.parseInt(res.rows[0]?.cnt ?? '0', 10),
	};
}

export async function backfillDecay(client: Client): Promise<DecayResult> {
	const res = await client.query(
		`UPDATE memories
		 SET decayed_importance = importance * EXP(-0.01 * EXTRACT(EPOCH FROM (NOW() - created_at)) / 86400),
		     last_decayed_at = NOW()
		 WHERE decayed_importance IS NULL`,
	);

	return {
		memoriesDecayed: res.rowCount ?? 0,
	};
}
