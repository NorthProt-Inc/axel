import type { DecayConfig, DecayInput } from './types.js';

/**
 * Calculate the decayed importance of a memory.
 *
 * Pure function implementing the Adaptive Decay v2 formula (ADR-015).
 * No I/O, no side effects.
 *
 * @param input - Memory attributes for decay calculation
 * @param config - Decay configuration parameters
 * @returns Decayed importance value in [0, input.importance]
 */
export function calculateDecayedImportance(input: DecayInput, config: DecayConfig): number {
	const {
		importance,
		memoryType,
		hoursElapsed,
		accessCount,
		connectionCount,
		channelMentions,
		lastAccessedHoursAgo,
		ageHours,
	} = input;

	// Step 1: Type multiplier (lower = slower decay)
	const typeMultiplier = config.typeMultipliers[memoryType] ?? 1.0;

	// Step 2: Access stability (logarithmic stabilization)
	const stability = 1 + config.accessStabilityK * Math.log1p(accessCount);

	// Step 3: Relation resistance (capped at 1.0; at 1.0 memory never decays)
	const resistance = Math.min(1.0, connectionCount * config.relationResistanceK);

	// Step 4: Channel diversity (more channels = slower decay)
	const channelBoost = 1.0 / (1 + config.channelDiversityK * channelMentions);

	// Step 5: Effective decay rate
	const effectiveRate =
		((config.baseRate * typeMultiplier * channelBoost) / stability) * (1 - resistance);

	// Step 6: Exponential decay
	let decayed = importance * Math.exp(-effectiveRate * hoursElapsed);

	// Step 7: Recency paradox boost (EC-1 fix: cap at original importance)
	if (
		ageHours > config.recencyAgeThreshold &&
		lastAccessedHoursAgo < config.recencyAccessThreshold
	) {
		decayed = Math.min(decayed * config.recencyBoost, importance);
	}

	// Step 8: Min retention floor
	const floor = config.minRetention * importance;
	return Math.max(decayed, floor);
}
