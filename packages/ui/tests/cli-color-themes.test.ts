import { describe, expect, it } from 'vitest';
import {
	type ColorTheme,
	type ColorThemeName,
	applyTheme,
	getTheme,
} from '../src/cli/color-themes.js';
import type { CliTheme } from '../src/cli/theme.js';

describe('CLI Color Themes — getTheme', () => {
	it('returns a light theme', () => {
		const theme = getTheme('light');
		expect(theme.name).toBe('light');
		expect(theme.colors).toBeDefined();
	});

	it('returns a dark theme', () => {
		const theme = getTheme('dark');
		expect(theme.name).toBe('dark');
		expect(theme.colors).toBeDefined();
	});

	it('returns an ocean theme', () => {
		const theme = getTheme('ocean');
		expect(theme.name).toBe('ocean');
		expect(theme.colors).toBeDefined();
	});

	it('each theme has all required color keys', () => {
		const requiredKeys: readonly (keyof ColorTheme['colors'])[] = [
			'accent',
			'highlight',
			'text',
			'muted',
			'dim',
			'error',
			'success',
			'warning',
		];

		for (const name of ['light', 'dark', 'ocean'] as const) {
			const theme = getTheme(name);
			for (const key of requiredKeys) {
				expect(theme.colors[key]).toBeDefined();
				expect(typeof theme.colors[key]).toBe('string');
			}
		}
	});

	it('themes have distinct color palettes', () => {
		const light = getTheme('light');
		const dark = getTheme('dark');
		const ocean = getTheme('ocean');

		// At least accent colors should differ across themes
		expect(light.colors.accent).not.toBe(dark.colors.accent);
		expect(dark.colors.accent).not.toBe(ocean.colors.accent);
		expect(light.colors.accent).not.toBe(ocean.colors.accent);
	});

	it('returns undefined for unknown theme name', () => {
		// Cast to bypass type check for testing invalid input
		const theme = getTheme('nonexistent' as ColorThemeName);
		expect(theme).toBeUndefined();
	});
});

describe('CLI Color Themes — applyTheme', () => {
	it('returns a Partial<CliTheme> for light theme', () => {
		const theme = getTheme('light');
		const applied = applyTheme(theme);
		expect(applied).toBeDefined();
	});

	it('returns a Partial<CliTheme> for dark theme', () => {
		const theme = getTheme('dark');
		const applied = applyTheme(theme);
		expect(applied).toBeDefined();
	});

	it('returns a Partial<CliTheme> for ocean theme', () => {
		const theme = getTheme('ocean');
		const applied = applyTheme(theme);
		expect(applied).toBeDefined();
	});

	it('applied theme has accent property that is a function', () => {
		const theme = getTheme('dark');
		const applied = applyTheme(theme);
		expect(typeof applied.accent).toBe('function');
	});

	it('applied theme accent returns a string when called', () => {
		const theme = getTheme('dark');
		const applied = applyTheme(theme);
		const result = applied.accent!('test');
		expect(typeof result).toBe('string');
	});

	it('applied theme has muted, error, success, warning functions', () => {
		const theme = getTheme('ocean');
		const applied = applyTheme(theme);

		expect(typeof applied.muted).toBe('function');
		expect(typeof applied.error).toBe('function');
		expect(typeof applied.success).toBe('function');
		expect(typeof applied.warning).toBe('function');
	});

	it('different themes produce distinct chalk instances', () => {
		const lightApplied = applyTheme(getTheme('light'));
		const darkApplied = applyTheme(getTheme('dark'));

		// The applied themes should have different chalk instances
		// (even if color output is disabled in test env, the instances themselves differ)
		expect(lightApplied.accent).not.toBe(darkApplied.accent);
		expect(lightApplied.highlight).not.toBe(darkApplied.highlight);
	});

	it('applied theme includes text and highlight properties', () => {
		const theme = getTheme('dark');
		const applied = applyTheme(theme);

		expect(typeof applied.text).toBe('function');
		expect(typeof applied.highlight).toBe('function');
	});

	it('applied theme includes dim property', () => {
		const theme = getTheme('light');
		const applied = applyTheme(theme);

		expect(typeof applied.dim).toBe('function');
	});
});
