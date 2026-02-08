/**
 * NorthProt typography tokens.
 * Sans: Inter — UI text
 * Mono: JetBrains Mono — code blocks, terminal
 */
export const typography = {
	fontFamily: {
		sans: 'Inter, system-ui, -apple-system, sans-serif',
		mono: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
	},
	fontSize: {
		xs: '0.75rem',
		sm: '0.875rem',
		base: '1rem',
		lg: '1.125rem',
		xl: '1.25rem',
		'2xl': '1.5rem',
		'3xl': '1.875rem',
	},
	fontWeight: {
		normal: 400,
		medium: 500,
		semibold: 600,
		bold: 700,
	},
	lineHeight: {
		tight: 1.25,
		normal: 1.5,
		relaxed: 1.75,
	},
} as const;
