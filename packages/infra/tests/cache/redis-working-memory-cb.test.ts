import { describe, expect, it, vi, beforeEach } from 'vitest';
import { RedisWorkingMemory, type RedisClient, type PgPool } from '../../src/cache/redis-working-memory.js';
import type { Turn } from '@axel/core/memory';

/** Mock Redis client that can simulate failures */
function createMockRedis(overrides?: Partial<RedisClient>): RedisClient {
	return {
		rpush: vi.fn().mockResolvedValue(1),
		ltrim: vi.fn().mockResolvedValue('OK'),
		expire: vi.fn().mockResolvedValue(1),
		lrange: vi.fn().mockResolvedValue([]),
		del: vi.fn().mockResolvedValue(1),
		get: vi.fn().mockResolvedValue(null),
		set: vi.fn().mockResolvedValue('OK'),
		...overrides,
	};
}

/** Mock PG pool that returns empty results */
function createMockPg(overrides?: Partial<PgPool>): PgPool {
	return {
		query: vi.fn().mockResolvedValue({ rows: [] }),
		...overrides,
	};
}

/** Sample Turn for testing */
function createTurn(overrides?: Partial<Turn>): Turn {
	return {
		turnId: 1,
		role: 'user',
		content: 'Test message',
		channelId: 'test-channel',
		timestamp: new Date(),
		tokenCount: 10,
		...overrides,
	};
}

describe('RedisWorkingMemory Circuit Breaker', () => {
	const userId = 'test-user';

	describe('Circuit breaker threshold behavior', () => {
		it('opens circuit after 5 consecutive Redis failures', async () => {
			const redis = createMockRedis({
				rpush: vi.fn().mockRejectedValue(new Error('Redis connection failed')),
			});
			const pg = createMockPg({
				query: vi.fn().mockResolvedValue({ rows: [] }),
			});

			const memory = new RedisWorkingMemory(redis, pg);

			// Trigger 5 consecutive failures
			for (let i = 0; i < 5; i++) {
				await memory.pushTurn(userId, createTurn({ turnId: i }));
			}

			// Circuit should be open now
			const health = await memory.healthCheck();
			expect(health.state).toBe('degraded');
			expect(health.message).toContain('circuit breaker open');

			// Next operation should skip Redis entirely (circuit is open)
			await memory.pushTurn(userId, createTurn({ turnId: 6 }));

			// Redis should have been called only 5 times (before circuit opened)
			expect(redis.rpush).toHaveBeenCalledTimes(5);
		});

		it('falls back to PG silently when circuit opens', async () => {
			const redis = createMockRedis({
				lrange: vi.fn().mockRejectedValue(new Error('Redis connection failed')),
			});
			const pg = createMockPg({
				query: vi.fn().mockResolvedValue({
					rows: [
						{
							turn_id: 1,
							role: 'user',
							content: 'From PG',
							channel_id: 'test',
							created_at: new Date(),
							token_count: 10,
						},
					],
				}),
			});

			const memory = new RedisWorkingMemory(redis, pg);

			// Trigger 5 failures to open circuit
			for (let i = 0; i < 5; i++) {
				await memory.getTurns(userId, 10);
			}

			// Circuit is now open, should get data from PG
			const turns = await memory.getTurns(userId, 10);

			expect(turns).toHaveLength(1);
			expect(turns[0]?.content).toBe('From PG');
			expect(pg.query).toHaveBeenCalled();
		});
	});

	describe('Circuit recovery (half-open → closed)', () => {
		it('closes circuit after successful probe in half-open state', async () => {
			vi.useFakeTimers();

			let redisFailureCount = 5;
			const redis = createMockRedis({
				rpush: vi.fn().mockImplementation(() => {
					if (redisFailureCount > 0) {
						redisFailureCount--;
						return Promise.reject(new Error('Redis down'));
					}
					return Promise.resolve(1);
				}),
			});
			const pg = createMockPg();

			const memory = new RedisWorkingMemory(redis, pg);

			// Open circuit (5 failures)
			for (let i = 0; i < 5; i++) {
				await memory.pushTurn(userId, createTurn({ turnId: i }));
			}

			// Circuit is open
			let health = await memory.healthCheck();
			expect(health.state).toBe('degraded');

			// Fast-forward past cooldown (60 seconds)
			vi.advanceTimersByTime(61_000);

			// Next successful operation should close circuit
			await memory.pushTurn(userId, createTurn({ turnId: 6 }));

			// Circuit should be closed now
			health = await memory.healthCheck();
			expect(health.state).toBe('healthy');

			vi.useRealTimers();
		});
	});

	describe('Method-specific circuit breaker behavior', () => {
		it('compress() falls back to PG when Redis read fails', async () => {
			const redis = createMockRedis({
				lrange: vi.fn().mockRejectedValue(new Error('Redis read failed')),
			});
			const pg = createMockPg({
				query: vi.fn().mockResolvedValue({
					rows: [
						{
							turn_id: 1,
							role: 'user',
							content: 'Test',
							channel_id: 'test',
							created_at: new Date(),
							token_count: 10,
						},
					],
				}),
			});

			const memory = new RedisWorkingMemory(redis, pg);

			// Should not throw, falls back to PG
			await expect(memory.compress(userId)).resolves.toBeUndefined();
			expect(pg.query).toHaveBeenCalled();
		});

		it('flush() continues when Redis operations fail', async () => {
			const redis = createMockRedis({
				lrange: vi.fn().mockRejectedValue(new Error('Redis read failed')),
				del: vi.fn().mockRejectedValue(new Error('Redis delete failed')),
			});
			const pg = createMockPg();

			const memory = new RedisWorkingMemory(redis, pg);

			// Should not throw even if Redis fails
			await expect(memory.flush(userId)).resolves.toBeUndefined();
		});

		it('clear() is fire-and-forget on Redis failure', async () => {
			const redis = createMockRedis({
				del: vi.fn().mockRejectedValue(new Error('Redis delete failed')),
			});
			const pg = createMockPg();

			const memory = new RedisWorkingMemory(redis, pg);

			// Should not throw
			await expect(memory.clear(userId)).resolves.toBeUndefined();
		});
	});

	describe('healthCheck() circuit state reporting', () => {
		it('reports degraded when circuit is open', async () => {
			const redis = createMockRedis({
				get: vi.fn().mockRejectedValue(new Error('Redis health check failed')),
			});
			const pg = createMockPg();

			const memory = new RedisWorkingMemory(redis, pg);

			// Trigger 5 failures
			for (let i = 0; i < 5; i++) {
				await memory.healthCheck();
			}

			// Circuit is now open
			const health = await memory.healthCheck();
			expect(health.state).toBe('degraded');
			expect(health.message).toContain('circuit breaker open');
		});

		it('reports healthy when Redis is operational', async () => {
			const redis = createMockRedis({
				get: vi.fn().mockResolvedValue(null),
			});
			const pg = createMockPg();

			const memory = new RedisWorkingMemory(redis, pg);

			const health = await memory.healthCheck();
			expect(health.state).toBe('healthy');
			expect(health.latencyMs).toBeGreaterThanOrEqual(0);
			expect(health.message).toBeNull();
		});
	});
});
