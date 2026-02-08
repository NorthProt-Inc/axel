import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ComponentHealth } from '@axel/core/types';

// ─── Types for the PG Pool wrapper (will be implemented in src) ───

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

interface PgClient {
	query<T extends Record<string, unknown>>(
		text: string,
		params?: readonly unknown[],
	): Promise<{ readonly rows: readonly T[]; readonly rowCount: number | null }>;
	release(): void;
}

interface PgPool {
	query<T extends Record<string, unknown>>(
		text: string,
		params?: readonly unknown[],
	): Promise<{ readonly rows: readonly T[]; readonly rowCount: number | null }>;
	connect(): Promise<PgClient>;
	end(): Promise<void>;
	healthCheck(): Promise<ComponentHealth>;
}

// ─── Mock pg.Pool ───

function createMockPool() {
	const mockClient = {
		query: vi.fn(),
		release: vi.fn(),
	};
	return {
		query: vi.fn(),
		connect: vi.fn().mockResolvedValue(mockClient),
		end: vi.fn().mockResolvedValue(undefined),
		on: vi.fn(),
		totalCount: 5,
		idleCount: 3,
		waitingCount: 0,
		_mockClient: mockClient,
	};
}

// ─── Tests ───

describe('AxelPgPool', () => {
	const DEFAULT_CONFIG: PgPoolConfig = {
		host: 'localhost',
		port: 5432,
		database: 'axel_test',
		user: 'axel',
		password: 'test',
		maxConnections: 10,
		idleTimeoutMs: 30_000,
		connectionTimeoutMs: 5_000,
	};

	let mockPool: ReturnType<typeof createMockPool>;

	beforeEach(() => {
		mockPool = createMockPool();
		vi.clearAllMocks();
	});

	describe('query()', () => {
		it('should execute parameterized queries', async () => {
			mockPool.query.mockResolvedValue({
				rows: [{ id: 1, name: 'test' }],
				rowCount: 1,
			});

			const { AxelPgPool } = await import('../../src/db/index.js');
			const pool: PgPool = new AxelPgPool(mockPool as any, DEFAULT_CONFIG);

			const result = await pool.query<{ id: number; name: string }>(
				'SELECT * FROM sessions WHERE id = $1',
				[1],
			);

			expect(result.rows).toHaveLength(1);
			expect(result.rows[0]).toEqual({ id: 1, name: 'test' });
		});

		it('should pass parameters to underlying pool', async () => {
			mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

			const { AxelPgPool } = await import('../../src/db/index.js');
			const pool: PgPool = new AxelPgPool(mockPool as any, DEFAULT_CONFIG);

			await pool.query('INSERT INTO sessions (session_id) VALUES ($1)', [
				'sess-1',
			]);

			expect(mockPool.query).toHaveBeenCalledWith(
				'INSERT INTO sessions (session_id) VALUES ($1)',
				['sess-1'],
			);
		});

		it('should propagate database errors', async () => {
			mockPool.query.mockRejectedValue(
				new Error('connection refused'),
			);

			const { AxelPgPool } = await import('../../src/db/index.js');
			const pool: PgPool = new AxelPgPool(mockPool as any, DEFAULT_CONFIG);

			await expect(
				pool.query('SELECT 1'),
			).rejects.toThrow();
		});
	});

	describe('connect()', () => {
		it('should acquire a client for transactions', async () => {
			const { AxelPgPool } = await import('../../src/db/index.js');
			const pool: PgPool = new AxelPgPool(mockPool as any, DEFAULT_CONFIG);

			const client = await pool.connect();
			expect(client).toBeDefined();
			expect(typeof client.query).toBe('function');
			expect(typeof client.release).toBe('function');
		});
	});

	describe('end()', () => {
		it('should drain the pool', async () => {
			const { AxelPgPool } = await import('../../src/db/index.js');
			const pool: PgPool = new AxelPgPool(mockPool as any, DEFAULT_CONFIG);

			await pool.end();

			expect(mockPool.end).toHaveBeenCalledTimes(1);
		});
	});

	describe('healthCheck()', () => {
		it('should return healthy when pool responds to SELECT 1', async () => {
			mockPool.query.mockResolvedValue({ rows: [{ '?column?': 1 }], rowCount: 1 });

			const { AxelPgPool } = await import('../../src/db/index.js');
			const pool: PgPool = new AxelPgPool(mockPool as any, DEFAULT_CONFIG);

			const health = await pool.healthCheck();

			expect(health.state).toBe('healthy');
			expect(health.latencyMs).toBeGreaterThanOrEqual(0);
		});

		it('should return unhealthy when pool query fails', async () => {
			mockPool.query.mockRejectedValue(new Error('connection refused'));

			const { AxelPgPool } = await import('../../src/db/index.js');
			const pool: PgPool = new AxelPgPool(mockPool as any, DEFAULT_CONFIG);

			const health = await pool.healthCheck();

			expect(health.state).toBe('unhealthy');
			expect(health.message).toBeTruthy();
		});
	});
});
