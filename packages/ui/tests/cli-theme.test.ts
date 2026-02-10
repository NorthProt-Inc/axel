import { afterEach, describe, expect, it } from 'vitest';
import { createCliTheme, getCliTheme, resetCliTheme } from '../src/cli/theme.js';

describe('CLI Theme', () => {
	afterEach(() => {
		resetCliTheme();
	});

	it('creates a theme with all required properties', () => {
		const theme = createCliTheme();

		expect(theme.accent).toBeDefined();
		expect(theme.highlight).toBeDefined();
		expect(theme.text).toBeDefined();
		expect(theme.muted).toBeDefined();
		expect(theme.dim).toBeDefined();
		expect(theme.error).toBeDefined();
		expect(theme.success).toBeDefined();
		expect(theme.warning).toBeDefined();
		expect(theme.bold).toBeDefined();
		expect(theme.header).toBeDefined();
	});

	it('theme functions return strings when called with text', () => {
		const theme = createCliTheme();

		expect(typeof theme.accent('test')).toBe('string');
		expect(typeof theme.error('error')).toBe('string');
		expect(typeof theme.muted('muted')).toBe('string');
	});

	describe('getCliTheme (singleton)', () => {
		it('returns the same instance on repeated calls', () => {
			const a = getCliTheme();
			const b = getCliTheme();
			expect(a).toBe(b);
		});

		it('returns a frozen object', () => {
			const theme = getCliTheme();
			expect(Object.isFrozen(theme)).toBe(true);
		});

		it('has all required properties', () => {
			const theme = getCliTheme();
			expect(theme.accent).toBeDefined();
			expect(theme.highlight).toBeDefined();
			expect(theme.text).toBeDefined();
			expect(theme.muted).toBeDefined();
			expect(theme.dim).toBeDefined();
			expect(theme.error).toBeDefined();
			expect(theme.success).toBeDefined();
			expect(theme.warning).toBeDefined();
			expect(theme.bold).toBeDefined();
			expect(theme.header).toBeDefined();
		});
	});

	describe('resetCliTheme', () => {
		it('clears the cached singleton so a new instance is created', () => {
			const a = getCliTheme();
			resetCliTheme();
			const b = getCliTheme();
			expect(a).not.toBe(b);
		});
	});
});
