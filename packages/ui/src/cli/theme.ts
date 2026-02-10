import chalk, { type ChalkInstance } from 'chalk';

/**
 * NorthProt CLI color theme built on chalk.
 * Gracefully degrades when color is not supported.
 */
export interface CliTheme {
	/** Cyan accent — user prompts, highlights */
	readonly accent: ChalkInstance;
	/** Magenta — special highlights, warnings */
	readonly highlight: ChalkInstance;
	/** White — Axel's response text */
	readonly text: ChalkInstance;
	/** Gray — system messages, timestamps */
	readonly muted: ChalkInstance;
	/** Dim gray — secondary info */
	readonly dim: ChalkInstance;
	/** Red — errors */
	readonly error: ChalkInstance;
	/** Green — success messages */
	readonly success: ChalkInstance;
	/** Amber — warnings */
	readonly warning: ChalkInstance;
	/** Bold text */
	readonly bold: ChalkInstance;
	/** Cyan bold — section headers */
	readonly header: ChalkInstance;
}

export function createCliTheme(): CliTheme {
	return {
		accent: chalk.hex('#06B6D4'),
		highlight: chalk.hex('#c73b6c'),
		text: chalk.white,
		muted: chalk.hex('#94a3b8'),
		dim: chalk.hex('#64748b'),
		error: chalk.hex('#ef4444'),
		success: chalk.hex('#22c55e'),
		warning: chalk.hex('#f59e0b'),
		bold: chalk.bold,
		header: chalk.hex('#06B6D4').bold,
	};
}

/**
 * Lazy singleton for the CLI theme.
 * Created on first access, frozen for immutability.
 * Use `resetCliTheme()` in tests to clear the cached instance.
 */
let cachedTheme: CliTheme | null = null;

export function getCliTheme(): CliTheme {
	if (!cachedTheme) {
		cachedTheme = Object.freeze(createCliTheme());
	}
	return cachedTheme;
}

/** Reset the cached theme singleton (for test isolation). */
export function resetCliTheme(): void {
	cachedTheme = null;
}
