import type { Client } from 'pg';

export interface CleanRelationsResult {
	readonly duplicatesRemoved: number;
	readonly typesNormalized: number;
}

export function normalizeRelationType(raw: string): string {
	return raw.trim().toLowerCase().replace(/\s+/g, '_');
}

export async function cleanRelationsDryRun(client: Client): Promise<CleanRelationsResult> {
	const dupResult = await client.query<{ cnt: string }>(`
		SELECT COUNT(*)::text AS cnt FROM (
			SELECT id FROM (
				SELECT id,
					ROW_NUMBER() OVER (
						PARTITION BY source_id, target_id,
							REPLACE(LOWER(TRIM(relation_type)), ' ', '_')
						ORDER BY weight DESC NULLS LAST, id ASC
					) AS rn
				FROM relations
			) ranked
			WHERE rn > 1
		) AS dups
	`);

	const normResult = await client.query<{ cnt: string }>(`
		SELECT COUNT(*)::text AS cnt
		FROM relations
		WHERE relation_type != REPLACE(LOWER(TRIM(relation_type)), ' ', '_')
	`);

	return {
		duplicatesRemoved: Number.parseInt(dupResult.rows[0]?.cnt ?? '0', 10),
		typesNormalized: Number.parseInt(normResult.rows[0]?.cnt ?? '0', 10),
	};
}

export async function cleanRelations(client: Client): Promise<CleanRelationsResult> {
	// Step 1: Remove duplicate relations that would conflict after normalization.
	// For each (source_id, target_id, normalized_type) group, keep the row with
	// highest weight (ties broken by lowest id) and delete the rest.
	const dupResult = await client.query(`
		DELETE FROM relations WHERE id IN (
			SELECT id FROM (
				SELECT id,
					ROW_NUMBER() OVER (
						PARTITION BY source_id, target_id,
							REPLACE(LOWER(TRIM(relation_type)), ' ', '_')
						ORDER BY weight DESC NULLS LAST, id ASC
					) AS rn
				FROM relations
			) ranked
			WHERE rn > 1
		)
	`);

	// Step 2: Normalize all remaining relation types to snake_case.
	const normResult = await client.query(`
		UPDATE relations
		SET relation_type = REPLACE(LOWER(TRIM(relation_type)), ' ', '_')
		WHERE relation_type != REPLACE(LOWER(TRIM(relation_type)), ' ', '_')
	`);

	return {
		duplicatesRemoved: dupResult.rowCount ?? 0,
		typesNormalized: normResult.rowCount ?? 0,
	};
}
