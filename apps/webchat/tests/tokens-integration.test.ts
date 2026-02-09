import { colors, typography } from '@axel/ui/tokens';
import { describe, expect, it } from 'vitest';
import { buildTailwindColors, buildTailwindFontFamily } from '../src/lib/utils/tailwind-tokens.js';

describe('Design Tokens → Tailwind Integration', () => {
	describe('buildTailwindColors', () => {
		it('maps navy to Tailwind color object', () => {
			const tw = buildTailwindColors(colors);
			expect(tw.navy).toBeDefined();
			expect(tw.navy.DEFAULT).toBe(colors.navy);
			expect(tw.navy.mid).toBe(colors.navyMid);
		});

		it('maps cyan as single default', () => {
			const tw = buildTailwindColors(colors);
			expect(tw.cyan.DEFAULT).toBe(colors.cyan);
		});

		it('maps magenta as single default', () => {
			const tw = buildTailwindColors(colors);
			expect(tw.magenta.DEFAULT).toBe(colors.magenta);
		});

		it('includes semantic colors', () => {
			const tw = buildTailwindColors(colors);
			expect(tw.error.DEFAULT).toBe(colors.error);
			expect(tw.success.DEFAULT).toBe(colors.success);
			expect(tw.warning.DEFAULT).toBe(colors.warning);
		});

		it('includes gray shades', () => {
			const tw = buildTailwindColors(colors);
			expect(tw.axel_gray.DEFAULT).toBe(colors.gray);
			expect(tw.axel_gray.dim).toBe(colors.grayDim);
		});
	});

	describe('buildTailwindFontFamily', () => {
		it('splits sans font string into array', () => {
			const tw = buildTailwindFontFamily(typography);
			expect(tw.sans).toBeInstanceOf(Array);
			expect(tw.sans.length).toBeGreaterThan(1);
			expect(tw.sans[0]).toContain('Inter');
		});

		it('splits mono font string into array', () => {
			const tw = buildTailwindFontFamily(typography);
			expect(tw.mono).toBeInstanceOf(Array);
			expect(tw.mono[0]).toContain('JetBrains Mono');
		});
	});
});
