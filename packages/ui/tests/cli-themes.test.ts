import { describe, expect, it } from 'vitest';
import {
	type ThemeName,
	getThemeColors,
	listThemes,
	THEME_NAMES,
} from '../src/cli/themes.js';

describe('CLI Color Themes', () => {
	it('provides northprot theme (default)', () => {
		const colors = getThemeColors('northprot');
		expect(colors.accent).toBe('#06B6D4');
		expect(colors.highlight).toBe('#c73b6c');
		expect(colors.background).toBe('#0a1628');
	});

	it('provides light theme', () => {
		const colors = getThemeColors('light');
		expect(colors.accent).toBeDefined();
		expect(colors.background).toBeDefined();
		// Light theme should have light background
		expect(colors.background).not.toBe('#0a1628');
	});

	it('provides minimal theme', () => {
		const colors = getThemeColors('minimal');
		expect(colors.accent).toBeDefined();
		expect(colors.background).toBeDefined();
	});

	it('lists all available themes', () => {
		const themes = listThemes();
		expect(themes).toContain('northprot');
		expect(themes).toContain('light');
		expect(themes).toContain('minimal');
		expect(themes.length).toBe(THEME_NAMES.length);
	});

	it('theme colors have required fields', () => {
		for (const name of THEME_NAMES) {
			const colors = getThemeColors(name);
			expect(colors).toHaveProperty('accent');
			expect(colors).toHaveProperty('highlight');
			expect(colors).toHaveProperty('text');
			expect(colors).toHaveProperty('muted');
			expect(colors).toHaveProperty('dim');
			expect(colors).toHaveProperty('error');
			expect(colors).toHaveProperty('success');
			expect(colors).toHaveProperty('warning');
			expect(colors).toHaveProperty('background');
		}
	});

	it('all color values are valid hex', () => {
		for (const name of THEME_NAMES) {
			const colors = getThemeColors(name);
			for (const [key, value] of Object.entries(colors)) {
				expect(value, `${name}.${key}`).toMatch(/^#[0-9a-fA-F]{6}$/);
			}
		}
	});
});
