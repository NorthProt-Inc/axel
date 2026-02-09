import type { Client } from 'pg';

export interface VerificationCheck {
	readonly name: string;
	readonly passed: boolean;
	readonly detail: string;
}

export interface VerificationResult {
	readonly timestamp: string;
	readonly checks: readonly VerificationCheck[];
	readonly allPassed: boolean;
}

export async function verify(client: Client): Promise<VerificationResult> {
	const checks: VerificationCheck[] = [];

	// Check 1: No space-containing relation types
	const relResult = await client.query<{ cnt: string }>(`
		SELECT COUNT(*)::text AS cnt FROM relations WHERE relation_type LIKE '% %'
	`);
	const spaceRelations = Number.parseInt(relResult.rows[0]?.cnt ?? '0', 10);
	checks.push({
		name: 'relation_type_no_spaces',
		passed: spaceRelations === 0,
		detail: `${spaceRelations} relation types contain spaces`,
	});

	// Check 2: No compound entity types
	const entityResult = await client.query<{ cnt: string }>(`
		SELECT COUNT(*)::text AS cnt FROM entities WHERE entity_type LIKE '%/%'
	`);
	const compoundTypes = Number.parseInt(entityResult.rows[0]?.cnt ?? '0', 10);
	checks.push({
		name: 'entity_type_no_compound',
		passed: compoundTypes === 0,
		detail: `${compoundTypes} entity types contain '/'`,
	});

	// Check 3: No empty content messages
	const emptyResult = await client.query<{ cnt: string }>(`
		SELECT COUNT(*)::text AS cnt FROM messages WHERE content = '' OR content IS NULL
	`);
	const emptyMessages = Number.parseInt(emptyResult.rows[0]?.cnt ?? '0', 10);
	checks.push({
		name: 'no_empty_messages',
		passed: emptyMessages === 0,
		detail: `${emptyMessages} messages with empty content`,
	});

	// Check 4: No orphaned interaction_logs session references
	const ilOrphanResult = await client.query<{ cnt: string }>(`
		SELECT COUNT(*)::text AS cnt
		FROM interaction_logs il
		LEFT JOIN sessions s ON s.session_id = il.session_id
		WHERE il.session_id IS NOT NULL AND s.session_id IS NULL
	`);
	const ilOrphans = Number.parseInt(ilOrphanResult.rows[0]?.cnt ?? '0', 10);
	checks.push({
		name: 'no_orphan_interaction_logs',
		passed: ilOrphans === 0,
		detail: `${ilOrphans} interaction_logs with orphaned session_id`,
	});

	// Check 5: No orphaned memories session references
	const memOrphanResult = await client.query<{ cnt: string }>(`
		SELECT COUNT(*)::text AS cnt
		FROM memories m
		LEFT JOIN sessions s ON s.session_id = m.source_session
		WHERE m.source_session IS NOT NULL AND s.session_id IS NULL
	`);
	const memOrphans = Number.parseInt(memOrphanResult.rows[0]?.cnt ?? '0', 10);
	checks.push({
		name: 'no_orphan_memories',
		passed: memOrphans === 0,
		detail: `${memOrphans} memories with orphaned source_session`,
	});

	// Check 6: Summary counts
	const summaryResult = await client.query<{ t: string; c: string }>(`
		SELECT 'entities' AS t, COUNT(*)::text AS c FROM entities
		UNION ALL SELECT 'relations', COUNT(*)::text FROM relations
		UNION ALL SELECT 'memories', COUNT(*)::text FROM memories
	`);

	const summaryLines = summaryResult.rows.map((r) => `${r.t}: ${r.c}`).join(', ');
	checks.push({
		name: 'summary_counts',
		passed: true,
		detail: summaryLines,
	});

	// --- Backfill verification checks ---

	// Check 7: No NULL session_id in interaction_logs
	const nullSessionResult = await client.query<{ cnt: string }>(`
		SELECT COUNT(*)::text AS cnt FROM interaction_logs WHERE session_id IS NULL
	`);
	const nullSessions = Number.parseInt(nullSessionResult.rows[0]?.cnt ?? '0', 10);
	checks.push({
		name: 'no_null_session_id',
		passed: nullSessions === 0,
		detail: `${nullSessions} interaction_logs with NULL session_id`,
	});

	// Check 8: No NULL source_session in memories
	const nullSourceResult = await client.query<{ cnt: string }>(`
		SELECT COUNT(*)::text AS cnt FROM memories WHERE source_session IS NULL
	`);
	const nullSources = Number.parseInt(nullSourceResult.rows[0]?.cnt ?? '0', 10);
	checks.push({
		name: 'no_null_source_session',
		passed: nullSources === 0,
		detail: `${nullSources} memories with NULL source_session`,
	});

	// Check 9: All sessions have summaries
	const noSummaryResult = await client.query<{ cnt: string }>(`
		SELECT COUNT(*)::text AS cnt FROM sessions WHERE summary IS NULL
	`);
	const noSummary = Number.parseInt(noSummaryResult.rows[0]?.cnt ?? '0', 10);
	checks.push({
		name: 'sessions_have_summary',
		passed: noSummary === 0,
		detail: `${noSummary} sessions without summary`,
	});

	// Check 10: No NULL decayed_importance in memories
	const noDecayResult = await client.query<{ cnt: string }>(`
		SELECT COUNT(*)::text AS cnt FROM memories WHERE decayed_importance IS NULL
	`);
	const noDecay = Number.parseInt(noDecayResult.rows[0]?.cnt ?? '0', 10);
	checks.push({
		name: 'no_null_decayed_importance',
		passed: noDecay === 0,
		detail: `${noDecay} memories with NULL decayed_importance`,
	});

	// Check 11: session_summaries populated
	const sessSumResult = await client.query<{ cnt: string }>(`
		SELECT COUNT(*)::text AS cnt FROM session_summaries
	`);
	const sessSumCount = Number.parseInt(sessSumResult.rows[0]?.cnt ?? '0', 10);
	const totalSessions = await client.query<{ cnt: string }>(`
		SELECT COUNT(*)::text AS cnt FROM sessions
	`);
	const totalSessCount = Number.parseInt(totalSessions.rows[0]?.cnt ?? '0', 10);
	checks.push({
		name: 'session_summaries_populated',
		passed: sessSumCount >= totalSessCount,
		detail: `${sessSumCount}/${totalSessCount} session_summaries rows`,
	});

	return {
		timestamp: new Date().toISOString(),
		checks,
		allPassed: checks.every((c) => c.passed),
	};
}
