import type { Client } from 'pg';

export interface CleanEntitiesResult {
	readonly compoundTypesNormalized: number;
	readonly orphanedEntitiesRemoved: number;
}

export async function cleanEntitiesDryRun(client: Client): Promise<CleanEntitiesResult> {
	const compoundResult = await client.query<{ cnt: string }>(`
		SELECT COUNT(*)::text AS cnt FROM entities WHERE entity_type LIKE '%/%'
	`);

	const orphanResult = await client.query<{ cnt: string }>(`
		SELECT COUNT(*)::text AS cnt
		FROM entities e
		LEFT JOIN relations r ON r.source_id = e.entity_id OR r.target_id = e.entity_id
		WHERE e.mentions = 1 AND r.id IS NULL
	`);

	return {
		compoundTypesNormalized: Number.parseInt(compoundResult.rows[0]?.cnt ?? '0', 10),
		orphanedEntitiesRemoved: Number.parseInt(orphanResult.rows[0]?.cnt ?? '0', 10),
	};
}

export async function cleanEntities(client: Client): Promise<CleanEntitiesResult> {
	// Step 3a: Normalize compound entity types (e.g., 'AI/System' → 'ai')
	// Preserve original type in properties.original_entity_type
	const compoundResult = await client.query(`
		UPDATE entities
		SET properties = jsonb_set(
				COALESCE(properties, '{}'::jsonb),
				'{original_entity_type}',
				to_jsonb(entity_type)
			),
			entity_type = LOWER(SPLIT_PART(entity_type, '/', 1))
		WHERE entity_type LIKE '%/%'
	`);

	// Step 3b: Remove orphaned entities (mentions=1, no relations)
	const orphanResult = await client.query(`
		DELETE FROM entities WHERE entity_id IN (
			SELECT e.entity_id
			FROM entities e
			LEFT JOIN relations r ON r.source_id = e.entity_id OR r.target_id = e.entity_id
			WHERE e.mentions = 1 AND r.id IS NULL
		)
	`);

	return {
		compoundTypesNormalized: compoundResult.rowCount ?? 0,
		orphanedEntitiesRemoved: orphanResult.rowCount ?? 0,
	};
}
