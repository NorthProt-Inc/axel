import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

/**
 * Tests for CLI environment variable validation.
 * These tests verify that the migration CLI properly enforces
 * required database connection parameters and rejects hardcoded credentials.
 */
describe('CLI Environment Validation', () => {
	let originalEnv: NodeJS.ProcessEnv;

	beforeEach(() => {
		// Save original environment
		originalEnv = { ...process.env };
		// Clear module cache to ensure fresh validateEnvironment function per test
		vi.resetModules();
	});

	afterEach(() => {
		// Restore original environment
		process.env = originalEnv;
	});

	test('should reject when all env vars are missing', async () => {
		// Arrange: Clear all database-related env vars
		process.env.DATABASE_URL = '';
		process.env.PGHOST = '';
		process.env.PGPORT = '';
		process.env.PGDATABASE = '';
		process.env.PGUSER = '';
		process.env.PGPASSWORD = '';

		// Act & Assert: Import fresh module and verify error
		const { validateEnvironment } = await import('../src/cli.js');
		expect(() => validateEnvironment()).toThrow(
			'DATABASE_URL or individual PG* environment variables (PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD) must be set',
		);
	});

	test('should accept valid DATABASE_URL', async () => {
		// Arrange: Set valid DATABASE_URL
		process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
		// Clear individual vars to ensure DATABASE_URL is used
		process.env.PGHOST = '';
		process.env.PGPORT = '';
		process.env.PGDATABASE = '';
		process.env.PGUSER = '';
		process.env.PGPASSWORD = '';

		// Act & Assert: Should not throw
		const { validateEnvironment } = await import('../src/cli.js');
		expect(() => validateEnvironment()).not.toThrow();
	});

	test('should accept all individual PG env vars', async () => {
		// Arrange: Clear DATABASE_URL and set individual vars
		process.env.DATABASE_URL = '';
		process.env.PGHOST = 'localhost';
		process.env.PGPORT = '5432';
		process.env.PGDATABASE = 'testdb';
		process.env.PGUSER = 'testuser';
		process.env.PGPASSWORD = 'testpass';

		// Act & Assert: Should not throw
		const { validateEnvironment } = await import('../src/cli.js');
		expect(() => validateEnvironment()).not.toThrow();
	});

	test('should reject missing PGHOST when using individual vars', async () => {
		// Arrange: Missing PGHOST
		process.env.DATABASE_URL = '';
		process.env.PGHOST = '';
		process.env.PGPORT = '5432';
		process.env.PGDATABASE = 'testdb';
		process.env.PGUSER = 'testuser';
		process.env.PGPASSWORD = 'testpass';

		// Act & Assert: Should throw
		const { validateEnvironment } = await import('../src/cli.js');
		expect(() => validateEnvironment()).toThrow(
			'DATABASE_URL or individual PG* environment variables (PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD) must be set',
		);
	});

	test('should reject missing PGPASSWORD when using individual vars', async () => {
		// Arrange: Missing PGPASSWORD
		process.env.DATABASE_URL = '';
		process.env.PGHOST = 'localhost';
		process.env.PGPORT = '5432';
		process.env.PGDATABASE = 'testdb';
		process.env.PGUSER = 'testuser';
		process.env.PGPASSWORD = '';

		// Act & Assert: Should throw
		const { validateEnvironment } = await import('../src/cli.js');
		expect(() => validateEnvironment()).toThrow(
			'DATABASE_URL or individual PG* environment variables (PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD) must be set',
		);
	});
});
