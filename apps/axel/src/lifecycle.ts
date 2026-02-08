import type { ComponentHealth, HealthState, HealthStatus } from '@axel/core/types';

/** Health check target for startup/runtime monitoring */
export interface HealthCheckTarget {
	readonly name: string;
	readonly check: () => Promise<ComponentHealth>;
}

/** Minimal interface for shutdownable channel */
interface ShutdownableChannel {
	readonly id: string;
	stop(): Promise<void>;
}

/** Container subset needed for graceful shutdown (ADR-021 Section 2) */
export interface ShutdownableContainer {
	readonly channels: readonly ShutdownableChannel[];
	readonly workingMemory: { flush(userId: string): Promise<void> };
	readonly redis: { quit(): Promise<unknown> };
	readonly pgPool: { end(): Promise<void> };
}

const startTime = Date.now();

/**
 * Aggregate health checks from all components.
 *
 * Rules:
 * - All healthy → system healthy
 * - Any unhealthy → system unhealthy
 * - Any degraded (none unhealthy) → system degraded
 */
export async function aggregateHealth(
	targets: readonly HealthCheckTarget[],
): Promise<HealthStatus> {
	const checks: Record<string, ComponentHealth> = {};
	let worstState: HealthState = 'healthy';

	const results = await Promise.allSettled(
		targets.map(async (target) => {
			const health = await target.check();
			return { name: target.name, health };
		}),
	);

	for (const result of results) {
		if (result.status === 'fulfilled') {
			checks[result.value.name] = result.value.health;
			worstState = worseState(worstState, result.value.health.state);
		} else {
			const name =
				targets[results.indexOf(result)]?.name ?? 'unknown';
			checks[name] = {
				state: 'unhealthy',
				latencyMs: null,
				message: result.reason instanceof Error ? result.reason.message : String(result.reason),
				lastChecked: new Date(),
			};
			worstState = 'unhealthy';
		}
	}

	return {
		state: worstState,
		checks,
		timestamp: new Date(),
		uptime: Math.floor((Date.now() - startTime) / 1000),
	};
}

function worseState(a: HealthState, b: HealthState): HealthState {
	const severity: Record<HealthState, number> = { healthy: 0, degraded: 1, unhealthy: 2 };
	return severity[a] >= severity[b] ? a : b;
}

/**
 * Startup health check — verify all services are reachable.
 *
 * Throws if any critical component is unhealthy.
 * Allows degraded state (e.g., Redis reconnecting).
 */
export async function startupHealthCheck(
	targets: readonly HealthCheckTarget[],
): Promise<HealthStatus> {
	const status = await aggregateHealth(targets);
	if (status.state === 'unhealthy') {
		const failedNames = Object.entries(status.checks)
			.filter(([, c]) => c.state === 'unhealthy')
			.map(([name]) => name);
		throw new Error(`Startup health check failed: ${failedNames.join(', ')}`);
	}
	return status;
}

/**
 * 4-phase graceful shutdown per ADR-021 Section 2.
 *
 * Phase 1: Stop channels (stop accepting new work)
 * Phase 2: (reserved for gateway drain — not yet implemented)
 * Phase 3: Flush state (working memory → PG)
 * Phase 4: Close connections (Redis, PostgreSQL)
 *
 * Each phase catches errors to ensure subsequent phases execute.
 */
export async function gracefulShutdown(container: ShutdownableContainer): Promise<void> {
	// Phase 1: Stop channels
	for (const channel of container.channels) {
		try {
			await channel.stop();
		} catch (_err: unknown) {
			// Continue shutdown even if channel stop fails
		}
	}

	// Phase 3: Flush state
	try {
		await container.workingMemory.flush('*');
	} catch (_err: unknown) {
		// Continue shutdown even if flush fails
	}

	// Phase 4: Close connections
	try {
		await container.redis.quit();
	} catch (_err: unknown) {
		// Continue shutdown even if Redis quit fails
	}

	try {
		await container.pgPool.end();
	} catch (_err: unknown) {
		// Continue shutdown even if PG end fails
	}
}
