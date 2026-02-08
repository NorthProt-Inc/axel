import { describe, expect, it } from 'vitest';
import { classifyError } from '../src/classify-error.js';

describe('classifyError (ADR-011)', () => {
	it('classifies generic Error as 500 internal_error', () => {
		const result = classifyError(new Error('something broke'));
		expect(result.status).toBe(500);
		expect(result.code).toBe('internal_error');
	});

	it('classifies TypeError as 400 bad_request', () => {
		const result = classifyError(new TypeError('invalid input'));
		expect(result.status).toBe(400);
		expect(result.code).toBe('bad_request');
	});

	it('classifies SyntaxError as 400 bad_request', () => {
		const result = classifyError(new SyntaxError('unexpected token'));
		expect(result.status).toBe(400);
		expect(result.code).toBe('bad_request');
	});

	it('classifies non-Error values as 500 internal_error', () => {
		const result = classifyError('string error');
		expect(result.status).toBe(500);
		expect(result.code).toBe('internal_error');
	});

	it('returns error message in development mode', () => {
		const result = classifyError(new Error('test detail'), 'development');
		expect(result.message).toBe('test detail');
	});

	it('redacts error message in production mode', () => {
		const result = classifyError(new Error('secret internal state'), 'production');
		expect(result.message).toBe('Internal Server Error');
		expect(result.message).not.toContain('secret');
	});
});
