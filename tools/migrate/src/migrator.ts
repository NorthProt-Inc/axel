import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Client } from 'pg';

export interface Migration {
	version: number;
	name: string;
	upSql: string;
	downSql: string;
}

export interface AppliedMigration {
	version: number;
	name: string;
	appliedAt: Date;
}

export class Migrator {
	constructor(
		private readonly client: Client,
		private readonly migrationsDir: string,
	) {}

	async initialize(): Promise<void> {
		await this.client.query(`
			CREATE TABLE IF NOT EXISTS schema_migrations (
				version     INTEGER PRIMARY KEY,
				name        TEXT NOT NULL,
				applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
			)
		`);
	}

	async getAppliedMigrations(): Promise<AppliedMigration[]> {
		const result = await this.client.query<AppliedMigration>(`
			SELECT version, name, applied_at AS "appliedAt"
			FROM schema_migrations
			ORDER BY version ASC
		`);

		return result.rows;
	}

	async getPendingMigrations(): Promise<Migration[]> {
		const allMigrations = await this.loadMigrations();
		const applied = await this.getAppliedMigrations();
		const appliedVersions = new Set(applied.map((m) => m.version));

		return allMigrations.filter((m) => !appliedVersions.has(m.version));
	}

	async up(version: number): Promise<void> {
		const migrations = await this.loadMigrations();
		const migration = migrations.find((m) => m.version === version);

		if (!migration) {
			throw new Error(`Migration version ${version} not found`);
		}

		const applied = await this.getAppliedMigrations();
		const isApplied = applied.some((m) => m.version === version);

		if (isApplied) {
			console.log(`Migration ${version} already applied, skipping`);
			return;
		}

		await this.client.query('BEGIN');
		try {
			await this.client.query(migration.upSql);
			await this.client.query('INSERT INTO schema_migrations (version, name) VALUES ($1, $2)', [
				migration.version,
				migration.name,
			]);
			await this.client.query('COMMIT');
			console.log(`✓ Applied migration ${version}: ${migration.name}`);
		} catch (error) {
			await this.client.query('ROLLBACK');
			throw error;
		}
	}

	async upAll(): Promise<void> {
		const pending = await this.getPendingMigrations();

		for (const migration of pending) {
			await this.up(migration.version);
		}
	}

	async down(version: number): Promise<void> {
		const migrations = await this.loadMigrations();
		const migration = migrations.find((m) => m.version === version);

		if (!migration) {
			throw new Error(`Migration version ${version} not found`);
		}

		const applied = await this.getAppliedMigrations();
		const isApplied = applied.some((m) => m.version === version);

		if (!isApplied) {
			console.log(`Migration ${version} not applied, skipping`);
			return;
		}

		await this.client.query('BEGIN');
		try {
			await this.client.query(migration.downSql);
			await this.client.query('DELETE FROM schema_migrations WHERE version = $1', [version]);
			await this.client.query('COMMIT');
			console.log(`✓ Rolled back migration ${version}: ${migration.name}`);
		} catch (error) {
			await this.client.query('ROLLBACK');
			throw error;
		}
	}

	private async loadMigrations(): Promise<Migration[]> {
		const files = await readdir(this.migrationsDir);
		const upFiles = files.filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql'));

		const migrations: Migration[] = [];

		for (const upFile of upFiles) {
			const match = upFile.match(/^(\d+)_(.+)\.sql$/);
			if (!match) {
				continue;
			}

			const version = Number.parseInt(match[1] ?? '0', 10);
			const name = match[2] ?? '';
			const downFile = `${match[1]}_${name}.down.sql`;

			const upPath = join(this.migrationsDir, upFile);
			const downPath = join(this.migrationsDir, downFile);

			const upSql = await readFile(upPath, 'utf-8');
			const downSql = await readFile(downPath, 'utf-8');

			migrations.push({ version, name, upSql, downSql });
		}

		return migrations.sort((a, b) => a.version - b.version);
	}
}
