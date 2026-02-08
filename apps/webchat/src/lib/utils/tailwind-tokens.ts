/**
 * Map @axel/ui design tokens to Tailwind CSS config format.
 * Single source of truth: packages/ui/src/tokens/
 */

interface TokenColors {
	readonly navy: string;
	readonly navyMid: string;
	readonly cyan: string;
	readonly magenta: string;
	readonly white: string;
	readonly gray: string;
	readonly grayDim: string;
	readonly error: string;
	readonly success: string;
	readonly warning: string;
}

interface TokenTypography {
	readonly fontFamily: {
		readonly sans: string;
		readonly mono: string;
	};
}

interface TailwindColorGroup {
	readonly DEFAULT: string;
	readonly [key: string]: string;
}

export function buildTailwindColors(tokens: TokenColors): Record<string, TailwindColorGroup> {
	return {
		navy: { DEFAULT: tokens.navy, mid: tokens.navyMid },
		cyan: { DEFAULT: tokens.cyan },
		magenta: { DEFAULT: tokens.magenta },
		error: { DEFAULT: tokens.error },
		success: { DEFAULT: tokens.success },
		warning: { DEFAULT: tokens.warning },
		axel_gray: { DEFAULT: tokens.gray, dim: tokens.grayDim },
	};
}

export function buildTailwindFontFamily(tokens: TokenTypography): Record<string, string[]> {
	return {
		sans: tokens.fontFamily.sans.split(',').map((s) => s.trim()),
		mono: tokens.fontFamily.mono.split(',').map((s) => s.trim()),
	};
}
