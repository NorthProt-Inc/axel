import { describe, expect, it } from 'vitest';
import { calculateDecayedImportance } from '../../src/decay/calculator.js';
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

describe('calculateDecayedImportance', () => {
	describe('ADR-015 Scenario Regression Tests', () => {
		it('Scenario 1: New fact, single channel, no relations, 1 access (30 days)', () => {
			const input = makeInput({
				importance: 0.8,
				memoryType: 'fact',
				hoursElapsed: 720,
				accessCount: 1,
				connectionCount: 0,
				channelMentions: 1,
				lastAccessedHoursAgo: 720,
				ageHours: 720,
			});
			const result = calculateDecayedImportance(input, config);
			// ADR-015: result = 0.689
			expect(result).toBeCloseTo(0.689, 2);
		});

		it('Scenario 2: Conversation, single channel, no relations, 1 access (30 days)', () => {
			const input = makeInput({
				importance: 0.5,
				memoryType: 'conversation',
				hoursElapsed: 720,
				accessCount: 1,
				connectionCount: 0,
				channelMentions: 1,
				lastAccessedHoursAgo: 720,
				ageHours: 720,
			});
			const result = calculateDecayedImportance(input, config);
			// ADR-015: result = 0.304
			expect(result).toBeCloseTo(0.304, 2);
		});

		it('Scenario 3: Fact, 3 channels, 5 relations, frequently accessed (60 days, recently accessed)', () => {
			const input = makeInput({
				importance: 0.9,
				memoryType: 'fact',
				hoursElapsed: 1440,
				accessCount: 20,
				connectionCount: 5,
				channelMentions: 3,
				lastAccessedHoursAgo: 12,
				ageHours: 1440,
			});
			const result = calculateDecayedImportance(input, config);
			// ADR-015 with EC-1 fix: recency boost capped at importance
			// decayed = 0.839, boosted = min(0.839 * 1.3, 0.9) = min(1.090, 0.9) = 0.9
			expect(result).toBeCloseTo(0.9, 2);
		});

		it('Scenario 4: Low importance conversation near deletion (90 days)', () => {
			const input = makeInput({
				importance: 0.1,
				memoryType: 'conversation',
				hoursElapsed: 2160,
				accessCount: 1,
				connectionCount: 0,
				channelMentions: 0,
				lastAccessedHoursAgo: 2160,
				ageHours: 2160,
			});
			const result = calculateDecayedImportance(input, config);
			// ADR-015: floor = 0.3 * 0.1 = 0.03, result = max(0.0167, 0.03) = 0.03
			expect(result).toBeCloseTo(0.03, 3);
		});

		it('Scenario 5: Very low importance → marked for deletion', () => {
			const input = makeInput({
				importance: 0.05,
				memoryType: 'conversation',
				hoursElapsed: 2160,
				accessCount: 1,
				connectionCount: 0,
				channelMentions: 0,
				lastAccessedHoursAgo: 2160,
				ageHours: 2160,
			});
			const result = calculateDecayedImportance(input, config);
			// ADR-015: floor = 0.3 * 0.05 = 0.015 < DELETE_THRESHOLD(0.03)
			expect(result).toBeCloseTo(0.015, 3);
			expect(result).toBeLessThan(config.deleteThreshold);
		});
	});

	describe('Edge Cases (ADR-015)', () => {
		it('EC-1: Recency boost is capped at original importance', () => {
			const input = makeInput({
				importance: 0.9,
				memoryType: 'fact',
				hoursElapsed: 1440,
				accessCount: 20,
				connectionCount: 5,
				channelMentions: 3,
				lastAccessedHoursAgo: 12,
				ageHours: 1440,
			});
			const result = calculateDecayedImportance(input, config);
			expect(result).toBeLessThanOrEqual(input.importance);
		});

		it('EC-2: resistance = 1.0 → no decay (connectionCount >= 10)', () => {
			const input = makeInput({
				importance: 0.8,
				memoryType: 'conversation',
				hoursElapsed: 87600, // 10 years
				accessCount: 1,
				connectionCount: 10,
				channelMentions: 0,
				lastAccessedHoursAgo: 87600,
				ageHours: 87600,
			});
			const result = calculateDecayedImportance(input, config);
			expect(result).toBe(input.importance);
		});

		it('EC-3: channelMentions = 0 → neutral channelBoost', () => {
			const withZeroChannels = makeInput({
				importance: 0.5,
				memoryType: 'fact',
				hoursElapsed: 720,
				accessCount: 1,
				connectionCount: 0,
				channelMentions: 0,
			});
			const result = calculateDecayedImportance(withZeroChannels, config);
			// channelBoost = 1/(1+0) = 1.0 — neutral
			expect(result).toBeGreaterThan(0);
			expect(result).toBeLessThanOrEqual(0.5);
		});

		it('EC-4: hoursElapsed = 0 → result equals importance', () => {
			const input = makeInput({
				importance: 0.8,
				memoryType: 'fact',
				hoursElapsed: 0,
				accessCount: 1,
				connectionCount: 0,
				channelMentions: 0,
				lastAccessedHoursAgo: 0,
				ageHours: 0,
			});
			const result = calculateDecayedImportance(input, config);
			expect(result).toBe(0.8);
		});

		it('EC-6: Very large hoursElapsed → floor catches it', () => {
			const input = makeInput({
				importance: 0.5,
				memoryType: 'conversation',
				hoursElapsed: 87600, // 10 years
				accessCount: 1,
				connectionCount: 0,
				channelMentions: 0,
				lastAccessedHoursAgo: 87600,
				ageHours: 87600,
			});
			const result = calculateDecayedImportance(input, config);
			// floor = 0.3 * 0.5 = 0.15
			expect(result).toBe(0.15);
		});

		it('EC-7: Recency paradox timing boundary', () => {
			const input = makeInput({
				importance: 0.6,
				memoryType: 'fact',
				hoursElapsed: 170,
				accessCount: 1,
				connectionCount: 0,
				channelMentions: 0,
				lastAccessedHoursAgo: 23,
				ageHours: 170,
			});
			const result = calculateDecayedImportance(input, config);
			// ageHours=170 > 168 ✓ AND lastAccessedHoursAgo=23 < 24 ✓ → boost applied
			// Without boost: decayed = 0.6 * exp(-0.001 * 0.3 * 1.0 / 1.208 * 170)
			// The boost should be applied, so result > non-boosted value
			const inputNoBoost = makeInput({
				...input,
				ageHours: 167, // just below threshold → no boost
			});
			const resultNoBoost = calculateDecayedImportance(inputNoBoost, config);
			expect(result).toBeGreaterThan(resultNoBoost);
		});
	});

	describe('Property-Based Properties', () => {
		it('result is always in [0, importance]', () => {
			const importances = [0, 0.01, 0.1, 0.5, 0.8, 1.0];
			const types = ['fact', 'preference', 'insight', 'conversation'] as const;
			for (const imp of importances) {
				for (const type of types) {
					const input = makeInput({
						importance: imp,
						memoryType: type,
						hoursElapsed: 1000,
						accessCount: 5,
						connectionCount: 3,
						channelMentions: 2,
						lastAccessedHoursAgo: 10,
						ageHours: 1000,
					});
					const result = calculateDecayedImportance(input, config);
					expect(result).toBeGreaterThanOrEqual(0);
					expect(result).toBeLessThanOrEqual(imp);
				}
			}
		});

		it('monotonically decreasing with hoursElapsed (no recency boost)', () => {
			const hours = [0, 100, 500, 1000, 5000, 10000];
			let prev = Number.POSITIVE_INFINITY;
			for (const h of hours) {
				const input = makeInput({
					importance: 0.8,
					memoryType: 'fact',
					hoursElapsed: h,
					accessCount: 1,
					connectionCount: 0,
					channelMentions: 0,
					lastAccessedHoursAgo: h, // no recency
					ageHours: h,
				});
				const result = calculateDecayedImportance(input, config);
				expect(result).toBeLessThanOrEqual(prev);
				prev = result;
			}
		});

		it('higher channelMentions → higher result (slower decay)', () => {
			const channels = [0, 1, 3, 5, 10];
			let prev = 0;
			for (const ch of channels) {
				const input = makeInput({
					importance: 0.8,
					memoryType: 'conversation',
					hoursElapsed: 720,
					accessCount: 1,
					connectionCount: 0,
					channelMentions: ch,
					lastAccessedHoursAgo: 720,
					ageHours: 720,
				});
				const result = calculateDecayedImportance(input, config);
				expect(result).toBeGreaterThanOrEqual(prev);
				prev = result;
			}
		});

		it('higher accessCount → higher result (slower decay)', () => {
			const accesses = [1, 2, 5, 10, 50, 100];
			let prev = 0;
			for (const ac of accesses) {
				const input = makeInput({
					importance: 0.8,
					memoryType: 'conversation',
					hoursElapsed: 720,
					accessCount: ac,
					connectionCount: 0,
					channelMentions: 0,
					lastAccessedHoursAgo: 720,
					ageHours: 720,
				});
				const result = calculateDecayedImportance(input, config);
				expect(result).toBeGreaterThanOrEqual(prev);
				prev = result;
			}
		});

		it('higher connectionCount → higher result (slower decay)', () => {
			const connections = [0, 1, 3, 5, 10, 20];
			let prev = 0;
			for (const cn of connections) {
				const input = makeInput({
					importance: 0.8,
					memoryType: 'conversation',
					hoursElapsed: 720,
					accessCount: 1,
					connectionCount: cn,
					channelMentions: 0,
					lastAccessedHoursAgo: 720,
					ageHours: 720,
				});
				const result = calculateDecayedImportance(input, config);
				expect(result).toBeGreaterThanOrEqual(prev);
				prev = result;
			}
		});

		it('importance = 0 → result = 0', () => {
			const input = makeInput({
				importance: 0,
				memoryType: 'fact',
				hoursElapsed: 100,
				accessCount: 1,
				connectionCount: 0,
				channelMentions: 0,
			});
			const result = calculateDecayedImportance(input, config);
			expect(result).toBe(0);
		});
	});

	describe('Type Multiplier Effects', () => {
		it('facts decay slowest, conversations decay fastest', () => {
			const types = ['fact', 'preference', 'insight', 'conversation'] as const;
			const results: number[] = [];
			for (const type of types) {
				const input = makeInput({
					importance: 0.8,
					memoryType: type,
					hoursElapsed: 720,
					accessCount: 1,
					connectionCount: 0,
					channelMentions: 0,
					lastAccessedHoursAgo: 720,
					ageHours: 720,
				});
				results.push(calculateDecayedImportance(input, config));
			}
			// fact > preference > insight > conversation (higher retained = slower decay)
			expect(results[0]).toBeGreaterThan(results[1]!);
			expect(results[1]).toBeGreaterThan(results[2]!);
			expect(results[2]).toBeGreaterThan(results[3]!);
		});
	});
});
