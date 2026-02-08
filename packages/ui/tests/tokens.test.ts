import { describe, expect, it } from 'vitest';
import { colors, spacing, typography } from '../src/tokens/index.js';

describe('Design Tokens', () => {
	describe('colors', () => {
		it('has NorthProt brand navy', () => {
			expect(colors.navy).toBe('#0a1628');
		});

		it('has cyan accent', () => {
			expect(colors.cyan).toBe('#06B6D4');
		});

		it('has magenta highlight', () => {
			expect(colors.magenta).toBe('#c73b6c');
		});

		it('has navy-mid tone', () => {
			expect(colors.navyMid).toBe('#1e4a6d');
		});

		it('has all required semantic colors', () => {
			expect(colors.error).toBeDefined();
			expect(colors.success).toBeDefined();
			expect(colors.warning).toBeDefined();
		});

		it('all values are valid hex colors', () => {
			const hexPattern = /^#[0-9a-fA-F]{6}$/;
			for (const value of Object.values(colors)) {
				expect(value).toMatch(hexPattern);
			}
		});
	});

	describe('typography', () => {
		it('has Inter as sans font', () => {
			expect(typography.fontFamily.sans).toContain('Inter');
		});

		it('has JetBrains Mono as mono font', () => {
			expect(typography.fontFamily.mono).toContain('JetBrains Mono');
		});

		it('has standard font sizes', () => {
			expect(typography.fontSize.base).toBe('1rem');
		});
	});

	describe('spacing', () => {
		it('has zero spacing', () => {
			expect(spacing[0]).toBe('0');
		});

		it('uses rem-based values', () => {
			expect(spacing[4]).toBe('1rem');
		});
	});
});
