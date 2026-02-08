import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Types (will be implemented in src/common/circuit-breaker.ts) ───

type CircuitState = 'closed' | 'open' | 'half_open';

interface CircuitBreakerConfig {
	readonly failureThreshold: number;
	readonly cooldownMs: number;
	readonly halfOpenMaxProbes: number;
}

interface CircuitBreaker {
	readonly state: CircuitState;
	execute<T>(fn: () => Promise<T>): Promise<T>;
	reset(): void;
}

// ─── Tests ───

describe('CircuitBreaker', () => {
	const DEFAULT_CONFIG: CircuitBreakerConfig = {
		failureThreshold: 3,
		cooldownMs: 1_000,
		halfOpenMaxProbes: 1,
	};

	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe('CLOSED state (normal operation)', () => {
		it('should start in closed state', async () => {
			const { CircuitBreaker: CB } = await import('../../src/common/circuit-breaker.js');
			const breaker: CircuitBreaker = new CB(DEFAULT_CONFIG);

			expect(breaker.state).toBe('closed');
		});

		it('should pass through successful calls', async () => {
			const { CircuitBreaker: CB } = await import('../../src/common/circuit-breaker.js');
			const breaker: CircuitBreaker = new CB(DEFAULT_CONFIG);

			const result = await breaker.execute(async () => 42);

			expect(result).toBe(42);
			expect(breaker.state).toBe('closed');
		});

		it('should propagate errors from the wrapped function', async () => {
			const { CircuitBreaker: CB } = await import('../../src/common/circuit-breaker.js');
			const breaker: CircuitBreaker = new CB(DEFAULT_CONFIG);

			await expect(
				breaker.execute(async () => {
					throw new Error('test error');
				}),
			).rejects.toThrow('test error');
		});

		it('should track failure count without opening if below threshold', async () => {
			const { CircuitBreaker: CB } = await import('../../src/common/circuit-breaker.js');
			const breaker: CircuitBreaker = new CB(DEFAULT_CONFIG);

			// 2 failures (threshold is 3)
			for (let i = 0; i < 2; i++) {
				await breaker
					.execute(async () => {
						throw new Error('fail');
					})
					.catch(() => {});
			}

			expect(breaker.state).toBe('closed');
		});

		it('should reset failure count on success', async () => {
			const { CircuitBreaker: CB } = await import('../../src/common/circuit-breaker.js');
			const breaker: CircuitBreaker = new CB(DEFAULT_CONFIG);

			// 2 failures
			for (let i = 0; i < 2; i++) {
				await breaker
					.execute(async () => {
						throw new Error('fail');
					})
					.catch(() => {});
			}

			// 1 success → resets counter
			await breaker.execute(async () => 'ok');

			// 2 more failures should NOT open (counter was reset)
			for (let i = 0; i < 2; i++) {
				await breaker
					.execute(async () => {
						throw new Error('fail');
					})
					.catch(() => {});
			}

			expect(breaker.state).toBe('closed');
		});
	});

	describe('CLOSED → OPEN transition', () => {
		it('should open after consecutive failures reach threshold', async () => {
			const { CircuitBreaker: CB } = await import('../../src/common/circuit-breaker.js');
			const breaker: CircuitBreaker = new CB(DEFAULT_CONFIG);

			for (let i = 0; i < 3; i++) {
				await breaker
					.execute(async () => {
						throw new Error('fail');
					})
					.catch(() => {});
			}

			expect(breaker.state).toBe('open');
		});
	});

	describe('OPEN state (blocking)', () => {
		it('should reject calls immediately without invoking the function', async () => {
			const { CircuitBreaker: CB } = await import('../../src/common/circuit-breaker.js');
			const breaker: CircuitBreaker = new CB(DEFAULT_CONFIG);

			// Open the circuit
			for (let i = 0; i < 3; i++) {
				await breaker
					.execute(async () => {
						throw new Error('fail');
					})
					.catch(() => {});
			}

			const fn = vi.fn().mockResolvedValue('should not run');

			await expect(breaker.execute(fn)).rejects.toThrow(/circuit.*open/i);
			expect(fn).not.toHaveBeenCalled();
		});
	});

	describe('OPEN → HALF_OPEN transition', () => {
		it('should transition to half_open after cooldown period', async () => {
			const { CircuitBreaker: CB } = await import('../../src/common/circuit-breaker.js');
			const breaker: CircuitBreaker = new CB(DEFAULT_CONFIG);

			// Open the circuit
			for (let i = 0; i < 3; i++) {
				await breaker
					.execute(async () => {
						throw new Error('fail');
					})
					.catch(() => {});
			}

			expect(breaker.state).toBe('open');

			// Advance time past cooldown
			vi.advanceTimersByTime(1_001);

			// The state should now allow a probe
			// Next call will transition to half_open internally
			await breaker.execute(async () => 'probe success');

			expect(breaker.state).toBe('closed');
		});
	});

	describe('HALF_OPEN state', () => {
		it('should close circuit on successful probe', async () => {
			const { CircuitBreaker: CB } = await import('../../src/common/circuit-breaker.js');
			const breaker: CircuitBreaker = new CB(DEFAULT_CONFIG);

			// Open the circuit
			for (let i = 0; i < 3; i++) {
				await breaker
					.execute(async () => {
						throw new Error('fail');
					})
					.catch(() => {});
			}

			vi.advanceTimersByTime(1_001);

			// Successful probe → close
			await breaker.execute(async () => 'success');

			expect(breaker.state).toBe('closed');
		});

		it('should reopen circuit on failed probe', async () => {
			const { CircuitBreaker: CB } = await import('../../src/common/circuit-breaker.js');
			const breaker: CircuitBreaker = new CB(DEFAULT_CONFIG);

			// Open the circuit
			for (let i = 0; i < 3; i++) {
				await breaker
					.execute(async () => {
						throw new Error('fail');
					})
					.catch(() => {});
			}

			vi.advanceTimersByTime(1_001);

			// Failed probe → reopen
			await breaker
				.execute(async () => {
					throw new Error('still failing');
				})
				.catch(() => {});

			expect(breaker.state).toBe('open');
		});
	});

	describe('reset()', () => {
		it('should reset to closed state', async () => {
			const { CircuitBreaker: CB } = await import('../../src/common/circuit-breaker.js');
			const breaker: CircuitBreaker = new CB(DEFAULT_CONFIG);

			// Open the circuit
			for (let i = 0; i < 3; i++) {
				await breaker
					.execute(async () => {
						throw new Error('fail');
					})
					.catch(() => {});
			}

			expect(breaker.state).toBe('open');

			breaker.reset();

			expect(breaker.state).toBe('closed');
		});
	});
});
