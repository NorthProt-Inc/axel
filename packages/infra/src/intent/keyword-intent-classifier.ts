/**
 * FEAT-INTENT-002b: KeywordIntentClassifier
 *
 * Standalone keyword-based intent classifier.
 * Implements IntentClassifier interface for drop-in replacement
 * when the LLM-based GeminiIntentClassifier is unavailable.
 *
 * Supports Korean + English keyword matching across 6 intent types.
 */

import type {
	ClassificationContext,
	ClassificationResult,
	IntentClassifier,
} from '@axel/core/types';

// --- Keyword Maps ---

const INTENT_KEYWORDS: Readonly<Record<string, readonly string[]>> = {
	search: ['검색', '찾아', 'search', 'find', 'look up', '알려줘'],
	tool_use: ['파일', '실행', '코드', 'file', 'run', 'execute', '읽어'],
	memory_query: ['기억', '지난번', '이전에', 'remember', 'last time', 'before'],
	command: ['설정', 'config', 'setting', '알림'],
	creative: ['써줘', '만들어', 'generate', 'create', 'write', '작성'],
};

// --- Confidence Constants ---

const SLASH_CONFIDENCE = 0.85;
const KEYWORD_CONFIDENCE = 0.45;
const CHAT_FALLBACK_CONFIDENCE = 0.3;

// --- Implementation ---

class KeywordIntentClassifier implements IntentClassifier {
	readonly classify = async (
		message: string,
		_context?: ClassificationContext,
	): Promise<ClassificationResult> => {
		const trimmed = message.trimStart();

		// Slash command priority
		if (trimmed.startsWith('/')) {
			return { intent: 'command', confidence: SLASH_CONFIDENCE };
		}

		const lower = message.toLowerCase();

		// Keyword matching — first match wins
		for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS)) {
			for (const keyword of keywords) {
				if (lower.includes(keyword.toLowerCase())) {
					return {
						intent: intent as ClassificationResult['intent'],
						confidence: KEYWORD_CONFIDENCE,
					};
				}
			}
		}

		// Default fallback
		return { intent: 'chat', confidence: CHAT_FALLBACK_CONFIDENCE };
	};
}

export { KeywordIntentClassifier };
