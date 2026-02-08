import { describe, expect, it } from 'vitest';
import {
	createAuthMessage,
	parseAuthResponse,
	isAuthOk,
	type WsAuthMessage,
} from '../src/lib/stores/ws-auth.js';

describe('WebSocket Authentication — ADR-019 first-message auth', () => {
	describe('createAuthMessage', () => {
		it('creates auth message with token', () => {
			const msg = createAuthMessage('my-secret-token');
			expect(msg).toEqual({ type: 'auth', token: 'my-secret-token' });
		});

		it('returns correct JSON string', () => {
			const msg = createAuthMessage('tok123');
			const json = JSON.stringify(msg);
			expect(json).toContain('"type":"auth"');
			expect(json).toContain('"token":"tok123"');
		});
	});

	describe('parseAuthResponse', () => {
		it('parses auth_ok response', () => {
			const result = parseAuthResponse('{"type":"auth_ok"}');
			expect(result).toEqual({ type: 'auth_ok' });
		});

		it('parses auth_error response', () => {
			const result = parseAuthResponse('{"type":"auth_error","reason":"Invalid token"}');
			expect(result).toEqual({ type: 'auth_error', reason: 'Invalid token' });
		});

		it('returns null for invalid JSON', () => {
			const result = parseAuthResponse('not json');
			expect(result).toBeNull();
		});

		it('returns null for unknown type', () => {
			const result = parseAuthResponse('{"type":"something"}');
			expect(result).toBeNull();
		});

		it('returns null for empty string', () => {
			const result = parseAuthResponse('');
			expect(result).toBeNull();
		});
	});

	describe('isAuthOk', () => {
		it('returns true for auth_ok', () => {
			expect(isAuthOk({ type: 'auth_ok' })).toBe(true);
		});

		it('returns false for auth_error', () => {
			expect(isAuthOk({ type: 'auth_error', reason: 'bad' })).toBe(false);
		});
	});
});
