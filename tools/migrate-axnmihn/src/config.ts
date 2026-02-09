import type { MigrationConfig } from './types.js';

const REQUIRED_ENV_VARS = [
	'AXNMIHN_DATA_PATH',
	'AXNMIHN_DB_PATH',
	'AXEL_DB_URL',
	'GOOGLE_API_KEY',
] as const;

/** Validate that all required environment variables are set. */
export function validateEnvironment(): void {
	for (const envVar of REQUIRED_ENV_VARS) {
		if (!process.env[envVar]) {
			throw new Error(
				`Missing required environment variable: ${envVar}`,
			);
		}
	}
}

/** Load migration config from environment variables. */
export function loadConfig(): MigrationConfig {
	validateEnvironment();
	return {
		axnmihnDataPath: process.env.AXNMIHN_DATA_PATH!,
		axnmihnDbPath: process.env.AXNMIHN_DB_PATH!,
		axelDbUrl: process.env.AXEL_DB_URL!,
		googleApiKey: process.env.GOOGLE_API_KEY!,
	};
}
