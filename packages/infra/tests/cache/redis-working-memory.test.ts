import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Turn } from '../../../core/src/memory/types.js';

// ─── Mock Types ───

interface MockRedisClient {
	rpush: ReturnType<typeof vi.fn>;
	ltrim: ReturnType<typeof vi.fn>;
	expire: ReturnType<typeof vi.fn>;
	lrange: ReturnType<typeof vi.fn>;
	del: ReturnType<typeof vi.fn>;
	get: ReturnType<typeof vi.fn>;
	set: ReturnType<typeof vi.fn>;
}

interface MockPgPool {
	query: ReturnType<typeof vi.fn>;
}

function createMockRedis(): MockRedisClient {
	return {
		rpush: vi.fn().mockResolvedValue(1),
		ltrim: vi.fn().mockResolvedValue('OK'),
		expire: vi.fn().mockResolvedValue(1),
		lrange: vi.fn().mockResolvedValue([]),
		del: vi.fn().mockResolvedValue(1),
		get: vi.fn().mockResolvedValue(null),
		set: vi.fn().mockResolvedValue('OK'),
	};
}

function createMockPg(): MockPgPool {
	return { query: vi.fn().mockResolvedValue({ rows: [] }) };
}

function makeTurn(overrides?: Partial<Turn>): Turn {
	return {
		turnId: 1,
		role: 'user',
		content: 'Hello Axel',
		channelId: 'discord',
		timestamp: new Date('2026-02-08T10:00:00Z'),
		tokenCount: 5,
		...overrides,
	};
}

// Deferred import — source file does not exist yet (RED phase)
const importModule = async () =>
	import('../../src/cache/redis-working-memory.js');

describe('RedisWorkingMemory', () => {
	let redis: MockRedisClient;
	let pg: MockPgPool;

	beforeEach(() => {
		redis = createMockRedis();
		pg = createMockPg();
	});

	describe('layerName', () => {
		it('should be M1:working', async () => {
			const { RedisWorkingMemory } = await importModule();
			const wm = new RedisWorkingMemory(redis as any, pg as any);
			expect(wm.layerName).toBe('M1:working');
		});
	});

	describe('pushTurn', () => {
		it('should write to PG first then Redis cache', async () => {
			const { RedisWorkingMemory } = await importModule();
			const wm = new RedisWorkingMemory(redis as any, pg as any);
			const turn = makeTurn();
			const callOrder: string[] = [];
			pg.query.mockImplementation(async () => {
				callOrder.push('pg');
				return { rows: [] };
			});
			redis.rpush.mockImplementation(async () => {
				callOrder.push('redis');
				return 1;
			});

			await wm.pushTurn('user-1', turn);

			expect(callOrder[0]).toBe('pg');
			expect(pg.query).toHaveBeenCalledOnce();
			expect(redis.rpush).toHaveBeenCalledOnce();
		});

		it('should serialize turn as JSON in Redis LIST', async () => {
			const { RedisWorkingMemory } = await importModule();
			const wm = new RedisWorkingMemory(redis as any, pg as any);
			const turn = makeTurn();

			await wm.pushTurn('user-1', turn);

			expect(redis.rpush).toHaveBeenCalledWith(
				'axel:working:user-1:turns',
				expect.any(String),
			);
			const serialized = redis.rpush.mock.calls[0]![1] as string;
			const parsed = JSON.parse(serialized);
			expect(parsed.content).toBe('Hello Axel');
		});

		it('should trim list to 20 turns and set TTL 3600s', async () => {
			const { RedisWorkingMemory } = await importModule();
			const wm = new RedisWorkingMemory(redis as any, pg as any);

			await wm.pushTurn('user-1', makeTurn());

			expect(redis.ltrim).toHaveBeenCalledWith(
				'axel:working:user-1:turns',
				-20,
				-1,
			);
			expect(redis.expire).toHaveBeenCalledWith(
				'axel:working:user-1:turns',
				3600,
			);
		});

		it('should still succeed if Redis fails (PG is source of truth)', async () => {
			const { RedisWorkingMemory } = await importModule();
			const wm = new RedisWorkingMemory(redis as any, pg as any);
			redis.rpush.mockRejectedValue(new Error('Redis connection refused'));

			await expect(wm.pushTurn('user-1', makeTurn())).resolves.toBeUndefined();
			expect(pg.query).toHaveBeenCalledOnce();
		});
	});

	describe('getTurns', () => {
		it('should return turns from Redis when available', async () => {
			const { RedisWorkingMemory } = await importModule();
			const wm = new RedisWorkingMemory(redis as any, pg as any);
			const turn = makeTurn();
			redis.lrange.mockResolvedValue([JSON.stringify(turn)]);

			const result = await wm.getTurns('user-1', 20);

			expect(result).toHaveLength(1);
			expect(result[0]!.content).toBe('Hello Axel');
			expect(pg.query).not.toHaveBeenCalled();
		});

		it('should fallback to PG when Redis returns empty', async () => {
			const { RedisWorkingMemory } = await importModule();
			const wm = new RedisWorkingMemory(redis as any, pg as any);
			redis.lrange.mockResolvedValue([]);
			pg.query.mockResolvedValue({
				rows: [
					{
						turn_id: 1,
						role: 'user',
						content: 'From PG',
						channel_id: 'discord',
						created_at: new Date('2026-02-08T10:00:00Z'),
						token_count: 3,
					},
				],
			});

			const result = await wm.getTurns('user-1', 20);

			expect(result).toHaveLength(1);
			expect(result[0]!.content).toBe('From PG');
			expect(pg.query).toHaveBeenCalled();
		});

		it('should fallback to PG when Redis fails', async () => {
			const { RedisWorkingMemory } = await importModule();
			const wm = new RedisWorkingMemory(redis as any, pg as any);
			redis.lrange.mockRejectedValue(new Error('Redis timeout'));
			pg.query.mockResolvedValue({
				rows: [
					{
						turn_id: 1,
						role: 'user',
						content: 'PG fallback',
						channel_id: 'discord',
						created_at: new Date('2026-02-08T10:00:00Z'),
						token_count: 3,
					},
				],
			});

			const result = await wm.getTurns('user-1', 20);

			expect(result).toHaveLength(1);
			expect(result[0]!.content).toBe('PG fallback');
		});

		it('should respect the limit parameter', async () => {
			const { RedisWorkingMemory } = await importModule();
			const wm = new RedisWorkingMemory(redis as any, pg as any);

			await wm.getTurns('user-1', 5);

			expect(redis.lrange).toHaveBeenCalledWith(
				'axel:working:user-1:turns',
				-5,
				-1,
			);
		});
	});

	describe('getSummary', () => {
		it('should return cached summary from Redis', async () => {
			const { RedisWorkingMemory } = await importModule();
			const wm = new RedisWorkingMemory(redis as any, pg as any);
			redis.get.mockResolvedValue('Summary text');

			const result = await wm.getSummary('user-1');

			expect(result).toBe('Summary text');
		});

		it('should return null when no summary exists', async () => {
			const { RedisWorkingMemory } = await importModule();
			const wm = new RedisWorkingMemory(redis as any, pg as any);
			redis.get.mockResolvedValue(null);

			const result = await wm.getSummary('user-1');

			expect(result).toBeNull();
		});
	});

	describe('compress', () => {
		it('should store summary and trim turns in Redis', async () => {
			const { RedisWorkingMemory } = await importModule();
			const wm = new RedisWorkingMemory(redis as any, pg as any);
			const turns = Array.from({ length: 5 }, (_, i) =>
				JSON.stringify(makeTurn({ turnId: i, content: `Turn ${i}` })),
			);
			redis.lrange.mockResolvedValue(turns);

			await wm.compress('user-1');

			expect(redis.set).toHaveBeenCalledWith(
				'axel:working:user-1:summary',
				expect.any(String),
				'EX',
				3600,
			);
		});
	});

	describe('flush', () => {
		it('should write all Redis turns to PG and clear cache', async () => {
			const { RedisWorkingMemory } = await importModule();
			const wm = new RedisWorkingMemory(redis as any, pg as any);
			const turn = makeTurn();
			redis.lrange.mockResolvedValue([JSON.stringify(turn)]);

			await wm.flush('user-1');

			expect(pg.query).toHaveBeenCalled();
			expect(redis.del).toHaveBeenCalled();
		});
	});

	describe('clear', () => {
		it('should delete all Redis keys for user', async () => {
			const { RedisWorkingMemory } = await importModule();
			const wm = new RedisWorkingMemory(redis as any, pg as any);

			await wm.clear('user-1');

			expect(redis.del).toHaveBeenCalledWith('axel:working:user-1:turns');
			expect(redis.del).toHaveBeenCalledWith('axel:working:user-1:summary');
		});
	});

	describe('healthCheck', () => {
		it('should return healthy when Redis responds', async () => {
			const { RedisWorkingMemory } = await importModule();
			const wm = new RedisWorkingMemory(redis as any, pg as any);

			const health = await wm.healthCheck();

			expect(health.state).toBe('healthy');
		});

		it('should return degraded when Redis fails but PG works', async () => {
			const { RedisWorkingMemory } = await importModule();
			const wm = new RedisWorkingMemory(redis as any, pg as any);
			// Simulate circuit breaker open state
			redis.rpush.mockRejectedValue(new Error('fail'));
			// Push enough failures to open circuit breaker
			for (let i = 0; i < 6; i++) {
				try {
					await wm.pushTurn('user-1', makeTurn());
				} catch {
					// ignore
				}
			}

			const health = await wm.healthCheck();

			expect(health.state).toBe('degraded');
		});
	});
});
