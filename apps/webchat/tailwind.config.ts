import { colors, typography } from '@axel/ui/tokens';
import type { Config } from 'tailwindcss';
import { buildTailwindColors, buildTailwindFontFamily } from './src/lib/utils/tailwind-tokens.js';

/**
 * Tailwind CSS config — driven by @axel/ui design tokens.
 * No hardcoded colors or fonts; single source of truth in packages/ui/src/tokens/.
 */
const config: Config = {
	content: ['./src/**/*.{html,js,svelte,ts}'],
	theme: {
		extend: {
			colors: buildTailwindColors(colors),
			fontFamily: buildTailwindFontFamily(typography),
		},
	},
	plugins: [],
};

export default config;
