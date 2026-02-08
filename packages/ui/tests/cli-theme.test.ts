import { describe, expect, it } from 'vitest';
import { createCliTheme } from '../src/cli/theme.js';

describe('CLI Theme', () => {
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
});
