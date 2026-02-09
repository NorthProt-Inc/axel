import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('config', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.unstubAllEnvs();
		delete process.env.AXNMIHN_DATA_PATH;
		delete process.env.AXNMIHN_DB_PATH;
		delete process.env.AXEL_DB_URL;
		delete process.env.GOOGLE_API_KEY;
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	describe('validateEnvironment', () => {
		it('should accept all required env vars', async () => {
			vi.stubEnv('AXNMIHN_DATA_PATH', '/path/to/data');
			vi.stubEnv('AXNMIHN_DB_PATH', '/path/to/db');
			vi.stubEnv('AXEL_DB_URL', 'postgresql://localhost:5432/axel');
			vi.stubEnv('GOOGLE_API_KEY', 'test-key');
			const { validateEnvironment } = await import('../src/config.js');
			expect(() => validateEnvironment()).not.toThrow();
		});

		it('should throw when AXNMIHN_DATA_PATH is missing', async () => {
			vi.stubEnv('AXNMIHN_DB_PATH', '/path/to/db');
			vi.stubEnv('AXEL_DB_URL', 'postgresql://localhost:5432/axel');
			vi.stubEnv('GOOGLE_API_KEY', 'test-key');
			const { validateEnvironment } = await import('../src/config.js');
			expect(() => validateEnvironment()).toThrow('AXNMIHN_DATA_PATH');
		});

		it('should throw when AXNMIHN_DB_PATH is missing', async () => {
			vi.stubEnv('AXNMIHN_DATA_PATH', '/path/to/data');
			vi.stubEnv('AXEL_DB_URL', 'postgresql://localhost:5432/axel');
			vi.stubEnv('GOOGLE_API_KEY', 'test-key');
			const { validateEnvironment } = await import('../src/config.js');
			expect(() => validateEnvironment()).toThrow('AXNMIHN_DB_PATH');
		});

		it('should throw when AXEL_DB_URL is missing', async () => {
			vi.stubEnv('AXNMIHN_DATA_PATH', '/path/to/data');
			vi.stubEnv('AXNMIHN_DB_PATH', '/path/to/db');
			vi.stubEnv('GOOGLE_API_KEY', 'test-key');
			const { validateEnvironment } = await import('../src/config.js');
			expect(() => validateEnvironment()).toThrow('AXEL_DB_URL');
		});

		it('should throw when GOOGLE_API_KEY is missing', async () => {
			vi.stubEnv('AXNMIHN_DATA_PATH', '/path/to/data');
			vi.stubEnv('AXNMIHN_DB_PATH', '/path/to/db');
			vi.stubEnv('AXEL_DB_URL', 'postgresql://localhost:5432/axel');
			const { validateEnvironment } = await import('../src/config.js');
			expect(() => validateEnvironment()).toThrow('GOOGLE_API_KEY');
		});
	});

	describe('loadConfig', () => {
		it('should return config object from env vars', async () => {
			vi.stubEnv('AXNMIHN_DATA_PATH', '/data');
			vi.stubEnv('AXNMIHN_DB_PATH', '/data/sqlite.db');
			vi.stubEnv('AXEL_DB_URL', 'postgresql://localhost/axel');
			vi.stubEnv('GOOGLE_API_KEY', 'key-123');
			const { loadConfig } = await import('../src/config.js');
			const config = loadConfig();
			expect(config.axnmihnDataPath).toBe('/data');
			expect(config.axnmihnDbPath).toBe('/data/sqlite.db');
			expect(config.axelDbUrl).toBe('postgresql://localhost/axel');
			expect(config.googleApiKey).toBe('key-123');
		});
	});
});
