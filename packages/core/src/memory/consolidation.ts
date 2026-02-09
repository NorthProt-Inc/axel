import type { MessageRecord } from './types.js';

/** Memory type from consolidation extraction */
export type ExtractedMemoryType = 'fact' | 'preference' | 'insight';

/** A single extracted memory from consolidation */
export interface ExtractedMemory {
	readonly content: string;
	readonly memoryType: ExtractedMemoryType;
	readonly importance: number;
	readonly sourceSession: string;
	readonly sourceChannel: string;
}

/** Consolidation config */
export interface ConsolidationConfig {
	readonly minTurns: number;
	readonly similarityThreshold: number;
}

export const DEFAULT_CONSOLIDATION_CONFIG: ConsolidationConfig = {
	minTurns: 3,
	similarityThreshold: 0.92,
};

/** LLM prompt for extracting memories from conversation */
export const EXTRACTION_PROMPT = `You are a memory extraction system. Given a conversation, extract important facts, preferences, and insights about the user.

Return ONLY valid JSON in this exact format, no markdown fences:
{"memories":[{"content":"Description of the memory","type":"fact|preference|insight","importance":0.5}]}

Rules:
- importance: 0.0-1.0 (facts=0.7-0.9, preferences=0.5-0.7, insights=0.6-0.8)
- Only extract genuinely useful information for future conversations
- If nothing worth remembering, return: {"memories":[]}`;

/** Check if a session has enough turns for consolidation */
export function shouldConsolidate(turnCount: number, config: ConsolidationConfig): boolean {
	return turnCount >= config.minTurns;
}

/** Format session messages for LLM extraction */
export function formatSessionForExtraction(messages: readonly MessageRecord[]): string {
	return messages.map((m) => `${m.role}: ${m.content}`).join('\n');
}

/** Parse LLM response into ExtractedMemory array */
export function parseExtractedMemories(
	llmResponse: string,
	sessionId: string,
	channelId: string,
): readonly ExtractedMemory[] {
	try {
		const cleaned = llmResponse
			.replace(/```json\n?/g, '')
			.replace(/```\n?/g, '')
			.trim();
		const parsed = JSON.parse(cleaned) as Record<string, unknown>;

		if (!Array.isArray(parsed['memories'])) {
			return [];
		}

		const result: ExtractedMemory[] = [];
		for (const m of parsed['memories'] as Record<string, unknown>[]) {
			if (
				typeof m['content'] === 'string' &&
				typeof m['type'] === 'string' &&
				typeof m['importance'] === 'number' &&
				['fact', 'preference', 'insight'].includes(m['type'])
			) {
				result.push({
					content: m['content'],
					memoryType: m['type'] as ExtractedMemoryType,
					importance: Math.max(0, Math.min(1, m['importance'])),
					sourceSession: sessionId,
					sourceChannel: channelId,
				});
			}
		}
		return result;
	} catch {
		return [];
	}
}
