import type { Logger } from '@axel/core/logging';
import { NoopLogger } from '@axel/core/logging';
import type { LlmChatChunk, LlmChatParams, LlmProvider } from '@axel/core/orchestrator';
import { PermanentError } from '@axel/core/types';
import { CircuitBreaker } from '../common/circuit-breaker.js';

interface NamedProvider {
	readonly name: string;
	readonly provider: LlmProvider;
	readonly breaker: CircuitBreaker;
}

/**
 * Fallback LLM provider chain with circuit breakers (GAP-03).
 *
 * Wraps each provider in a CircuitBreaker. On failure or open circuit,
 * falls through to the next provider. If all fail, throws PermanentError.
 */
export class FallbackLlmProvider implements LlmProvider {
	private readonly providers: readonly NamedProvider[];
	private readonly logger: Logger;

	constructor(
		providers: readonly { name: string; provider: LlmProvider }[],
		logger?: Logger,
	) {
		this.logger = logger ?? new NoopLogger();
		this.providers = providers.map((p) => ({
			name: p.name,
			provider: p.provider,
			breaker: new CircuitBreaker({ failureThreshold: 5, cooldownMs: 60_000 }),
		}));
	}

	async *chat(params: LlmChatParams): AsyncIterable<LlmChatChunk> {
		const errors: Error[] = [];

		for (const { name, provider, breaker } of this.providers) {
			if (breaker.state === 'open') {
				this.logger.debug('Circuit open, skipping provider', { provider: name });
				continue;
			}

			try {
				const stream = yield* this.tryProvider(provider, breaker, params);
				// If we got here without error, the stream completed successfully
				return stream;
			} catch (err: unknown) {
				const message = err instanceof Error ? err.message : String(err);
				errors.push(err instanceof Error ? err : new Error(message));

				this.logger.warn('Provider failed, trying next', {
					failedProvider: name,
					error: message,
				});
			}
		}

		throw new PermanentError(
			`All LLM providers failed: ${errors.map((e) => e.message).join('; ')}`,
		);
	}

	private async *tryProvider(
		provider: LlmProvider,
		breaker: CircuitBreaker,
		params: LlmChatParams,
	): AsyncGenerator<LlmChatChunk> {
		// Use circuit breaker to get the stream
		const stream = await breaker.execute(async () => {
			return provider.chat(params);
		});

		// Iterate the stream inside try/catch to record failures
		try {
			for await (const chunk of stream) {
				yield chunk;
			}
		} catch (err: unknown) {
			// Record the failure in the circuit breaker by executing a failing fn
			try {
				await breaker.execute(async () => {
					throw err;
				});
			} catch {
				// Expected — we just wanted to record the failure
			}
			throw err;
		}
	}
}
