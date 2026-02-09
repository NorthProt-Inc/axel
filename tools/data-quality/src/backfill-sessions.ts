import type { Client } from 'pg';

/** Known session IDs */
const S1 = '29f567a9-62d2-47bd-b39e-98ed59e205e9';
const S2 = '4f4112f9-ecff-4bc5-8ea8-4b6e90b3fe36';
const S3 = '880aac0a-5b0c-41ca-8c67-0461bbee5497';

/** S2 start timestamp — logs before this belong to S1 */
const S2_START = '2026-02-06 10:26:10+00';

/** S3 start timestamp — logs before this belong to S2 */
const S3_START = '2026-02-07 11:19:06+00';

/** Extended S1 end time (covers gap between S1 and S2) */
const S1_EXTENDED_END = '2026-02-06 10:26:09+00';

export interface BackfillSessionsResult {
	readonly s1EndExtended: boolean;
	readonly nullSessionsFixed: number;
	readonly s2ToS1Reassigned: number;
	readonly s3ToS2Reassigned: number;
	readonly memoriesLinked: number;
	readonly s1TurnCountUpdated: number;
}

export async function backfillSessionsDryRun(client: Client): Promise<BackfillSessionsResult> {
	// Step 0: Check if S1 ended_at needs extending
	const s1Check = await client.query<{ ended_at: string }>(
		`SELECT ended_at::text FROM sessions WHERE session_id = $1`,
		[S1],
	);
	const s1NeedsExtend =
		s1Check.rows[0] !== undefined && new Date(s1Check.rows[0].ended_at) < new Date(S1_EXTENDED_END);

	// Step 1a: Count NULL session_id logs
	const nullRes = await client.query<{ cnt: string }>(
		`SELECT COUNT(*)::text AS cnt FROM interaction_logs WHERE session_id IS NULL`,
	);
	const nullCount = Number.parseInt(nullRes.rows[0]?.cnt ?? '0', 10);

	// Step 1b: Count S2 logs that belong to S1
	const s2ToS1Res = await client.query<{ cnt: string }>(
		`SELECT COUNT(*)::text AS cnt FROM interaction_logs
		 WHERE session_id = $1 AND ts < $2`,
		[S2, S2_START],
	);
	const s2ToS1Count = Number.parseInt(s2ToS1Res.rows[0]?.cnt ?? '0', 10);

	// Step 1c: Count S3 logs that belong to S2
	const s3ToS2Res = await client.query<{ cnt: string }>(
		`SELECT COUNT(*)::text AS cnt FROM interaction_logs
		 WHERE session_id = $1 AND ts < $2`,
		[S3, S3_START],
	);
	const s3ToS2Count = Number.parseInt(s3ToS2Res.rows[0]?.cnt ?? '0', 10);

	// Step 2: Count memories without source_session
	const memRes = await client.query<{ cnt: string }>(
		`SELECT COUNT(*)::text AS cnt FROM memories WHERE source_session IS NULL`,
	);
	const memCount = Number.parseInt(memRes.rows[0]?.cnt ?? '0', 10);

	// Step 3: Preview S1 turn count
	const turnRes = await client.query<{ cnt: string }>(
		`SELECT COUNT(*)::text AS cnt FROM interaction_logs WHERE session_id = $1`,
		[S1],
	);
	const turnCount = Number.parseInt(turnRes.rows[0]?.cnt ?? '0', 10);

	return {
		s1EndExtended: s1NeedsExtend,
		nullSessionsFixed: nullCount,
		s2ToS1Reassigned: s2ToS1Count,
		s3ToS2Reassigned: s3ToS2Count,
		memoriesLinked: memCount,
		s1TurnCountUpdated: turnCount,
	};
}

export async function backfillSessions(client: Client): Promise<BackfillSessionsResult> {
	// Step 0: Extend S1 ended_at to cover gap period
	const s1Ext = await client.query(
		`UPDATE sessions SET ended_at = $1 WHERE session_id = $2 AND ended_at < $1`,
		[S1_EXTENDED_END, S1],
	);
	const s1EndExtended = (s1Ext.rowCount ?? 0) > 0;

	// Step 1a: Assign NULL session_id → S1
	const nullFix = await client.query(
		`UPDATE interaction_logs SET session_id = $1 WHERE session_id IS NULL`,
		[S1],
	);
	const nullSessionsFixed = nullFix.rowCount ?? 0;

	// Step 1b: Reassign S2 → S1 (logs before S2 start)
	const s2Fix = await client.query(
		`UPDATE interaction_logs SET session_id = $1
		 WHERE session_id = $2 AND ts < $3`,
		[S1, S2, S2_START],
	);
	const s2ToS1Reassigned = s2Fix.rowCount ?? 0;

	// Step 1c: Reassign S3 → S2 (logs before S3 start)
	const s3Fix = await client.query(
		`UPDATE interaction_logs SET session_id = $1
		 WHERE session_id = $2 AND ts < $3`,
		[S2, S3, S3_START],
	);
	const s3ToS2Reassigned = s3Fix.rowCount ?? 0;

	// Step 2: Link memories to sessions via timestamp overlap
	const memFix = await client.query(
		`UPDATE memories
		 SET source_session = (
			SELECT s.session_id FROM sessions s
			WHERE memories.created_at >= s.started_at
			  AND memories.created_at <= s.ended_at
			ORDER BY s.started_at DESC LIMIT 1
		 )
		 WHERE source_session IS NULL`,
	);
	const memoriesLinked = memFix.rowCount ?? 0;

	// Step 3: Correct S1 turn_count
	const turnRes = await client.query<{ cnt: string }>(
		`SELECT COUNT(*)::text AS cnt FROM interaction_logs WHERE session_id = $1`,
		[S1],
	);
	const newTurnCount = Number.parseInt(turnRes.rows[0]?.cnt ?? '0', 10);
	await client.query(`UPDATE sessions SET turn_count = $1 WHERE session_id = $2`, [
		newTurnCount,
		S1,
	]);

	return {
		s1EndExtended,
		nullSessionsFixed,
		s2ToS1Reassigned,
		s3ToS2Reassigned,
		memoriesLinked,
		s1TurnCountUpdated: newTurnCount,
	};
}
