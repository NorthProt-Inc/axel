/**
 * LLM-based entity extraction for M4 Conceptual Memory.
 *
 * Uses Gemini Flash for structured output extraction of entities
 * and relations from conversation turns.
 */

/** Extracted entity from conversation */
export interface ExtractedEntity {
	readonly name: string;
	readonly type: string;
	readonly properties: Readonly<Record<string, unknown>>;
}

/** Extracted relation between entities */
export interface ExtractedRelation {
	readonly source: string;
	readonly target: string;
	readonly type: string;
}

/** Result of entity extraction */
export interface ExtractedEntities {
	readonly entities: readonly ExtractedEntity[];
	readonly relations: readonly ExtractedRelation[];
}

/** LLM client interface for entity extraction (subset of GoogleGenAIClient) */
export interface EntityExtractionLlm {
	getGenerativeModel(config: { model: string }): {
		generateContent(params: Record<string, unknown>): Promise<{
			response: {
				text(): string;
			};
		}>;
	};
}

const EXTRACTION_PROMPT = `You are an entity extraction system. Given a conversation between a user and an assistant, extract:
1. Named entities (people, places, organizations, technologies, concepts)
2. Relations between entities

Return ONLY valid JSON in this exact format, no markdown fences:
{"entities":[{"name":"EntityName","type":"person|place|org|tech|concept","properties":{}}],"relations":[{"source":"Entity1","target":"Entity2","type":"uses|knows|located_in|part_of|related_to"}]}

If no entities found, return: {"entities":[],"relations":[]}`;

const EMPTY_RESULT: ExtractedEntities = { entities: [], relations: [] };

/**
 * Extract entities and relations from conversation using Gemini Flash.
 *
 * Failures return empty results (non-blocking).
 */
class EntityExtractor {
	private readonly client: EntityExtractionLlm;
	private readonly model: string;

	constructor(client: EntityExtractionLlm, model: string) {
		this.client = client;
		this.model = model;
	}

	async extract(userContent: string, assistantContent: string): Promise<ExtractedEntities> {
		try {
			const conversationText = `User: ${userContent}\nAssistant: ${assistantContent}`;
			const generativeModel = this.client.getGenerativeModel({ model: this.model });

			const result = await generativeModel.generateContent({
				contents: [{ role: 'user', parts: [{ text: conversationText }] }],
				systemInstruction: { parts: [{ text: EXTRACTION_PROMPT }] },
			});

			const text = result.response.text();
			return this.parseResponse(text);
		} catch {
			return EMPTY_RESULT;
		}
	}

	private parseResponse(text: string): ExtractedEntities {
		try {
			// Strip markdown fences if present
			const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
			const parsed = JSON.parse(cleaned) as Record<string, unknown>;

			if (!Array.isArray(parsed['entities']) || !Array.isArray(parsed['relations'])) {
				return EMPTY_RESULT;
			}

			const entities: ExtractedEntity[] = [];
			for (const e of parsed['entities'] as Record<string, unknown>[]) {
				if (typeof e['name'] === 'string' && typeof e['type'] === 'string') {
					entities.push({
						name: e['name'],
						type: e['type'],
						properties:
							typeof e['properties'] === 'object' && e['properties'] !== null
								? (e['properties'] as Record<string, unknown>)
								: {},
					});
				}
			}

			const relations: ExtractedRelation[] = [];
			for (const r of parsed['relations'] as Record<string, unknown>[]) {
				if (
					typeof r['source'] === 'string' &&
					typeof r['target'] === 'string' &&
					typeof r['type'] === 'string'
				) {
					relations.push({
						source: r['source'],
						target: r['target'],
						type: r['type'],
					});
				}
			}

			return { entities, relations };
		} catch {
			return EMPTY_RESULT;
		}
	}
}

export { EntityExtractor };
