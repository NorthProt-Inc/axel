/**
 * CLI color theme definitions.
 * Multiple themes with NorthProt as the default.
 * Each theme provides a complete set of semantic colors.
 */

export interface ThemeColors {
	readonly accent: string;
	readonly highlight: string;
	readonly text: string;
	readonly muted: string;
	readonly dim: string;
	readonly error: string;
	readonly success: string;
	readonly warning: string;
	readonly background: string;
}

export const THEME_NAMES = ['northprot', 'light', 'minimal'] as const;
export type ThemeName = (typeof THEME_NAMES)[number];

const THEMES: Record<ThemeName, ThemeColors> = {
	northprot: {
		accent: '#06B6D4',
		highlight: '#c73b6c',
		text: '#ffffff',
		muted: '#94a3b8',
		dim: '#64748b',
		error: '#ef4444',
		success: '#22c55e',
		warning: '#f59e0b',
		background: '#0a1628',
	},
	light: {
		accent: '#0891b2',
		highlight: '#be185d',
		text: '#1e293b',
		muted: '#64748b',
		dim: '#94a3b8',
		error: '#dc2626',
		success: '#16a34a',
		warning: '#d97706',
		background: '#f8fafc',
	},
	minimal: {
		accent: '#6366f1',
		highlight: '#a855f7',
		text: '#e2e8f0',
		muted: '#94a3b8',
		dim: '#475569',
		error: '#f87171',
		success: '#4ade80',
		warning: '#fbbf24',
		background: '#1e1e2e',
	},
};

export function getThemeColors(name: ThemeName): ThemeColors {
	return THEMES[name];
}

export function listThemes(): readonly ThemeName[] {
	return [...THEME_NAMES];
}
