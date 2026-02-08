import type { Config } from 'tailwindcss';

/**
 * NorthProt design tokens integrated with Tailwind CSS.
 */
const config: Config = {
	content: ['./src/**/*.{html,js,svelte,ts}'],
	theme: {
		extend: {
			colors: {
				navy: {
					DEFAULT: '#0a1628',
					mid: '#1e4a6d',
				},
				cyan: {
					DEFAULT: '#06B6D4',
				},
				magenta: {
					DEFAULT: '#c73b6c',
				},
			},
			fontFamily: {
				sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
				mono: ["'JetBrains Mono'", "'Fira Code'", "'Cascadia Code'", 'monospace'],
			},
		},
	},
	plugins: [],
};

export default config;
