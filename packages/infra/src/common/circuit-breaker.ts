/** Circuit breaker state (ADR-021 Section 4) */
type CircuitState = 'closed' | 'open' | 'half_open';

/** Circuit breaker configuration */
interface CircuitBreakerConfig {
	readonly failureThreshold: number;
	readonly cooldownMs: number;
	readonly halfOpenMaxProbes: number;
}

/** Error thrown when circuit is open */
class CircuitOpenError extends Error {
	constructor() {
		super('Circuit breaker is open. Retry after cooldown.');
		this.name = 'CircuitOpenError';
	}
}

const DEFAULT_CIRCUIT_CONFIG: CircuitBreakerConfig = {
	failureThreshold: 5,
	cooldownMs: 60_000,
	halfOpenMaxProbes: 1,
};

/**
 * Circuit breaker state machine (ADR-021).
 *
 * CLOSED → (failures >= threshold) → OPEN
 * OPEN → (cooldown elapsed) → HALF_OPEN
 * HALF_OPEN → (success) → CLOSED
 * HALF_OPEN → (failure) → OPEN
 */
class CircuitBreaker {
	private _state: CircuitState = 'closed';
	private failureCount = 0;
	private openedAt: number | null = null;
	private readonly config: CircuitBreakerConfig;

	constructor(config?: Partial<CircuitBreakerConfig>) {
		this.config = { ...DEFAULT_CIRCUIT_CONFIG, ...config };
	}

	get state(): CircuitState {
		if (this._state === 'open' && this.isCooldownElapsed()) {
			return 'half_open';
		}
		return this._state;
	}

	async execute<T>(fn: () => Promise<T>): Promise<T> {
		const currentState = this.state;

		if (currentState === 'open') {
			throw new CircuitOpenError();
		}

		try {
			const result = await fn();
			this.onSuccess();
			return result;
		} catch (error) {
			this.onFailure();
			throw error;
		}
	}

	reset(): void {
		this._state = 'closed';
		this.failureCount = 0;
		this.openedAt = null;
	}

	private onSuccess(): void {
		this.failureCount = 0;
		this._state = 'closed';
		this.openedAt = null;
	}

	private onFailure(): void {
		this.failureCount++;
		if (
			this._state === 'half_open' ||
			this.failureCount >= this.config.failureThreshold
		) {
			this._state = 'open';
			this.openedAt = Date.now();
		}
	}

	private isCooldownElapsed(): boolean {
		if (this.openedAt === null) return false;
		return Date.now() - this.openedAt >= this.config.cooldownMs;
	}
}

export {
	CircuitBreaker,
	CircuitOpenError,
	type CircuitBreakerConfig,
	type CircuitState,
};
