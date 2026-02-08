import { describe, expect, it } from 'vitest';
import { decayBatch } from '../../src/decay/batch.js';
import { DEFAULT_DECAY_CONFIG } from '../../src/decay/types.js';
import type { DecayInput } from '../../src/decay/types.js';

const config = DEFAULT_DECAY_CONFIG;

function makeInput(overrides: Partial<DecayInput> = {}): DecayInput {
	return {
		importance: 0.5,
		memoryType: 'fact',
		hoursElapsed: 0,
		accessCount: 1,
		connectionCount: 0,
		channelMentions: 0,
		lastAccessedHoursAgo: 0,
		ageHours: 0,
		...overrides,
	};
}

describe('decayBatch', () => {
	it('should process empty array', () => {
		const results = decayBatch([], config);
		expect(results).toEqual([]);
	});

	it('should process single item', () => {
		const inputs = [makeInput({ importance: 0.8, hoursElapsed: 100 })];
		const results = decayBatch(inputs, config);
		expect(results).toHaveLength(1);
		expect(results[0]).toBeGreaterThan(0);
		expect(results[0]).toBeLessThanOrEqual(0.8);
	});

	it('should process multiple items', () => {
		const inputs = [
			makeInput({ importance: 0.9, memoryType: 'fact', hoursElapsed: 720 }),
			makeInput({ importance: 0.5, memoryType: 'conversation', hoursElapsed: 720 }),
			makeInput({ importance: 0.3, memoryType: 'insight', hoursElapsed: 100 }),
		];
		const results = decayBatch(inputs, config);
		expect(results).toHaveLength(3);
		for (let i = 0; i < inputs.length; i++) {
			expect(results[i]).toBeGreaterThanOrEqual(0);
			expect(results[i]).toBeLessThanOrEqual(inputs[i]?.importance);
		}
	});

	it('should maintain order correspondence with inputs', () => {
		const inputs = [
			makeInput({ importance: 0.8, memoryType: 'fact', hoursElapsed: 0 }),
			makeInput({ importance: 0.5, memoryType: 'conversation', hoursElapsed: 2160 }),
		];
		const results = decayBatch(inputs, config);
		// First input: hoursElapsed=0 → result = importance
		expect(results[0]).toBe(0.8);
		// Second input: heavily decayed conversation
		expect(results[1]).toBeLessThan(0.5);
	});

	it('should produce same results as individual calculations', async () => {
		const { calculateDecayedImportance } = await import('../../src/decay/calculator.js');
		const inputs = [
			makeInput({ importance: 0.9, memoryType: 'fact', hoursElapsed: 720, channelMentions: 2 }),
			makeInput({ importance: 0.3, memoryType: 'insight', hoursElapsed: 100, accessCount: 5 }),
			makeInput({ importance: 0.1, memoryType: 'conversation', hoursElapsed: 2160 }),
		];
		const batchResults = decayBatch(inputs, config);
		for (const [i, input] of inputs.entries()) {
			const individual = calculateDecayedImportance(input, config);
			expect(batchResults[i]).toBe(individual);
		}
	});

	it('should handle large batch efficiently', () => {
		const inputs = Array.from({ length: 1000 }, (_, i) =>
			makeInput({
				importance: Math.random(),
				memoryType: (['fact', 'preference', 'insight', 'conversation'] as const)[i % 4],
				hoursElapsed: Math.random() * 2000,
				accessCount: Math.floor(Math.random() * 50) + 1,
				connectionCount: Math.floor(Math.random() * 15),
				channelMentions: Math.floor(Math.random() * 6),
				lastAccessedHoursAgo: Math.random() * 2000,
				ageHours: Math.random() * 2000,
			}),
		);

		const start = performance.now();
		const results = decayBatch(inputs, config);
		const elapsed = performance.now() - start;

		expect(results).toHaveLength(1000);
		// Should complete in <50ms for 1000 items (ADR-015: ~5ms for 1000)
		expect(elapsed).toBeLessThan(50);
	});
});
