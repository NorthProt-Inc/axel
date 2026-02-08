import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Client } from "pg";
import { Migrator } from "../src/migrator.js";

describe("Migrator", () => {
	let container: StartedPostgreSqlContainer;
	let client: Client;
	let migrator: Migrator;

	beforeAll(async () => {
		// Start PostgreSQL 17 + pgvector container
		container = await new PostgreSqlContainer("pgvector/pgvector:pg17")
			.withDatabase("test_db")
			.withUsername("test_user")
			.withPassword("test_password")
			.start();

		const connectionString = container.getConnectionUri();
		client = new Client({ connectionString });
		await client.connect();

		// Use absolute path from project root
		const migrationsDir = process.cwd().includes("tools/migrate")
			? "./migrations"
			: "./tools/migrate/migrations";
		migrator = new Migrator(client, migrationsDir);
	});

	afterAll(async () => {
		await client.end();
		await container.stop();
	});

	test("should create schema_migrations table", async () => {
		await migrator.initialize();

		const result = await client.query(`
			SELECT EXISTS (
				SELECT 1 FROM information_schema.tables
				WHERE table_name = 'schema_migrations'
			) AS exists
		`);

		expect(result.rows[0]?.exists).toBe(true);
	});

	test("should return empty list when no migrations applied", async () => {
		await migrator.initialize();
		const applied = await migrator.getAppliedMigrations();
		expect(applied).toEqual([]);
	});

	test("should detect pending migrations", async () => {
		await migrator.initialize();
		const pending = await migrator.getPendingMigrations();
		expect(pending.length).toBeGreaterThan(0);
		expect(pending[0]?.version).toBe(1);
	});

	test("should apply single migration", async () => {
		await migrator.initialize();
		const pending = await migrator.getPendingMigrations();
		const firstMigration = pending[0];

		if (!firstMigration) {
			throw new Error("No pending migrations found");
		}

		await migrator.up(firstMigration.version);

		const applied = await migrator.getAppliedMigrations();
		expect(applied).toHaveLength(1);
		expect(applied[0]?.version).toBe(1);
	});

	test("should verify pgvector extension is enabled", async () => {
		await migrator.initialize();
		await migrator.up(1); // Apply extensions migration

		const result = await client.query(`
			SELECT EXISTS (
				SELECT 1 FROM pg_extension WHERE extname = 'vector'
			) AS exists
		`);

		expect(result.rows[0]?.exists).toBe(true);
	});

	test("should apply all pending migrations", async () => {
		await migrator.initialize();
		await migrator.upAll();

		const applied = await migrator.getAppliedMigrations();
		expect(applied.length).toBeGreaterThan(0);

		// Verify all expected tables exist
		const tables = ["schema_migrations", "sessions", "messages", "memories", "entities", "relations", "memory_access_patterns", "interaction_logs"];

		for (const table of tables) {
			const result = await client.query(`
				SELECT EXISTS (
					SELECT 1 FROM information_schema.tables
					WHERE table_name = $1
				) AS exists
			`, [table]);

			expect(result.rows[0]?.exists).toBe(true);
		}
	});

	test("should verify memories table has vector column", async () => {
		await migrator.initialize();
		await migrator.upAll();

		const result = await client.query(`
			SELECT column_name, data_type, udt_name
			FROM information_schema.columns
			WHERE table_name = 'memories' AND column_name = 'embedding'
		`);

		expect(result.rows).toHaveLength(1);
		expect(result.rows[0]?.udt_name).toBe("vector");
	});

	test("should verify hot_memories materialized view exists", async () => {
		await migrator.initialize();
		await migrator.upAll();

		const result = await client.query(`
			SELECT EXISTS (
				SELECT 1 FROM pg_matviews WHERE matviewname = 'hot_memories'
			) AS exists
		`);

		expect(result.rows[0]?.exists).toBe(true);
	});

	test("should rollback single migration", async () => {
		await migrator.initialize();
		await migrator.upAll();

		const appliedBefore = await migrator.getAppliedMigrations();
		const lastVersion = appliedBefore[appliedBefore.length - 1]?.version;

		if (!lastVersion) {
			throw new Error("No applied migrations found");
		}

		await migrator.down(lastVersion);

		const appliedAfter = await migrator.getAppliedMigrations();
		expect(appliedAfter.length).toBe(appliedBefore.length - 1);
	});

	test("should handle idempotent migrations", async () => {
		await migrator.initialize();
		await migrator.upAll();

		const appliedBefore = await migrator.getAppliedMigrations();

		// Try applying again (should skip already applied)
		await migrator.upAll();

		const appliedAfter = await migrator.getAppliedMigrations();
		expect(appliedAfter.length).toBe(appliedBefore.length);
	});
});
