#!/usr/bin/env node
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';
import { Migrator } from './migrator.js';

async function main() {
	const command = process.argv[2];
	const arg = process.argv[3];

	const connectionString =
		process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/axel_dev';

	const client = new Client({ connectionString });
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

main().catch((error) => {
	console.error('Migration error:', error);
	process.exit(1);
});
