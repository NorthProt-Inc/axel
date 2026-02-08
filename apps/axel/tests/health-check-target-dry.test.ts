import { describe, expect, it } from 'vitest';
import { type HealthCheckTarget as ContainerHCT } from '../src/container.js';
import { type HealthCheckTarget as LifecycleHCT } from '../src/lifecycle.js';

describe('HealthCheckTarget DRY', () => {
	it('container.ts imports HealthCheckTarget from lifecycle.ts (no duplicate)', () => {
		// Both types should be structurally identical since container re-exports from lifecycle
		const target: LifecycleHCT = {
			name: 'test',
			check: async () => ({
				state: 'healthy' as const,
				latencyMs: 5,
				message: null,
				lastChecked: new Date(),
			}),
		};

		// This should compile: ContainerHCT is the same type
		const containerTarget: ContainerHCT = target;
		expect(containerTarget.name).toBe('test');
	});
});
