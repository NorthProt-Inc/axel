import { describe, expect, it } from 'vitest';
import { splitMessage } from '../../src/utils/split-message.js';

describe('splitMessage', () => {
	it('returns single-element array for short content', () => {
		const result = splitMessage('Hello', 100);
		expect(result).toEqual(['Hello']);
	});

	it('splits content exceeding maxLength into chunks', () => {
		const content = 'A'.repeat(250);
		const result = splitMessage(content, 100);
		expect(result).toHaveLength(3);
		expect(result[0]).toHaveLength(100);
		expect(result[1]).toHaveLength(100);
		expect(result[2]).toHaveLength(50);
	});

	it('handles content exactly at maxLength', () => {
		const content = 'A'.repeat(100);
		const result = splitMessage(content, 100);
		expect(result).toEqual([content]);
	});

	it('handles empty content', () => {
		const result = splitMessage('', 100);
		expect(result).toEqual(['']);
	});

	it('preserves all content across chunks', () => {
		const content = 'ABCDEFGHIJ';
		const result = splitMessage(content, 3);
		expect(result.join('')).toBe(content);
	});
});
