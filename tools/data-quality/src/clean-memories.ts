import type { Client } from 'pg';

export interface MemoryReclassification {
	readonly id: number;
	readonly oldType: string;
	readonly newType: string;
	readonly contentPreview: string;
}

export interface CleanMemoriesResult {
	readonly reclassified: readonly MemoryReclassification[];
	readonly emptyMessagesDeleted: number;
}

interface PatternRule {
	readonly pattern: RegExp;
	readonly targetType: string;
}

const RECLASSIFICATION_RULES: readonly PatternRule[] = [
	{
		pattern: /\b(prefers|likes|favorite|dislikes|hates|enjoys|loves)\b/i,
		targetType: 'preference',
	},
	{
		pattern: /\b(born|lives in|name is|works at|works for|is from|moved to)\b/i,
		targetType: 'fact',
	},
	{
		pattern: /\b(realized|learned|pattern|insight|discovered|noticed)\b/i,
		targetType: 'insight',
	},
];

export function classifyMemoryContent(content: string): string | undefined {
	for (const rule of RECLASSIFICATION_RULES) {
		if (rule.pattern.test(content)) {
			return rule.targetType;
		}
	}
	return undefined;
}

export async function cleanMemoriesDryRun(client: Client): Promise<CleanMemoriesResult> {
	const memoriesResult = await client.query<{
		id: number;
		content: string;
		memory_type: string;
	}>(`
		SELECT id, content, memory_type
		FROM memories
		WHERE memory_type = 'conversation'
		AND (
			content ~* '\\m(prefers|likes|favorite|dislikes|hates|enjoys|loves)\\M'
			OR content ~* '\\m(born|lives in|name is|works at|works for|is from|moved to)\\M'
			OR content ~* '\\m(realized|learned|pattern|insight|discovered|noticed)\\M'
		)
		ORDER BY id
	`);

	const reclassified: MemoryReclassification[] = [];
	for (const row of memoriesResult.rows) {
		const newType = classifyMemoryContent(row.content);
		if (newType !== undefined && newType !== row.memory_type) {
			reclassified.push({
				id: row.id,
				oldType: row.memory_type,
				newType,
				contentPreview: row.content.slice(0, 100),
			});
		}
	}

	const emptyResult = await client.query<{ cnt: string }>(`
		SELECT COUNT(*)::text AS cnt FROM messages WHERE content = '' OR content IS NULL
	`);

	return {
		reclassified,
		emptyMessagesDeleted: Number.parseInt(emptyResult.rows[0]?.cnt ?? '0', 10),
	};
}

export async function cleanMemories(client: Client): Promise<CleanMemoriesResult> {
	// Step 4a: Reclassify fallback memories based on content patterns
	const memoriesResult = await client.query<{
		id: number;
		content: string;
		memory_type: string;
	}>(`
		SELECT id, content, memory_type
		FROM memories
		WHERE memory_type = 'conversation'
		AND (
			content ~* '\\m(prefers|likes|favorite|dislikes|hates|enjoys|loves)\\M'
			OR content ~* '\\m(born|lives in|name is|works at|works for|is from|moved to)\\M'
			OR content ~* '\\m(realized|learned|pattern|insight|discovered|noticed)\\M'
		)
		ORDER BY id
	`);

	const reclassified: MemoryReclassification[] = [];
	for (const row of memoriesResult.rows) {
		const newType = classifyMemoryContent(row.content);
		if (newType !== undefined && newType !== row.memory_type) {
			await client.query('UPDATE memories SET memory_type = $1 WHERE id = $2', [newType, row.id]);
			reclassified.push({
				id: row.id,
				oldType: row.memory_type,
				newType,
				contentPreview: row.content.slice(0, 100),
			});
		}
	}

	// Step 4b: Delete empty content messages
	const emptyResult = await client.query(`
		DELETE FROM messages WHERE content = '' OR content IS NULL
	`);

	return {
		reclassified,
		emptyMessagesDeleted: emptyResult.rowCount ?? 0,
	};
}
