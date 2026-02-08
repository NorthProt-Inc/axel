import type { DecayConfig, DecayInput } from './types.js';
import { calculateDecayedImportance } from './calculator.js';

/**
 * Process a batch of memories through the decay calculator.
 *
 * Returns an array of decayed importance values in the same order as inputs.
 * Pure function — no I/O.
 *
 * @param inputs - Array of decay inputs (one per memory)
 * @param config - Shared decay configuration
 * @returns Array of decayed importance values, same length as inputs
 */
export function decayBatch(
	inputs: readonly DecayInput[],
	config: DecayConfig,
): readonly number[] {
	return inputs.map((input) => calculateDecayedImportance(input, config));
}
