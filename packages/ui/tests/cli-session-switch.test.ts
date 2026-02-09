import { describe, expect, it } from 'vitest';
import {
	type SessionInfo,
	type SessionSwitchResult,
	listActiveSessions,
	switchSession,
} from '../src/cli/session-switcher.js';

const makeSession = (
	overrides: Partial<SessionInfo> = {},
): SessionInfo => ({
	id: 'session-abc12345',
	startedAt: new Date('2025-06-15T10:00:00Z'),
	messageCount: 5,
	status: 'active',
	...overrides,
});

describe('CLI Session Switcher — switchSession', () => {
	const sessions: readonly SessionInfo[] = [
		makeSession({ id: 'session-aaa' }),
		makeSession({ id: 'session-bbb', messageCount: 3 }),
		makeSession({ id: 'session-ccc', messageCount: 10 }),
	];

	it('returns success when switching to a different existing session', () => {
		const result = switchSession('session-aaa', 'session-bbb', sessions);
		expect(result.status).toBe('success');
		expect(result.previousSessionId).toBe('session-aaa');
		expect(result.newSessionId).toBe('session-bbb');
	});

	it('returns alreadyActive when target equals current', () => {
		const result = switchSession('session-aaa', 'session-aaa', sessions);
		expect(result.status).toBe('alreadyActive');
		expect(result.previousSessionId).toBe('session-aaa');
		expect(result.newSessionId).toBe('session-aaa');
	});

	it('returns notFound when target session does not exist', () => {
		const result = switchSession('session-aaa', 'session-zzz', sessions);
		expect(result.status).toBe('notFound');
		expect(result.previousSessionId).toBe('session-aaa');
		expect(result.newSessionId).toBe('session-zzz');
	});

	it('returns notFound for empty session list', () => {
		const result = switchSession('session-aaa', 'session-bbb', []);
		expect(result.status).toBe('notFound');
	});

	it('result has message property describing the outcome', () => {
		const success = switchSession('session-aaa', 'session-bbb', sessions);
		expect(typeof success.message).toBe('string');
		expect(success.message.length).toBeGreaterThan(0);

		const notFound = switchSession('session-aaa', 'session-zzz', sessions);
		expect(typeof notFound.message).toBe('string');
		expect(notFound.message.length).toBeGreaterThan(0);

		const alreadyActive = switchSession('session-aaa', 'session-aaa', sessions);
		expect(typeof alreadyActive.message).toBe('string');
		expect(alreadyActive.message.length).toBeGreaterThan(0);
	});

	it('does not mutate sessions array', () => {
		const mutable: SessionInfo[] = [
			makeSession({ id: 'session-aaa' }),
			makeSession({ id: 'session-bbb' }),
		];
		const copy = [...mutable];
		switchSession('session-aaa', 'session-bbb', mutable);
		expect(mutable).toEqual(copy);
	});
});

describe('CLI Session Switcher — listActiveSessions', () => {
	it('returns empty string for empty session list', () => {
		const result = listActiveSessions([]);
		expect(result).toBe('');
	});

	it('formats a single session with ID, message count, and status', () => {
		const sessions: readonly SessionInfo[] = [
			makeSession({ id: 'session-abc12345', messageCount: 7 }),
		];
		const result = listActiveSessions(sessions);

		expect(result).toContain('session-ab');
		expect(result).toContain('7');
		expect(result).toContain('active');
	});

	it('formats multiple sessions', () => {
		const sessions: readonly SessionInfo[] = [
			makeSession({ id: 'session-aaa11111', messageCount: 3, status: 'active' }),
			makeSession({ id: 'session-bbb22222', messageCount: 12, status: 'idle' }),
		];
		const result = listActiveSessions(sessions);

		expect(result).toContain('session-aa');
		expect(result).toContain('session-bb');
		expect(result).toContain('3');
		expect(result).toContain('12');
	});

	it('includes a header in the output', () => {
		const sessions: readonly SessionInfo[] = [makeSession()];
		const result = listActiveSessions(sessions);

		expect(result).toContain('Sessions');
	});

	it('shows timestamp for each session', () => {
		const sessions: readonly SessionInfo[] = [
			makeSession({ startedAt: new Date('2025-06-15T14:30:00Z') }),
		];
		const result = listActiveSessions(sessions);

		// Should contain the time portion
		expect(result).toContain('14:30');
	});
});
