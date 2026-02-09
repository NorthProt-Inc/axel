import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	type EntityExtractionLlm,
	EntityExtractor,
	type ExtractedEntities,
} from '../../src/memory/entity-extractor.js';

// ─── Test Doubles ───

function createMockLlm(responseText: string): EntityExtractionLlm {
	return {
		getGenerativeModel: vi.fn().mockReturnValue({
			generateContent: vi.fn().mockResolvedValue({
				response: { text: () => responseText },
			}),
		}),
	};
}

function createErrorLlm(error: Error): EntityExtractionLlm {
	return {
		getGenerativeModel: vi.fn().mockReturnValue({
			generateContent: vi.fn().mockRejectedValue(error),
		}),
	};
}

const EMPTY_RESULT: ExtractedEntities = { entities: [], relations: [] };

describe('EntityExtractor', () => {
	const MODEL = 'gemini-3-flash-preview';

	describe('extract', () => {
		it('should extract entities and relations from valid JSON response', async () => {
			const json = JSON.stringify({
				entities: [
					{ name: 'TypeScript', type: 'tech', properties: { version: '5.7' } },
					{ name: 'Axel', type: 'concept', properties: {} },
				],
				relations: [{ source: 'Axel', target: 'TypeScript', type: 'uses' }],
			});
			const llm = createMockLlm(json);
			const extractor = new EntityExtractor(llm, MODEL);

			const result = await extractor.extract('Tell me about Axel', 'Axel uses TypeScript 5.7');

			expect(result.entities).toHaveLength(2);
			expect(result.entities[0]).toEqual({
				name: 'TypeScript',
				type: 'tech',
				properties: { version: '5.7' },
			});
			expect(result.entities[1]).toEqual({
				name: 'Axel',
				type: 'concept',
				properties: {},
			});
			expect(result.relations).toHaveLength(1);
			expect(result.relations[0]).toEqual({
				source: 'Axel',
				target: 'TypeScript',
				type: 'uses',
			});
		});

		it('should strip markdown fences and parse JSON', async () => {
			const json =
				'```json\n{"entities":[{"name":"Redis","type":"tech","properties":{}}],"relations":[]}\n```';
			const llm = createMockLlm(json);
			const extractor = new EntityExtractor(llm, MODEL);

			const result = await extractor.extract('What is Redis?', 'Redis is a cache');

			expect(result.entities).toHaveLength(1);
			expect(result.entities[0]!.name).toBe('Redis');
			expect(result.relations).toHaveLength(0);
		});

		it('should return empty result for invalid JSON', async () => {
			const llm = createMockLlm('this is not json at all');
			const extractor = new EntityExtractor(llm, MODEL);

			const result = await extractor.extract('Hello', 'Hi there');

			expect(result).toEqual(EMPTY_RESULT);
		});

		it('should return empty result when entities is not an array', async () => {
			const json = JSON.stringify({ entities: 'not-array', relations: [] });
			const llm = createMockLlm(json);
			const extractor = new EntityExtractor(llm, MODEL);

			const result = await extractor.extract('Hello', 'Hi');

			expect(result).toEqual(EMPTY_RESULT);
		});

		it('should return empty result when relations is not an array', async () => {
			const json = JSON.stringify({ entities: [], relations: 'not-array' });
			const llm = createMockLlm(json);
			const extractor = new EntityExtractor(llm, MODEL);

			const result = await extractor.extract('Hello', 'Hi');

			expect(result).toEqual(EMPTY_RESULT);
		});

		it('should return empty result on API error', async () => {
			const llm = createErrorLlm(new Error('API rate limit'));
			const extractor = new EntityExtractor(llm, MODEL);

			const result = await extractor.extract('Hello', 'Hi');

			expect(result).toEqual(EMPTY_RESULT);
		});

		it('should return empty result for empty response text', async () => {
			const llm = createMockLlm('');
			const extractor = new EntityExtractor(llm, MODEL);

			const result = await extractor.extract('Hello', 'Hi');

			expect(result).toEqual(EMPTY_RESULT);
		});

		it('should skip entities with missing name or type', async () => {
			const json = JSON.stringify({
				entities: [
					{ name: 'Valid', type: 'tech', properties: {} },
					{ name: 'NoType', properties: {} },
					{ type: 'tech', properties: {} },
					{ name: 123, type: 'tech', properties: {} },
				],
				relations: [],
			});
			const llm = createMockLlm(json);
			const extractor = new EntityExtractor(llm, MODEL);

			const result = await extractor.extract('test', 'test');

			expect(result.entities).toHaveLength(1);
			expect(result.entities[0]!.name).toBe('Valid');
		});

		it('should skip relations with missing source, target, or type', async () => {
			const json = JSON.stringify({
				entities: [],
				relations: [
					{ source: 'A', target: 'B', type: 'uses' },
					{ source: 'A', target: 'B' },
					{ source: 'A', type: 'uses' },
					{ target: 'B', type: 'uses' },
				],
			});
			const llm = createMockLlm(json);
			const extractor = new EntityExtractor(llm, MODEL);

			const result = await extractor.extract('test', 'test');

			expect(result.relations).toHaveLength(1);
			expect(result.relations[0]!.source).toBe('A');
		});

		it('should default properties to empty object when missing', async () => {
			const json = JSON.stringify({
				entities: [{ name: 'NoProps', type: 'concept' }],
				relations: [],
			});
			const llm = createMockLlm(json);
			const extractor = new EntityExtractor(llm, MODEL);

			const result = await extractor.extract('test', 'test');

			expect(result.entities[0]!.properties).toEqual({});
		});

		it('should pass correct model and conversation format to LLM', async () => {
			const json = JSON.stringify({ entities: [], relations: [] });
			const llm = createMockLlm(json);
			const extractor = new EntityExtractor(llm, MODEL);

			await extractor.extract('user msg', 'assistant msg');

			expect(llm.getGenerativeModel).toHaveBeenCalledWith({ model: MODEL });
			const generateContent = llm.getGenerativeModel({ model: MODEL }).generateContent;
			expect(generateContent).toHaveBeenCalledWith(
				expect.objectContaining({
					contents: [
						{
							role: 'user',
							parts: [{ text: 'User: user msg\nAssistant: assistant msg' }],
						},
					],
				}),
			);
		});
	});
});
