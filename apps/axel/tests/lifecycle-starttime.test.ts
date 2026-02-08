import type { ComponentHealth } from '@axel/core/types';
import { describe, expect, it, vi } from 'vitest';
import { type HealthCheckTarget, aggregateHealth } from '../src/lifecycle.js';

describe('aggregateHealth startTime parameter', () => {
	it('accepts startTime parameter for uptime calculation', async () => {
		const targets: HealthCheckTarget[] = [
			{
				name: 'pg',
				check: async (): Promise<ComponentHealth> => ({
					state: 'healthy',
					latencyMs: 5,
					message: null,
					lastChecked: new Date(),
				}),
			},
		];

		const pastTime = Date.now() - 60_000; // 60 seconds ago
		const status = await aggregateHealth(targets, pastTime);

		// Uptime should be approximately 60 seconds
		expect(status.uptime).toBeGreaterThanOrEqual(59);
		expect(status.uptime).toBeLessThanOrEqual(62);
	});

	it('defaults to reasonable uptime when startTime not provided', async () => {
		const targets: HealthCheckTarget[] = [];

		const status = await aggregateHealth(targets);

		// When no startTime, uptime should be >= 0
		expect(status.uptime).toBeGreaterThanOrEqual(0);
	});
});
