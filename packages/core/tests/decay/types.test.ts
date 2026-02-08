import { describe, expect, it } from 'vitest';
import type { DecayInput, DecayConfig } from '../../src/decay/types.js';
import { DEFAULT_DECAY_CONFIG, DecayInputSchema, DecayConfigSchema } from '../../src/decay/types.js';

describe('DecayInput', () => {
	it('should accept valid input', () => {
		const input: DecayInput = {
			importance: 0.8,
			memoryType: 'fact',
			hoursElapsed: 720,
			accessCount: 1,
			connectionCount: 0,
			channelMentions: 1,
			lastAccessedHoursAgo: 720,
			ageHours: 720,
		};
		const result = DecayInputSchema.safeParse(input);
		expect(result.success).toBe(true);
	});

	it('should reject importance outside [0, 1]', () => {
		const input = {
			importance: 1.5,
			memoryType: 'fact',
			hoursElapsed: 0,
			accessCount: 1,
			connectionCount: 0,
			channelMentions: 0,
			lastAccessedHoursAgo: 0,
			ageHours: 0,
		};
		const result = DecayInputSchema.safeParse(input);
		expect(result.success).toBe(false);
	});

	it('should reject negative importance', () => {
		const input = {
			importance: -0.1,
			memoryType: 'fact',
			hoursElapsed: 0,
			accessCount: 1,
			connectionCount: 0,
			channelMentions: 0,
			lastAccessedHoursAgo: 0,
			ageHours: 0,
		};
		const result = DecayInputSchema.safeParse(input);
		expect(result.success).toBe(false);
	});

	it('should enforce accessCount >= 1', () => {
		const input = {
			importance: 0.5,
			memoryType: 'fact',
			hoursElapsed: 0,
			accessCount: 0,
			connectionCount: 0,
			channelMentions: 0,
			lastAccessedHoursAgo: 0,
			ageHours: 0,
		};
		const result = DecayInputSchema.safeParse(input);
		expect(result.success).toBe(false);
	});

	it('should reject invalid memoryType', () => {
		const input = {
			importance: 0.5,
			memoryType: 'unknown',
			hoursElapsed: 0,
			accessCount: 1,
			connectionCount: 0,
			channelMentions: 0,
			lastAccessedHoursAgo: 0,
			ageHours: 0,
		};
		const result = DecayInputSchema.safeParse(input);
		expect(result.success).toBe(false);
	});

	it('should reject negative hoursElapsed', () => {
		const input = {
			importance: 0.5,
			memoryType: 'fact',
			hoursElapsed: -1,
			accessCount: 1,
			connectionCount: 0,
			channelMentions: 0,
			lastAccessedHoursAgo: 0,
			ageHours: 0,
		};
		const result = DecayInputSchema.safeParse(input);
		expect(result.success).toBe(false);
	});

	it('should accept all four memoryType values', () => {
		for (const memoryType of ['fact', 'preference', 'insight', 'conversation'] as const) {
			const input = {
				importance: 0.5,
				memoryType,
				hoursElapsed: 0,
				accessCount: 1,
				connectionCount: 0,
				channelMentions: 0,
				lastAccessedHoursAgo: 0,
				ageHours: 0,
			};
			const result = DecayInputSchema.safeParse(input);
			expect(result.success).toBe(true);
		}
	});
});

describe('DecayConfig', () => {
	it('should have valid DEFAULT_DECAY_CONFIG', () => {
		const result = DecayConfigSchema.safeParse(DEFAULT_DECAY_CONFIG);
		expect(result.success).toBe(true);
	});

	it('should match ADR-015 default values', () => {
		expect(DEFAULT_DECAY_CONFIG.baseRate).toBe(0.001);
		expect(DEFAULT_DECAY_CONFIG.minRetention).toBe(0.3);
		expect(DEFAULT_DECAY_CONFIG.deleteThreshold).toBe(0.03);
		expect(DEFAULT_DECAY_CONFIG.accessStabilityK).toBe(0.3);
		expect(DEFAULT_DECAY_CONFIG.relationResistanceK).toBe(0.1);
		expect(DEFAULT_DECAY_CONFIG.channelDiversityK).toBe(0.2);
		expect(DEFAULT_DECAY_CONFIG.recencyBoost).toBe(1.3);
		expect(DEFAULT_DECAY_CONFIG.recencyAgeThreshold).toBe(168);
		expect(DEFAULT_DECAY_CONFIG.recencyAccessThreshold).toBe(24);
		expect(DEFAULT_DECAY_CONFIG.typeMultipliers).toEqual({
			fact: 0.3,
			preference: 0.5,
			insight: 0.7,
			conversation: 1.0,
		});
	});

	it('should accept custom config', () => {
		const config: DecayConfig = {
			baseRate: 0.002,
			minRetention: 0.5,
			deleteThreshold: 0.05,
			accessStabilityK: 0.4,
			relationResistanceK: 0.2,
			channelDiversityK: 0.3,
			recencyBoost: 1.5,
			recencyAgeThreshold: 200,
			recencyAccessThreshold: 48,
			typeMultipliers: {
				fact: 0.2,
				preference: 0.4,
				insight: 0.6,
				conversation: 0.8,
			},
		};
		const result = DecayConfigSchema.safeParse(config);
		expect(result.success).toBe(true);
	});
});
