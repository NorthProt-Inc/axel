import type { Client } from 'pg';

export interface RelationTypeIssue {
	readonly normalized: string;
	readonly variants: readonly string[];
	readonly count: number;
}

export interface CompoundEntityType {
	readonly entityType: string;
	readonly count: number;
}

export interface OrphanedEntity {
	readonly entityId: string;
	readonly name: string;
	readonly entityType: string;
	readonly mentions: number;
}

export interface FallbackMemory {
	readonly id: number;
	readonly contentPreview: string;
}

export interface OrphanedReference {
	readonly table: string;
	readonly column: string;
	readonly count: number;
}

export interface QualityReport {
	readonly timestamp: string;
	readonly summary: {
		readonly totalEntities: number;
		readonly totalRelations: number;
		readonly totalMemories: number;
		readonly totalMessages: number;
	};
	readonly issues: {
		readonly relationTypeVariants: readonly RelationTypeIssue[];
		readonly compoundEntityTypes: readonly CompoundEntityType[];
		readonly orphanedEntities: readonly OrphanedEntity[];
		readonly fallbackMemories: readonly FallbackMemory[];
		readonly emptyContentMessages: readonly number[];
		readonly orphanedReferences: readonly OrphanedReference[];
	};
}

export async function generateReport(client: Client): Promise<QualityReport> {
	const [
		summary,
		relationVariants,
		compoundTypes,
		orphanedEntities,
		fallbackMemories,
		emptyMessages,
		orphanedRefs,
	] = await Promise.all([
		querySummary(client),
		queryRelationTypeVariants(client),
		queryCompoundEntityTypes(client),
		queryOrphanedEntities(client),
		queryFallbackMemories(client),
		queryEmptyContentMessages(client),
		queryOrphanedReferences(client),
	]);

	return {
		timestamp: new Date().toISOString(),
		summary,
		issues: {
			relationTypeVariants: relationVariants,
			compoundEntityTypes: compoundTypes,
			orphanedEntities,
			fallbackMemories,
			emptyContentMessages: emptyMessages,
			orphanedReferences: orphanedRefs,
		},
	};
}

async function querySummary(client: Client) {
	const result = await client.query<{ t: string; c: string }>(`
		SELECT 'entities' AS t, COUNT(*)::text AS c FROM entities
		UNION ALL SELECT 'relations', COUNT(*)::text FROM relations
		UNION ALL SELECT 'memories', COUNT(*)::text FROM memories
		UNION ALL SELECT 'messages', COUNT(*)::text FROM messages
	`);

	const counts = Object.fromEntries(result.rows.map((r) => [r.t, Number.parseInt(r.c, 10)]));
	return {
		totalEntities: counts['entities'] ?? 0,
		totalRelations: counts['relations'] ?? 0,
		totalMemories: counts['memories'] ?? 0,
		totalMessages: counts['messages'] ?? 0,
	};
}

async function queryRelationTypeVariants(client: Client): Promise<RelationTypeIssue[]> {
	const result = await client.query<{
		normalized: string;
		variants: string;
		cnt: string;
	}>(`
		SELECT
			REPLACE(LOWER(TRIM(relation_type)), ' ', '_') AS normalized,
			STRING_AGG(DISTINCT relation_type, ', ' ORDER BY relation_type) AS variants,
			COUNT(*)::text AS cnt
		FROM relations
		GROUP BY REPLACE(LOWER(TRIM(relation_type)), ' ', '_')
		HAVING COUNT(DISTINCT relation_type) > 1
		ORDER BY cnt DESC
	`);

	return result.rows.map((r) => ({
		normalized: r.normalized,
		variants: r.variants.split(', '),
		count: Number.parseInt(r.cnt, 10),
	}));
}

async function queryCompoundEntityTypes(client: Client): Promise<CompoundEntityType[]> {
	const result = await client.query<{ entity_type: string; cnt: string }>(`
		SELECT entity_type, COUNT(*)::text AS cnt
		FROM entities
		WHERE entity_type LIKE '%/%'
		GROUP BY entity_type
		ORDER BY cnt DESC
	`);

	return result.rows.map((r) => ({
		entityType: r.entity_type,
		count: Number.parseInt(r.cnt, 10),
	}));
}

async function queryOrphanedEntities(client: Client): Promise<OrphanedEntity[]> {
	const result = await client.query<{
		entity_id: string;
		name: string;
		entity_type: string;
		mentions: number;
	}>(`
		SELECT e.entity_id, e.name, e.entity_type, e.mentions
		FROM entities e
		LEFT JOIN relations r ON r.source_id = e.entity_id OR r.target_id = e.entity_id
		WHERE e.mentions <= 2 AND r.id IS NULL
		ORDER BY e.mentions ASC, e.name ASC
	`);

	return result.rows.map((r) => ({
		entityId: r.entity_id,
		name: r.name,
		entityType: r.entity_type,
		mentions: r.mentions,
	}));
}

async function queryFallbackMemories(client: Client): Promise<FallbackMemory[]> {
	// Find memories that are 'conversation' type but contain patterns suggesting
	// they should be fact/preference/insight — these are the fallback-classified ones
	const result = await client.query<{ id: number; content_preview: string }>(`
		SELECT id, LEFT(content, 100) AS content_preview
		FROM memories
		WHERE memory_type = 'conversation'
		AND (
			content ~* '(prefers|likes|favorite|dislikes|hates|enjoys|loves)'
			OR content ~* '(born|lives in|name is|works at|works for|is from|moved to)'
			OR content ~* '(realized|learned|pattern|insight|discovered|noticed)'
		)
		ORDER BY id
	`);

	return result.rows.map((r) => ({
		id: r.id,
		contentPreview: r.content_preview,
	}));
}

async function queryEmptyContentMessages(client: Client): Promise<number[]> {
	const result = await client.query<{ id: number }>(`
		SELECT id FROM messages WHERE content = '' OR content IS NULL
		ORDER BY id
	`);

	return result.rows.map((r) => r.id);
}

async function queryOrphanedReferences(client: Client): Promise<OrphanedReference[]> {
	const results: OrphanedReference[] = [];

	const ilResult = await client.query<{ cnt: string }>(`
		SELECT COUNT(*)::text AS cnt
		FROM interaction_logs il
		LEFT JOIN sessions s ON s.session_id = il.session_id
		WHERE il.session_id IS NOT NULL AND s.session_id IS NULL
	`);
	const ilCount = Number.parseInt(ilResult.rows[0]?.cnt ?? '0', 10);
	if (ilCount > 0) {
		results.push({ table: 'interaction_logs', column: 'session_id', count: ilCount });
	}

	const memResult = await client.query<{ cnt: string }>(`
		SELECT COUNT(*)::text AS cnt
		FROM memories m
		LEFT JOIN sessions s ON s.session_id = m.source_session
		WHERE m.source_session IS NOT NULL AND s.session_id IS NULL
	`);
	const memCount = Number.parseInt(memResult.rows[0]?.cnt ?? '0', 10);
	if (memCount > 0) {
		results.push({ table: 'memories', column: 'source_session', count: memCount });
	}

	return results;
}
