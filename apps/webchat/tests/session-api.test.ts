import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
	parseSessionResponse,
	parseSessionEndResponse,
	buildSessionUrl,
	buildSessionEndUrl,
	type SessionInfo,
	type SessionEndResult,
} from '../src/lib/stores/session-api.js';

describe('WebChat Session API — URL builders', () => {
	it('builds session URL from base', () => {
		const url = buildSessionUrl('http://localhost:8000');
		expect(url).toBe('http://localhost:8000/api/v1/session');
	});

	it('handles trailing slash in base URL', () => {
		const url = buildSessionUrl('http://localhost:8000/');
		expect(url).toBe('http://localhost:8000/api/v1/session');
	});

	it('builds session end URL from base', () => {
		const url = buildSessionEndUrl('http://localhost:8000');
		expect(url).toBe('http://localhost:8000/api/v1/session/end');
	});
});

describe('WebChat Session API — Response parsers', () => {
	describe('parseSessionResponse', () => {
		it('parses active session', () => {
			const body = {
				active: true,
				session: {
					sessionId: 'abc-123',
					userId: 'mark',
					channelId: 'webchat',
					startedAt: '2026-02-08T10:00:00Z',
				},
				requestId: 'req-1',
			};
			const result = parseSessionResponse(JSON.stringify(body));
			expect(result).not.toBeNull();
			expect(result!.active).toBe(true);
			expect(result!.session?.sessionId).toBe('abc-123');
		});

		it('parses no active session', () => {
			const body = { active: false, session: null, requestId: 'req-2' };
			const result = parseSessionResponse(JSON.stringify(body));
			expect(result).not.toBeNull();
			expect(result!.active).toBe(false);
			expect(result!.session).toBeNull();
		});

		it('returns null for invalid JSON', () => {
			expect(parseSessionResponse('not json')).toBeNull();
		});

		it('returns null for missing active field', () => {
			expect(parseSessionResponse('{"session":null}')).toBeNull();
		});
	});

	describe('parseSessionEndResponse', () => {
		it('parses successful session end', () => {
			const body = {
				summary: 'Session ended successfully',
				messageCount: 12,
				requestId: 'req-3',
			};
			const result = parseSessionEndResponse(JSON.stringify(body));
			expect(result).not.toBeNull();
			expect(result!.summary).toBe('Session ended successfully');
		});

		it('returns null for invalid JSON', () => {
			expect(parseSessionEndResponse('bad')).toBeNull();
		});
	});
});

describe('WebChat Session API — Session list management', () => {
	it('imports addSessionToList function', async () => {
		const { addSessionToList } = await import('../src/lib/stores/session-api.js');
		expect(typeof addSessionToList).toBe('function');
	});

	it('adds new session to empty list', async () => {
		const { addSessionToList } = await import('../src/lib/stores/session-api.js');
		const session: SessionInfo = {
			active: true,
			session: {
				sessionId: 'new-1',
				userId: 'mark',
				channelId: 'webchat',
				startedAt: '2026-02-08T10:00:00Z',
			},
		};
		const result = addSessionToList([], session);
		expect(result).toHaveLength(1);
		expect(result[0]!.id).toBe('new-1');
	});

	it('does not add duplicate session', async () => {
		const { addSessionToList } = await import('../src/lib/stores/session-api.js');
		const session: SessionInfo = {
			active: true,
			session: {
				sessionId: 'dup-1',
				userId: 'mark',
				channelId: 'webchat',
				startedAt: '2026-02-08T10:00:00Z',
			},
		};
		const existing = [{ id: 'dup-1', title: 'Existing', createdAt: new Date() }];
		const result = addSessionToList(existing, session);
		expect(result).toHaveLength(1);
	});

	it('returns list unchanged when session has no data', async () => {
		const { addSessionToList } = await import('../src/lib/stores/session-api.js');
		const session: SessionInfo = { active: false, session: null };
		const existing = [{ id: 'keep-1', title: 'Keep', createdAt: new Date() }];
		const result = addSessionToList(existing, session);
		expect(result).toHaveLength(1);
		expect(result[0]!.id).toBe('keep-1');
	});
});
