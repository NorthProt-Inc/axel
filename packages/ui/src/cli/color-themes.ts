import chalk from 'chalk';
import type { CliTheme } from './theme.js';

/**
 * Color theme presets for CLI.
 * Pure functions — returns theme data and chalk instances,
 * no global state mutation.
 */

export type ColorThemeName = 'light' | 'dark' | 'ocean';

export interface ColorTheme {
	readonly name: ColorThemeName;
	readonly colors: {
		readonly accent: string;
		readonly highlight: string;
		readonly text: string;
		readonly muted: string;
		readonly dim: string;
		readonly error: string;
		readonly success: string;
		readonly warning: string;
	};
}

const THEMES: Readonly<Record<ColorThemeName, ColorTheme>> = {
	light: {
		name: 'light',
		colors: {
			accent: '#7C3AED',
			highlight: '#DB2777',
			text: '#1E293B',
			muted: '#64748B',
			dim: '#94A3B8',
			error: '#DC2626',
			success: '#16A34A',
			warning: '#D97706',
		},
	},
	dark: {
		name: 'dark',
		colors: {
			accent: '#06B6D4',
			highlight: '#F472B6',
			text: '#F8FAFC',
			muted: '#94A3B8',
			dim: '#64748B',
			error: '#EF4444',
			success: '#22C55E',
			warning: '#F59E0B',
		},
	},
	ocean: {
		name: 'ocean',
		colors: {
			accent: '#14B8A6',
			highlight: '#38BDF8',
			text: '#E2E8F0',
			muted: '#7DD3FC',
			dim: '#0EA5E9',
			error: '#FB7185',
			success: '#34D399',
			warning: '#FBBF24',
		},
	},
};

/**
 * Get a built-in color theme by name.
 * Returns undefined for unknown theme names.
 */
export function getTheme(name: ColorThemeName): ColorTheme {
	return THEMES[name];
}

/**
 * Apply a ColorTheme to produce a Partial<CliTheme> with chalk instances.
 * Use with spread to override the default CliTheme.
 */
export function applyTheme(theme: ColorTheme): Partial<CliTheme> {
	return {
		accent: chalk.hex(theme.colors.accent),
		highlight: chalk.hex(theme.colors.highlight),
		text: chalk.hex(theme.colors.text),
		muted: chalk.hex(theme.colors.muted),
		dim: chalk.hex(theme.colors.dim),
		error: chalk.hex(theme.colors.error),
		success: chalk.hex(theme.colors.success),
		warning: chalk.hex(theme.colors.warning),
	};
}
