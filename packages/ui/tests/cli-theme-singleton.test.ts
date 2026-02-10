import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * PERF-M8: Verify that all CLI source files use getCliTheme() singleton
 * instead of createCliTheme() which creates a new object on every call.
 *
 * Only theme.ts itself may call createCliTheme() (as the factory).
 * All other consumers must use getCliTheme().
 */

const CLI_SRC_DIR = resolve(import.meta.dirname, '../src/cli');

const CLI_CONSUMER_FILES = [
	'output.ts',
	'renderer.ts',
	'format.ts',
	'banner.ts',
	'spinner.ts',
	'history.ts',
	'history-browser.ts',
	'session-list.ts',
	'session-switcher.ts',
] as const;

describe('PERF-M8: CLI theme singleton enforcement', () => {
	for (const file of CLI_CONSUMER_FILES) {
		it(`${file} must not call createCliTheme() directly`, () => {
			const content = readFileSync(resolve(CLI_SRC_DIR, file), 'utf-8');
			const hasDirectCreate = content.includes('createCliTheme()');
			expect(hasDirectCreate, `${file} still calls createCliTheme() — use getCliTheme() instead`).toBe(
				false,
			);
		});

		it(`${file} must import getCliTheme from theme.js`, () => {
			const content = readFileSync(resolve(CLI_SRC_DIR, file), 'utf-8');
			// File should either import getCliTheme or not need theme at all
			const usesTheme = content.includes('theme.');
			if (usesTheme) {
				const importsGetCliTheme = content.includes('getCliTheme');
				expect(
					importsGetCliTheme,
					`${file} uses theme but does not import getCliTheme`,
				).toBe(true);
			}
		});
	}

	it('theme.ts is the only file that defines createCliTheme()', () => {
		// theme.ts should still export createCliTheme for backward compatibility
		const themeContent = readFileSync(resolve(CLI_SRC_DIR, 'theme.ts'), 'utf-8');
		expect(themeContent).toContain('export function createCliTheme()');
		expect(themeContent).toContain('export function getCliTheme()');
	});
});
