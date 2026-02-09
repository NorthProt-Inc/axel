import type { PersonaEngine } from '@axel/core/persona';
import {
	createActiveUserTracker,
	createChannels,
	createHandleMessage,
	wireChannels,
} from './bootstrap-channels.js';
import { loadConfig } from './config.js';
import { type ContainerDeps, createContainer } from './container.js';
import { gracefulShutdown, startupHealthCheck } from './lifecycle.js';

const SHUTDOWN_TIMEOUT_MS = 30_000;

/** External overrides for testing */
export interface BootstrapOptions {
	readonly personaEngine?: PersonaEngine;
}

/**
 * Axel application entry point.
 *
 * 1. Load + validate configuration from env
 * 2. Create external clients (PG, Redis, LLM SDKs)
 * 3. Assemble DI container
 * 4. Run startup health check
 * 5. Create and wire channels
 * 6. Create gateway HandleMessage adapter
 * 7. Start all channels
 * 8. Register signal handlers for graceful shutdown
 */
export async function bootstrap(
	env: Record<string, string | undefined> = process.env,
	createDeps?: (config: ReturnType<typeof loadConfig>) => ContainerDeps,
	options?: BootstrapOptions,
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

	// PersonaEngine — injected for testing, or stub for now
	const personaEngine: PersonaEngine = options?.personaEngine ?? createStubPersonaEngine();

	// Create channels from config
	const channels = createChannels(config);

	// Active user tracking for graceful shutdown flush (FIX-MEMORY-002)
	const activeUserTracker = createActiveUserTracker();

	// Wire InboundHandler to channels
	wireChannels(channels, container, personaEngine, activeUserTracker);

	// Create gateway HandleMessage adapter (available for gateway wiring)
	const _handleMessage = createHandleMessage(container, personaEngine);

	// Start all channels
	for (const channel of channels) {
		await channel.start();
	}

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
				channels,
				workingMemory: container.workingMemory,
				redis: deps.redis,
				pgPool: container.pgPool,
				getActiveUserIds: activeUserTracker.getActiveUserIds,
			});
		} finally {
			clearTimeout(timer);
		}
	};

	process.on('SIGTERM', () => void shutdown());
	process.on('SIGINT', () => void shutdown());
}

/** Stub PersonaEngine for bootstrap (real impl in packages/infra) */
function createStubPersonaEngine(): PersonaEngine {
	const defaultPrompt = 'You are Axel, a helpful AI assistant.';
	return {
		load: async () => ({}) as never,
		reload: async () => ({}) as never,
		getSystemPrompt: () => defaultPrompt,
		evolve: async () => {},
		updatePreference: async () => {},
	};
}

// ─── Application entry point ───

import { createRuntimeDeps } from './runtime-deps.js';

bootstrap(process.env, createRuntimeDeps).catch((err: unknown) => {
	console.error('Fatal:', err);
	process.exit(1);
});
