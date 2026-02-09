import { describe, expect, it } from 'vitest';
import {
	formatSessionList,
	formatSessionEntry,
	type SessionListEntry,
} from '../src/cli/session-list.js';

const sampleSessions: readonly SessionListEntry[] = [
	{
		id: 'abc12345-6789-0000-0000-000000000001',
		title: 'TypeScript Discussion',
		createdAt: new Date('2026-02-09T09:00:00Z'),
		messageCount: 12,
		active: true,
	},
	{
		id: 'def12345-6789-0000-0000-000000000002',
		title: 'Python Help',
		createdAt: new Date('2026-02-08T15:00:00Z'),
		messageCount: 5,
		active: false,
	},
	{
		id: 'ghi12345-6789-0000-0000-000000000003',
		title: 'New Chat',
		createdAt: new Date('2026-02-07T10:00:00Z'),
		messageCount: 0,
		active: false,
	},
];

describe('CLI Session List — Entry Formatting', () => {
	it('formats active session with indicator', () => {
		const result = formatSessionEntry(sampleSessions[0]!);
		expect(result).toContain('▶');
		expect(result).toContain('TypeScript Discussion');
	});

	it('formats inactive session without indicator', () => {
		const result = formatSessionEntry(sampleSessions[1]!);
		expect(result).not.toContain('▶');
		expect(result).toContain('Python Help');
	});

	it('includes truncated session ID', () => {
		const result = formatSessionEntry(sampleSessions[0]!);
		expect(result).toContain('abc12345');
	});

	it('includes message count', () => {
		const result = formatSessionEntry(sampleSessions[0]!);
		expect(result).toContain('12');
	});
});

describe('CLI Session List — Full List', () => {
	it('formats all sessions', () => {
		const result = formatSessionList(sampleSessions);
		expect(result).toContain('TypeScript Discussion');
		expect(result).toContain('Python Help');
		expect(result).toContain('New Chat');
	});

	it('shows header', () => {
		const result = formatSessionList(sampleSessions);
		expect(result).toContain('Sessions');
	});

	it('returns message for empty list', () => {
		const result = formatSessionList([]);
		expect(result).toContain('No sessions');
	});
});
