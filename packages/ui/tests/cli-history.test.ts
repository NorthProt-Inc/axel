import { describe, expect, it } from 'vitest';
import { type HistoryEntry, browseHistory, searchHistory } from '../src/cli/history-browser.js';

const makeEntry = (overrides: Partial<HistoryEntry> = {}): HistoryEntry => ({
	sessionId: 'session-abc12345',
	timestamp: new Date('2025-06-15T10:30:00Z'),
	role: 'user',
	preview: 'Hello, Axel!',
	...overrides,
});

describe('CLI History Browser — browseHistory', () => {
	it('returns empty string for empty entries', () => {
		const result = browseHistory([]);
		expect(result).toBe('');
	});

	it('formats a single entry with session ID, timestamp, role, and preview', () => {
		const entries: readonly HistoryEntry[] = [makeEntry()];
		const result = browseHistory(entries);

		expect(result).toContain('session-ab');
		expect(result).toContain('10:30');
		expect(result).toContain('user');
		expect(result).toContain('Hello, Axel!');
	});

	it('formats multiple entries with each on separate lines', () => {
		const entries: readonly HistoryEntry[] = [
			makeEntry({ preview: 'First message' }),
			makeEntry({
				sessionId: 'session-xyz99999',
				timestamp: new Date('2025-06-15T11:00:00Z'),
				role: 'assistant',
				preview: 'Second message',
			}),
		];
		const result = browseHistory(entries);

		expect(result).toContain('First message');
		expect(result).toContain('Second message');
		expect(result).toContain('session-ab');
		expect(result).toContain('session-xy');
	});

	it('truncates long preview text', () => {
		const longPreview = 'A'.repeat(200);
		const entries: readonly HistoryEntry[] = [makeEntry({ preview: longPreview })];
		const result = browseHistory(entries);

		// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape sequence stripping
		const stripped = result.replace(/\x1b\[[0-9;]*m/g, '');
		// Should not contain the full 200-char string
		expect(stripped).not.toContain(longPreview);
		// Should end with ellipsis marker
		expect(stripped).toContain('...');
	});

	it('shows role for both user and assistant entries', () => {
		const entries: readonly HistoryEntry[] = [
			makeEntry({ role: 'user', preview: 'User said' }),
			makeEntry({ role: 'assistant', preview: 'Axel replied' }),
		];
		const result = browseHistory(entries);

		expect(result).toContain('user');
		expect(result).toContain('assistant');
	});

	it('includes a header in the output', () => {
		const entries: readonly HistoryEntry[] = [makeEntry()];
		const result = browseHistory(entries);

		expect(result).toContain('History');
	});
});

describe('CLI History Browser — searchHistory', () => {
	const entries: readonly HistoryEntry[] = [
		makeEntry({ preview: 'Turn on the living room lights' }),
		makeEntry({ preview: 'What is the weather today?' }),
		makeEntry({ preview: 'Set temperature to 22 degrees' }),
		makeEntry({ preview: 'Turn off the lights in bedroom' }),
	];

	it('returns matching entries for a query', () => {
		const result = searchHistory(entries, 'lights');
		expect(result).toHaveLength(2);
		expect(result[0]?.preview).toContain('lights');
		expect(result[1]?.preview).toContain('lights');
	});

	it('returns empty array when no matches', () => {
		const result = searchHistory(entries, 'zzzzz');
		expect(result).toHaveLength(0);
	});

	it('performs case-insensitive search', () => {
		const result = searchHistory(entries, 'WEATHER');
		expect(result).toHaveLength(1);
		expect(result[0]?.preview).toContain('weather');
	});

	it('returns all entries when query is empty', () => {
		const result = searchHistory(entries, '');
		expect(result).toHaveLength(4);
	});

	it('searches within session IDs as well', () => {
		const mixed: readonly HistoryEntry[] = [
			makeEntry({ sessionId: 'session-unique123', preview: 'Unrelated' }),
			makeEntry({ sessionId: 'session-other456', preview: 'Also unrelated' }),
		];
		const result = searchHistory(mixed, 'unique123');
		expect(result).toHaveLength(1);
		expect(result[0]?.sessionId).toBe('session-unique123');
	});

	it('does not mutate input array', () => {
		const mutable: HistoryEntry[] = [
			makeEntry({ preview: 'Alpha' }),
			makeEntry({ preview: 'Beta' }),
		];
		const copy = [...mutable];
		searchHistory(mutable, 'Alpha');
		expect(mutable).toEqual(copy);
	});
});
