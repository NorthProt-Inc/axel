#!/usr/bin/env node
import { Client } from 'pg';
import { backfillAi, backfillAiDryRun } from './backfill-ai.js';
import { backfillDecay, backfillDecayDryRun } from './backfill-decay.js';
import { backfillSessions, backfillSessionsDryRun } from './backfill-sessions.js';
import { cleanEntities, cleanEntitiesDryRun } from './clean-entities.js';
import { cleanMemories, cleanMemoriesDryRun } from './clean-memories.js';
import { cleanReferences, cleanReferencesDryRun } from './clean-references.js';
import { cleanRelations, cleanRelationsDryRun } from './clean-relations.js';
import { generateReport } from './report.js';
import { verify } from './verify.js';

function validateEnvironment(): void {
	const hasConnectionString = Boolean(process.env['DATABASE_URL']);
	const hasIndividualVars =
		Boolean(process.env['PGHOST']) &&
		Boolean(process.env['PGPORT']) &&
		Boolean(process.env['PGDATABASE']) &&
		Boolean(process.env['PGUSER']) &&
		Boolean(process.env['PGPASSWORD']);

	if (!hasConnectionString && !hasIndividualVars) {
		throw new Error(
			'DATABASE_URL or individual PG* environment variables (PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD) must be set',
		);
	}
}

function createClient(): Client {
	return process.env['DATABASE_URL']
		? new Client({ connectionString: process.env['DATABASE_URL'] })
		: new Client({
				host: process.env['PGHOST'],
				port: Number.parseInt(process.env['PGPORT'] ?? '5432', 10),
				database: process.env['PGDATABASE'],
				user: process.env['PGUSER'],
				password: process.env['PGPASSWORD'],
			});
}

async function runReport(client: Client): Promise<void> {
	console.error('Generating quality report...');
	const report = await generateReport(client);
	console.log(JSON.stringify(report, null, 2));

	// Print summary to stderr for quick view
	const issues = report.issues;
	console.error('\n--- Summary ---');
	console.error(`Relation type variants: ${issues.relationTypeVariants.length} groups`);
	console.error(`Compound entity types: ${issues.compoundEntityTypes.length}`);
	console.error(`Orphaned entities: ${issues.orphanedEntities.length}`);
	console.error(`Fallback memories: ${issues.fallbackMemories.length}`);
	console.error(`Empty content messages: ${issues.emptyContentMessages.length}`);
	console.error(`Orphaned references: ${issues.orphanedReferences.length}`);
}

async function runClean(client: Client, dryRun: boolean): Promise<void> {
	const mode = dryRun ? 'DRY RUN' : 'LIVE';
	console.error(`\n=== Data Quality Cleaning (${mode}) ===\n`);

	if (!dryRun) {
		// Wrap all cleaning steps in a single transaction
		await client.query('BEGIN');
	}

	try {
		// Step 2: Relations
		console.error('Step 2: Relation type normalization...');
		const relResult = dryRun ? await cleanRelationsDryRun(client) : await cleanRelations(client);
		console.error(`  Duplicates to remove: ${relResult.duplicatesRemoved}`);
		console.error(`  Types to normalize: ${relResult.typesNormalized}`);

		// Step 3: Entities
		console.error('Step 3: Entity cleanup...');
		const entResult = dryRun ? await cleanEntitiesDryRun(client) : await cleanEntities(client);
		console.error(`  Compound types to normalize: ${entResult.compoundTypesNormalized}`);
		console.error(`  Orphaned entities to remove: ${entResult.orphanedEntitiesRemoved}`);

		// Step 4: Memories
		console.error('Step 4: Memory quality...');
		const memResult = dryRun ? await cleanMemoriesDryRun(client) : await cleanMemories(client);
		console.error(`  Memories to reclassify: ${memResult.reclassified.length}`);
		if (memResult.reclassified.length > 0) {
			for (const r of memResult.reclassified) {
				console.error(`    id=${r.id}: ${r.oldType} → ${r.newType} (${r.contentPreview}...)`);
			}
		}
		console.error(`  Empty messages to delete: ${memResult.emptyMessagesDeleted}`);

		// Step 5: References
		console.error('Step 5: Orphaned FK cleanup...');
		const refResult = dryRun ? await cleanReferencesDryRun(client) : await cleanReferences(client);
		console.error(`  interaction_logs to fix: ${refResult.interactionLogsFixed}`);
		console.error(`  memories to fix: ${refResult.memoriesFixed}`);

		if (!dryRun) {
			await client.query('COMMIT');
			console.error('\n✓ All changes committed.');
		} else {
			console.error('\n(dry run — no changes made)');
		}

		// Output structured result
		const result = {
			mode,
			relations: relResult,
			entities: entResult,
			memories: {
				reclassified: memResult.reclassified,
				emptyMessagesDeleted: memResult.emptyMessagesDeleted,
			},
			references: refResult,
		};
		console.log(JSON.stringify(result, null, 2));
	} catch (error) {
		if (!dryRun) {
			await client.query('ROLLBACK');
			console.error('\n✗ Error — all changes rolled back.');
		}
		throw error;
	}
}

async function runVerify(client: Client): Promise<void> {
	console.error('Running verification checks...');
	const result = await verify(client);
	console.log(JSON.stringify(result, null, 2));

	console.error('\n--- Verification ---');
	for (const check of result.checks) {
		const icon = check.passed ? '✓' : '✗';
		console.error(`  ${icon} ${check.name}: ${check.detail}`);
	}
	console.error(`\nOverall: ${result.allPassed ? 'ALL PASSED' : 'SOME FAILED'}`);

	if (!result.allPassed) {
		process.exitCode = 1;
	}
}

type BackfillPhase = 'sessions' | 'ai' | 'decay';

async function runBackfill(
	client: Client,
	dryRun: boolean,
	phase: BackfillPhase | undefined,
): Promise<void> {
	const mode = dryRun ? 'DRY RUN' : 'LIVE';
	const phases: readonly BackfillPhase[] = phase ? [phase] : ['sessions', 'ai', 'decay'];
	console.error(`\n=== NULL Backfill (${mode}) — phases: ${phases.join(', ')} ===\n`);

	// Phase 2 (AI) doesn't run in a transaction (external API calls),
	// but Phase 1 & 3 use transactions for atomicity.
	const needsTransaction = !dryRun && (phases.includes('sessions') || phases.includes('decay'));

	if (needsTransaction) {
		await client.query('BEGIN');
	}

	try {
		if (phases.includes('sessions')) {
			console.error('Phase 1: Timestamp-based session mapping...');
			const result = dryRun ? await backfillSessionsDryRun(client) : await backfillSessions(client);
			console.error(`  S1 ended_at extended: ${result.s1EndExtended}`);
			console.error(`  NULL session_id fixed: ${result.nullSessionsFixed}`);
			console.error(`  S2 → S1 reassigned: ${result.s2ToS1Reassigned}`);
			console.error(`  S3 → S2 reassigned: ${result.s3ToS2Reassigned}`);
			console.error(`  Memories linked: ${result.memoriesLinked}`);
			console.error(`  S1 turn_count: ${result.s1TurnCountUpdated}`);
		}

		// Commit session changes before AI phase (AI calls are not transactional)
		if (needsTransaction && phases.includes('ai')) {
			await client.query('COMMIT');
			console.error('\n✓ Session changes committed before AI phase.');
		}

		if (phases.includes('ai')) {
			console.error('\nPhase 2: AI-based session summarization...');
			if (dryRun) {
				const result = await backfillAiDryRun(client);
				console.error(`  Sessions to summarize: ${result.sessionsSummarized}`);
				console.error(`  session_summaries to insert: ${result.sessionSummariesInserted}`);
			} else {
				const result = await backfillAi(client);
				console.error(`  Sessions summarized: ${result.sessionsSummarized}`);
				console.error(`  session_summaries inserted: ${result.sessionSummariesInserted}`);
			}
		}

		// Start new transaction for decay if needed
		const needsDecayTx = !dryRun && phases.includes('decay');
		if (needsDecayTx) {
			// Only BEGIN if we already committed (AI phase was included)
			// or if sessions wasn't included (nothing committed yet)
			if (phases.includes('ai') || !phases.includes('sessions')) {
				await client.query('BEGIN');
			}
		}

		if (phases.includes('decay')) {
			console.error('\nPhase 3: Memory decay calculation...');
			const result = dryRun ? await backfillDecayDryRun(client) : await backfillDecay(client);
			console.error(`  Memories decayed: ${result.memoriesDecayed}`);
		}

		// Final commit
		if (needsDecayTx) {
			await client.query('COMMIT');
			console.error('\n✓ Decay changes committed.');
		} else if (needsTransaction && !phases.includes('ai')) {
			// Sessions-only or decay-only, no AI phase to split transaction
			await client.query('COMMIT');
			console.error('\n✓ All changes committed.');
		}

		if (dryRun) {
			console.error('\n(dry run — no changes made)');
		}
	} catch (error) {
		if (!dryRun) {
			// Best-effort rollback — may fail if already committed
			try {
				await client.query('ROLLBACK');
			} catch {
				// Already committed or no active transaction
			}
			console.error('\n✗ Error — rolling back uncommitted changes.');
		}
		throw error;
	}
}

const VALID_COMMANDS = ['report', 'clean', 'verify', 'backfill'];

async function main(): Promise<void> {
	const command = process.argv[2];
	const flags = process.argv.slice(3);
	const dryRun = flags.includes('--dry-run');

	if (!command || !VALID_COMMANDS.includes(command)) {
		console.error('Usage:');
		console.error('  tsx src/cli.ts report                       # Quality report (JSON)');
		console.error('  tsx src/cli.ts clean --dry-run               # Preview cleaning');
		console.error('  tsx src/cli.ts clean                         # Execute cleaning');
		console.error('  tsx src/cli.ts verify                        # Post-clean verification');
		console.error('  tsx src/cli.ts backfill --dry-run             # Preview backfill');
		console.error('  tsx src/cli.ts backfill                       # Run all phases');
		console.error('  tsx src/cli.ts backfill --phase sessions      # Phase 1 only');
		console.error('  tsx src/cli.ts backfill --phase ai            # Phase 2 only');
		console.error('  tsx src/cli.ts backfill --phase decay         # Phase 3 only');
		process.exit(1);
	}

	validateEnvironment();
	const client = createClient();
	await client.connect();

	try {
		switch (command) {
			case 'report':
				await runReport(client);
				break;
			case 'clean':
				await runClean(client, dryRun);
				break;
			case 'verify':
				await runVerify(client);
				break;
			case 'backfill': {
				const phaseIdx = flags.indexOf('--phase');
				const phaseArg = phaseIdx >= 0 ? flags[phaseIdx + 1] : undefined;
				const validPhases: readonly string[] = ['sessions', 'ai', 'decay'];
				if (phaseArg !== undefined && !validPhases.includes(phaseArg)) {
					console.error(`Invalid phase: ${phaseArg}. Must be one of: ${validPhases.join(', ')}`);
					process.exit(1);
				}
				await runBackfill(client, dryRun, phaseArg as BackfillPhase | undefined);
				break;
			}
		}
	} finally {
		await client.end();
	}
}

main().catch((error) => {
	console.error('Fatal error:', error instanceof Error ? error.message : error);
	process.exit(1);
});
