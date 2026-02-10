/**
 * FEAT-INTENT-002b: Fallback intent classification chain.
 *
 * Composes a primary classifier (e.g., GeminiIntentClassifier)
 * with a fallback classifier (e.g., KeywordIntentClassifier).
 * If the primary throws, the fallback is used transparently.
 */

import type {
	ClassificationContext,
	ClassificationResult,
	IntentClassifier,
} from '@axel/core/types';

class FallbackIntentClassifier implements IntentClassifier {
	private readonly primary: IntentClassifier;
	private readonly fallback: IntentClassifier;

	constructor(primary: IntentClassifier, fallback: IntentClassifier) {
		this.primary = primary;
		this.fallback = fallback;
	}

	readonly classify = async (
		message: string,
		context?: ClassificationContext,
	): Promise<ClassificationResult> => {
		try {
			return await this.primary.classify(message, context);
		} catch {
			return this.fallback.classify(message, context);
		}
	};
}

function createFallbackClassifier(
	primary: IntentClassifier,
	fallback: IntentClassifier,
): IntentClassifier {
	return new FallbackIntentClassifier(primary, fallback);
}

export { FallbackIntentClassifier, createFallbackClassifier };
