import { describe, expect, it } from 'vitest';
import {
	CHANNEL_ADAPTATIONS,
	ChannelAdaptationSchema,
} from '../../src/persona/channel-adaptations.js';
import type { ChannelAdaptation } from '../../src/persona/channel-adaptations.js';

describe('ChannelAdaptation', () => {
	it('should define all 6 channels', () => {
		const channels = ['discord', 'telegram', 'slack', 'cli', 'email', 'webchat'];
		for (const ch of channels) {
			expect(CHANNEL_ADAPTATIONS[ch]).toBeDefined();
		}
	});

	it('should have formality and verbosity in [0, 1] for all channels', () => {
		for (const [channel, adaptation] of Object.entries(CHANNEL_ADAPTATIONS)) {
			expect(adaptation.formality).toBeGreaterThanOrEqual(0);
			expect(adaptation.formality).toBeLessThanOrEqual(1);
			expect(adaptation.verbosity).toBeGreaterThanOrEqual(0);
			expect(adaptation.verbosity).toBeLessThanOrEqual(1);
		}
	});

	it('should match plan §L4 values', () => {
		expect(CHANNEL_ADAPTATIONS['discord']).toEqual({ formality: 0.2, verbosity: 0.3 });
		expect(CHANNEL_ADAPTATIONS['telegram']).toEqual({ formality: 0.1, verbosity: 0.2 });
		expect(CHANNEL_ADAPTATIONS['slack']).toEqual({ formality: 0.5, verbosity: 0.5 });
		expect(CHANNEL_ADAPTATIONS['cli']).toEqual({ formality: 0.0, verbosity: 0.4 });
		expect(CHANNEL_ADAPTATIONS['email']).toEqual({ formality: 0.7, verbosity: 0.8 });
		expect(CHANNEL_ADAPTATIONS['webchat']).toEqual({ formality: 0.3, verbosity: 0.5 });
	});

	it('should validate custom ChannelAdaptation via schema', () => {
		const custom: ChannelAdaptation = { formality: 0.5, verbosity: 0.5 };
		const result = ChannelAdaptationSchema.safeParse(custom);
		expect(result.success).toBe(true);
	});

	it('should reject formality > 1', () => {
		const result = ChannelAdaptationSchema.safeParse({ formality: 1.5, verbosity: 0.5 });
		expect(result.success).toBe(false);
	});

	it('should reject verbosity < 0', () => {
		const result = ChannelAdaptationSchema.safeParse({ formality: 0.5, verbosity: -0.1 });
		expect(result.success).toBe(false);
	});
});
