import type { ComponentHealth } from '../../../core/src/types/health.js';

/** PG pool configuration */
interface PgPoolConfig {
	readonly host: string;
	readonly port: number;
	readonly database: string;
	readonly user: string;
	readonly password: string;
	readonly maxConnections: number;
	readonly idleTimeoutMs: number;
	readonly connectionTimeoutMs: number;
}

/** Minimal pg.Pool interface used by this wrapper */
interface PgPoolDriver {
	query(
		text: string,
		params?: readonly unknown[],
	): Promise<{ rows: unknown[]; rowCount: number | null }>;
	connect(): Promise<{
		query(
			text: string,
			params?: readonly unknown[],
		): Promise<{ rows: unknown[]; rowCount: number | null }>;
		release(): void;
	}>;
	end(): Promise<void>;
}

/**
 * Axel PostgreSQL pool wrapper (ADR-002).
 *
 * Thin wrapper around pg.Pool that adds health checking.
 * Does NOT own the pool lifecycle — caller provides the pg.Pool instance.
 */
class AxelPgPool {
	private readonly pool: PgPoolDriver;
	private readonly config: PgPoolConfig;

	constructor(pool: PgPoolDriver, config: PgPoolConfig) {
		this.pool = pool;
		this.config = config;
	}

	async query<T extends Record<string, unknown>>(
		text: string,
		params?: readonly unknown[],
	): Promise<{ readonly rows: readonly T[]; readonly rowCount: number | null }> {
		const result = await this.pool.query(text, params);
		return {
			rows: result.rows as T[],
			rowCount: result.rowCount,
		};
	}

	async connect(): Promise<{
		query<T extends Record<string, unknown>>(
			text: string,
			params?: readonly unknown[],
		): Promise<{
			readonly rows: readonly T[];
			readonly rowCount: number | null;
		}>;
		release(): void;
	}> {
		const client = await this.pool.connect();
		return {
			async query<T extends Record<string, unknown>>(
				text: string,
				params?: readonly unknown[],
			) {
				const result = await client.query(text, params);
				return {
					rows: result.rows as T[],
					rowCount: result.rowCount,
				};
			},
			release() {
				client.release();
			},
		};
	}

	async end(): Promise<void> {
		await this.pool.end();
	}

	async healthCheck(): Promise<ComponentHealth> {
		const start = Date.now();
		try {
			await this.pool.query('SELECT 1');
			return {
				state: 'healthy',
				latencyMs: Date.now() - start,
				message: null,
				lastChecked: new Date(),
			};
		} catch (error) {
			return {
				state: 'unhealthy',
				latencyMs: Date.now() - start,
				message: error instanceof Error ? error.message : 'Unknown error',
				lastChecked: new Date(),
			};
		}
	}
}

export { AxelPgPool, type PgPoolConfig, type PgPoolDriver };
