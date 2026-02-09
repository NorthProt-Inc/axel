import { describe, expect, it } from 'vitest';
import {
	formatSessionForExtraction,
	parseExtractedMemories,
	shouldConsolidate,
	DEFAULT_CONSOLIDATION_CONFIG,
} from '../../src/memory/consolidation.js';

describe('consolidation pure functions', () => {
	describe('shouldConsolidate', () => {
		it('returns true when turnCount >= minTurns', () => {
			expect(shouldConsolidate(3, DEFAULT_CONSOLIDATION_CONFIG)).toBe(true);
			expect(shouldConsolidate(10, DEFAULT_CONSOLIDATION_CONFIG)).toBe(true);
		});

		it('returns false when turnCount < minTurns', () => {
			expect(shouldConsolidate(2, DEFAULT_CONSOLIDATION_CONFIG)).toBe(false);
			expect(shouldConsolidate(0, DEFAULT_CONSOLIDATION_CONFIG)).toBe(false);
		});
	});

	describe('formatSessionForExtraction', () => {
		it('formats messages as role: content pairs', () => {
			const messages = [
				{ role: 'user' as const, content: 'Hello', channelId: 'cli', timestamp: new Date(), tokenCount: 5 },
				{ role: 'assistant' as const, content: 'Hi there!', channelId: 'cli', timestamp: new Date(), tokenCount: 10 },
			];
			const result = formatSessionForExtraction(messages);
			expect(result).toBe('user: Hello\nassistant: Hi there!');
		});

		it('returns empty string for empty messages', () => {
			expect(formatSessionForExtraction([])).toBe('');
		});
	});

	describe('parseExtractedMemories', () => {
		it('parses valid JSON response', () => {
			const response = '{"memories":[{"content":"User likes coffee","type":"preference","importance":0.6}]}';
			const result = parseExtractedMemories(response, 'sess-1', 'cli');

			expect(result).toHaveLength(1);
			expect(result[0]).toEqual({
				content: 'User likes coffee',
				memoryType: 'preference',
				importance: 0.6,
				sourceSession: 'sess-1',
				sourceChannel: 'cli',
			});
		});

		it('handles markdown-fenced JSON', () => {
			const response = '```json\n{"memories":[{"content":"Fact","type":"fact","importance":0.8}]}\n```';
			const result = parseExtractedMemories(response, 'sess-1', 'cli');
			expect(result).toHaveLength(1);
		});

		it('returns empty array for invalid JSON', () => {
			expect(parseExtractedMemories('not json', 'sess-1', 'cli')).toEqual([]);
		});

		it('returns empty array when memories is not an array', () => {
			expect(parseExtractedMemories('{"memories":"invalid"}', 'sess-1', 'cli')).toEqual([]);
		});

		it('skips entries with invalid type', () => {
			const response = '{"memories":[{"content":"x","type":"unknown","importance":0.5}]}';
			expect(parseExtractedMemories(response, 'sess-1', 'cli')).toEqual([]);
		});

		it('clamps importance to [0, 1]', () => {
			const response = '{"memories":[{"content":"x","type":"fact","importance":1.5}]}';
			const result = parseExtractedMemories(response, 'sess-1', 'cli');
			expect(result[0]?.importance).toBe(1);
		});

		it('returns empty for empty memories array', () => {
			expect(parseExtractedMemories('{"memories":[]}', 'sess-1', 'cli')).toEqual([]);
		});
	});
});
