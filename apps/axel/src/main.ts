import { loadConfig } from './config.js';
import { type ContainerDeps, createContainer } from './container.js';
import { gracefulShutdown, startupHealthCheck } from './lifecycle.js';

const SHUTDOWN_TIMEOUT_MS = 30_000;

/**
 * Axel application entry point.
 *
 * 1. Load + validate configuration from env
 * 2. Create external clients (PG, Redis, LLM SDKs)
 * 3. Assemble DI container
 * 4. Run startup health check
 * 5. Register signal handlers for graceful shutdown
 * 6. Start channels
 */
export async function bootstrap(
	env: Record<string, string | undefined> = process.env,
	createDeps?: (config: ReturnType<typeof loadConfig>) => ContainerDeps,
): Promise<void> {
	const config = loadConfig(env);

	if (!createDeps) {
		throw new Error(
			'External dependency factory (createDeps) must be provided. ' +
				'Direct SDK client creation is deferred to the runtime layer.',
		);
	}

	const deps = createDeps(config);
	const container = createContainer(deps);

	// Startup health check
	await startupHealthCheck(container.healthCheckTargets);

	// Graceful shutdown handler (ADR-021)
	let shutdownInProgress = false;
	const shutdown = async () => {
		if (shutdownInProgress) return;
		shutdownInProgress = true;

		const timer = setTimeout(() => {
			process.exit(1);
		}, SHUTDOWN_TIMEOUT_MS);

		try {
			await gracefulShutdown({
				channels: [],
				workingMemory: container.workingMemory,
				redis: deps.redis,
				pgPool: container.pgPool,
			});
		} finally {
			clearTimeout(timer);
		}
	};

	process.on('SIGTERM', () => void shutdown());
	process.on('SIGINT', () => void shutdown());
}
