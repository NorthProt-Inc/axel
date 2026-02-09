#!/usr/bin/env node
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';
import { Migrator } from './migrator.js';

/**
 * Validates that required database connection environment variables are set.
 * @throws {Error} If neither DATABASE_URL nor all individual PG* variables are provided.
 */
export function validateEnvironment(): void {
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

async function main() {
	const command = process.argv[2];
	const arg = process.argv[3];

	// Validate environment before attempting connection
	validateEnvironment();

	const client = process.env['DATABASE_URL']
		? new Client({ connectionString: process.env['DATABASE_URL'] })
		: new Client({
				host: process.env['PGHOST'],
				port: Number.parseInt(process.env['PGPORT'] ?? '5432', 10),
				database: process.env['PGDATABASE'],
				user: process.env['PGUSER'],
				password: process.env['PGPASSWORD'],
			});

	await client.connect();

	// Resolve migrations directory relative to this file
	const __filename = fileURLToPath(import.meta.url);
	const __dirname = dirname(__filename);
	const migrationsDir = join(__dirname, '../migrations');

	const migrator = new Migrator(client, migrationsDir);
	await migrator.initialize();

	try {
		switch (command) {
			case 'up':
				if (arg) {
					const version = Number.parseInt(arg, 10);
					await migrator.up(version);
				} else {
					await migrator.upAll();
				}
				break;

			case 'down':
				if (arg) {
					const version = Number.parseInt(arg, 10);
					await migrator.down(version);
				} else {
					console.error('Please specify a migration version to rollback');
					process.exit(1);
				}
				break;

			case 'status': {
				const applied = await migrator.getAppliedMigrations();
				const pending = await migrator.getPendingMigrations();

				console.log(`Applied migrations (${applied.length}):`);
				for (const m of applied) {
					console.log(`  ✓ ${m.version}: ${m.name} (applied ${m.appliedAt.toISOString()})`);
				}

				console.log(`\nPending migrations (${pending.length}):`);
				for (const m of pending) {
					console.log(`  • ${m.version}: ${m.name}`);
				}
				break;
			}

			default:
				console.log('Usage:');
				console.log('  axel-migrate up [version]      - Apply migrations');
				console.log('  axel-migrate down <version>    - Rollback migration');
				console.log('  axel-migrate status            - Show migration status');
				process.exit(1);
		}
	} finally {
		await client.end();
	}
}

// Only execute main() if this file is the entry point (not imported in tests)
if (import.meta.url === `file://${process.argv[1]}`) {
	main().catch((error) => {
		console.error('Migration error:', error);
		process.exit(1);
	});
}
