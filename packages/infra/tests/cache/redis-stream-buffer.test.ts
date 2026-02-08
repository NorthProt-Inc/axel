import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StreamEventType } from '../../../core/src/memory/types.js';

// ─── Mock Types ───

interface MockRedisClient {
	xadd: ReturnType<typeof vi.fn>;
	xrange: ReturnType<typeof vi.fn>;
	xtrim: ReturnType<typeof vi.fn>;
	xlen: ReturnType<typeof vi.fn>;
}

function createMockRedis(): MockRedisClient {
	return {
		xadd: vi.fn().mockResolvedValue('1707400000000-0'),
		xrange: vi.fn().mockResolvedValue([]),
		xtrim: vi.fn().mockResolvedValue(0),
		xlen: vi.fn().mockResolvedValue(0),
	};
}

function makeEventInput(overrides?: Record<string, unknown>) {
	return {
		type: 'typing_start' as StreamEventType,
		userId: 'user-1',
		channelId: 'discord',
		timestamp: new Date('2026-02-08T10:00:00Z'),
		metadata: {},
		...overrides,
	};
}

const importModule = async () => import('../../src/cache/redis-stream-buffer.js');

describe('RedisStreamBuffer', () => {
	let redis: MockRedisClient;

	beforeEach(() => {
		redis = createMockRedis();
	});

	describe('layerName', () => {
		it('should be M0:stream', async () => {
			const { RedisStreamBuffer } = await importModule();
			const sb = new RedisStreamBuffer(redis as any);
			expect(sb.layerName).toBe('M0:stream');
		});
	});

	describe('push', () => {
		it('should add event to Redis stream and return eventId', async () => {
			const { RedisStreamBuffer } = await importModule();
			const sb = new RedisStreamBuffer(redis as any);
			redis.xadd.mockResolvedValue('1707400000000-0');

			const eventId = await sb.push(makeEventInput());

			expect(eventId).toBe('1707400000000-0');
			expect(redis.xadd).toHaveBeenCalledWith(
				'axel:stream:events',
				'*',
				expect.any(String),
				expect.any(String),
			);
		});

		it('should serialize event fields to Redis stream', async () => {
			const { RedisStreamBuffer } = await importModule();
			const sb = new RedisStreamBuffer(redis as any);

			await sb.push(makeEventInput({ userId: 'user-42' }));

			const args = redis.xadd.mock.calls[0] as unknown[];
			// Should contain 'data' field with JSON
			const dataIdx = args.indexOf('data');
			expect(dataIdx).toBeGreaterThan(-1);
			const jsonStr = args[dataIdx + 1] as string;
			const parsed = JSON.parse(jsonStr);
			expect(parsed.userId).toBe('user-42');
		});
	});

	describe('consume', () => {
		it('should yield events from Redis stream', async () => {
			const { RedisStreamBuffer } = await importModule();
			const sb = new RedisStreamBuffer(redis as any);
			redis.xrange.mockResolvedValue([
				[
					'1707400000000-0',
					[
						'data',
						JSON.stringify({
							type: 'typing_start',
							userId: 'user-1',
							channelId: 'discord',
							timestamp: '2026-02-08T10:00:00.000Z',
							metadata: {},
						}),
					],
				],
			]);

			const events: unknown[] = [];
			for await (const event of sb.consume(10)) {
				events.push(event);
			}

			expect(events).toHaveLength(1);
			expect((events[0] as any).eventId).toBe('1707400000000-0');
			expect((events[0] as any).type).toBe('typing_start');
		});

		it('should yield nothing when stream is empty', async () => {
			const { RedisStreamBuffer } = await importModule();
			const sb = new RedisStreamBuffer(redis as any);
			redis.xrange.mockResolvedValue([]);

			const events: unknown[] = [];
			for await (const event of sb.consume(10)) {
				events.push(event);
			}

			expect(events).toHaveLength(0);
		});

		it('should respect count parameter', async () => {
			const { RedisStreamBuffer } = await importModule();
			const sb = new RedisStreamBuffer(redis as any);

			// Consume with count=5
			// biome-ignore lint/correctness/noUnusedVariables: consume generator
			for await (const _ of sb.consume(5)) {
				// empty
			}

			expect(redis.xrange).toHaveBeenCalledWith('axel:stream:events', '-', '+', 'COUNT', 5);
		});
	});

	describe('trim', () => {
		it('should trim stream to maxLen entries', async () => {
			const { RedisStreamBuffer } = await importModule();
			const sb = new RedisStreamBuffer(redis as any);
			redis.xtrim.mockResolvedValue(3);

			const removed = await sb.trim(100);

			expect(removed).toBe(3);
			expect(redis.xtrim).toHaveBeenCalledWith('axel:stream:events', 'MAXLEN', '~', 100);
		});
	});

	describe('healthCheck', () => {
		it('should return healthy when Redis responds', async () => {
			const { RedisStreamBuffer } = await importModule();
			const sb = new RedisStreamBuffer(redis as any);
			redis.xlen.mockResolvedValue(42);

			const health = await sb.healthCheck();

			expect(health.state).toBe('healthy');
		});

		it('should return unhealthy when Redis fails', async () => {
			const { RedisStreamBuffer } = await importModule();
			const sb = new RedisStreamBuffer(redis as any);
			redis.xlen.mockRejectedValue(new Error('Redis down'));

			const health = await sb.healthCheck();

			expect(health.state).toBe('unhealthy');
		});
	});
});
