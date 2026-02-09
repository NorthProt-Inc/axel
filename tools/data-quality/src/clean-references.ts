import type { Client } from 'pg';

export interface CleanReferencesResult {
	readonly interactionLogsFixed: number;
	readonly memoriesFixed: number;
}

export async function cleanReferencesDryRun(client: Client): Promise<CleanReferencesResult> {
	const ilResult = await client.query<{ cnt: string }>(`
		SELECT COUNT(*)::text AS cnt
		FROM interaction_logs il
		LEFT JOIN sessions s ON s.session_id = il.session_id
		WHERE il.session_id IS NOT NULL AND s.session_id IS NULL
	`);

	const memResult = await client.query<{ cnt: string }>(`
		SELECT COUNT(*)::text AS cnt
		FROM memories m
		LEFT JOIN sessions s ON s.session_id = m.source_session
		WHERE m.source_session IS NOT NULL AND s.session_id IS NULL
	`);

	return {
		interactionLogsFixed: Number.parseInt(ilResult.rows[0]?.cnt ?? '0', 10),
		memoriesFixed: Number.parseInt(memResult.rows[0]?.cnt ?? '0', 10),
	};
}

export async function cleanReferences(client: Client): Promise<CleanReferencesResult> {
	// Null out orphaned session references
	const ilResult = await client.query(`
		UPDATE interaction_logs SET session_id = NULL
		WHERE session_id IS NOT NULL
		AND session_id NOT IN (SELECT session_id FROM sessions)
	`);

	const memResult = await client.query(`
		UPDATE memories SET source_session = NULL
		WHERE source_session IS NOT NULL
		AND source_session NOT IN (SELECT session_id FROM sessions)
	`);

	return {
		interactionLogsFixed: ilResult.rowCount ?? 0,
		memoriesFixed: memResult.rowCount ?? 0,
	};
}
