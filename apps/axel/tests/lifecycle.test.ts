import type { ComponentHealth, HealthStatus } from '@axel/core/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	type HealthCheckTarget,
	type ShutdownableContainer,
	aggregateHealth,
	gracefulShutdown,
	startupHealthCheck,
} from '../src/lifecycle.js';

function healthyComponent(): ComponentHealth {
	return { state: 'healthy', latencyMs: 5, message: null, lastChecked: new Date() };
}

function unhealthyComponent(msg: string): ComponentHealth {
	return { state: 'unhealthy', latencyMs: null, message: msg, lastChecked: new Date() };
}

function degradedComponent(msg: string): ComponentHealth {
	return { state: 'degraded', latencyMs: 50, message: msg, lastChecked: new Date() };
}

describe('aggregateHealth', () => {
	it('returns healthy when all components are healthy', () => {
		const targets: HealthCheckTarget[] = [
			{ name: 'pg', check: async () => healthyComponent() },
			{ name: 'redis', check: async () => healthyComponent() },
		];

		return aggregateHealth(targets).then((status) => {
			expect(status.state).toBe('healthy');
			expect(Object.keys(status.checks)).toHaveLength(2);
			expect(status.checks.pg?.state).toBe('healthy');
			expect(status.checks.redis?.state).toBe('healthy');
			expect(status.uptime).toBeGreaterThanOrEqual(0);
		});
	});

	it('returns degraded when any component is degraded', async () => {
		const targets: HealthCheckTarget[] = [
			{ name: 'pg', check: async () => healthyComponent() },
			{ name: 'redis', check: async () => degradedComponent('high latency') },
		];

		const status = await aggregateHealth(targets);
		expect(status.state).toBe('degraded');
	});

	it('returns unhealthy when any component is unhealthy', async () => {
		const targets: HealthCheckTarget[] = [
			{ name: 'pg', check: async () => unhealthyComponent('connection refused') },
			{ name: 'redis', check: async () => healthyComponent() },
		];

		const status = await aggregateHealth(targets);
		expect(status.state).toBe('unhealthy');
	});

	it('unhealthy takes precedence over degraded', async () => {
		const targets: HealthCheckTarget[] = [
			{ name: 'pg', check: async () => unhealthyComponent('down') },
			{ name: 'redis', check: async () => degradedComponent('slow') },
		];

		const status = await aggregateHealth(targets);
		expect(status.state).toBe('unhealthy');
	});

	it('handles health check errors gracefully', async () => {
		const targets: HealthCheckTarget[] = [
			{ name: 'pg', check: async () => healthyComponent() },
			{
				name: 'redis',
				check: async () => {
					throw new Error('connection reset');
				},
			},
		];

		const status = await aggregateHealth(targets);
		expect(status.state).toBe('unhealthy');
		expect(status.checks.redis?.state).toBe('unhealthy');
		expect(status.checks.redis?.message).toContain('connection reset');
	});

	it('returns healthy for empty targets', async () => {
		const status = await aggregateHealth([]);
		expect(status.state).toBe('healthy');
		expect(Object.keys(status.checks)).toHaveLength(0);
	});
});

describe('startupHealthCheck', () => {
	it('succeeds when all components are healthy', async () => {
		const targets: HealthCheckTarget[] = [
			{ name: 'pg', check: async () => healthyComponent() },
			{ name: 'redis', check: async () => healthyComponent() },
		];

		const status = await startupHealthCheck(targets);
		expect(status.state).toBe('healthy');
	});

	it('throws when critical component is unhealthy', async () => {
		const targets: HealthCheckTarget[] = [
			{ name: 'pg', check: async () => unhealthyComponent('cannot connect') },
		];

		await expect(startupHealthCheck(targets)).rejects.toThrow('Startup health check failed');
	});

	it('allows degraded components during startup', async () => {
		const targets: HealthCheckTarget[] = [
			{ name: 'pg', check: async () => healthyComponent() },
			{ name: 'redis', check: async () => degradedComponent('reconnecting') },
		];

		const status = await startupHealthCheck(targets);
		expect(status.state).toBe('degraded');
	});
});

describe('gracefulShutdown', () => {
	function createMockContainer(): ShutdownableContainer {
		return {
			channels: [
				{ id: 'cli', stop: vi.fn().mockResolvedValue(undefined) },
				{ id: 'discord', stop: vi.fn().mockResolvedValue(undefined) },
			],
			workingMemory: {
				flush: vi.fn().mockResolvedValue(undefined),
			},
			redis: {
				quit: vi.fn().mockResolvedValue('OK'),
			},
			pgPool: {
				end: vi.fn().mockResolvedValue(undefined),
			},
		};
	}

	it('executes 4-phase shutdown in order', async () => {
		const container = createMockContainer();
		const order: string[] = [];

		for (const ch of container.channels) {
			(ch.stop as ReturnType<typeof vi.fn>).mockImplementation(async () => {
				order.push(`stop:${ch.id}`);
			});
		}
		(container.workingMemory.flush as ReturnType<typeof vi.fn>).mockImplementation(async () => {
			order.push('flush');
		});
		(container.redis.quit as ReturnType<typeof vi.fn>).mockImplementation(async () => {
			order.push('redis:quit');
			return 'OK';
		});
		(container.pgPool.end as ReturnType<typeof vi.fn>).mockImplementation(async () => {
			order.push('pg:end');
		});

		await gracefulShutdown(container);

		// Phase 1: Stop channels
		expect(order.indexOf('stop:cli')).toBeLessThan(order.indexOf('flush'));
		expect(order.indexOf('stop:discord')).toBeLessThan(order.indexOf('flush'));

		// Phase 3: Flush before close connections
		expect(order.indexOf('flush')).toBeLessThan(order.indexOf('redis:quit'));

		// Phase 4: Redis before PG
		expect(order.indexOf('redis:quit')).toBeLessThan(order.indexOf('pg:end'));
	});

	it('handles channel stop errors gracefully', async () => {
		const container = createMockContainer();
		(container.channels[0]?.stop as ReturnType<typeof vi.fn>).mockRejectedValue(
			new Error('disconnect failed'),
		);

		// Should not throw — shutdown must continue
		await expect(gracefulShutdown(container)).resolves.not.toThrow();

		// Other channel should still be stopped
		expect(container.channels[1]?.stop).toHaveBeenCalled();
		// Flush should still happen
		expect(container.workingMemory.flush).toHaveBeenCalled();
	});

	it('handles flush errors gracefully', async () => {
		const container = createMockContainer();
		(container.workingMemory.flush as ReturnType<typeof vi.fn>).mockRejectedValue(
			new Error('flush failed'),
		);

		await expect(gracefulShutdown(container)).resolves.not.toThrow();

		// Should still close connections
		expect(container.redis.quit).toHaveBeenCalled();
		expect(container.pgPool.end).toHaveBeenCalled();
	});

	it('handles redis quit errors gracefully', async () => {
		const container = createMockContainer();
		(container.redis.quit as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('redis error'));

		await expect(gracefulShutdown(container)).resolves.not.toThrow();

		// PG pool should still be closed
		expect(container.pgPool.end).toHaveBeenCalled();
	});
});
