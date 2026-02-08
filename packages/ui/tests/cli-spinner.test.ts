import { describe, expect, it } from 'vitest';
import { createSpinner } from '../src/cli/spinner.js';

describe('CLI Spinner', () => {
	it('creates an ora spinner instance', () => {
		const spinner = createSpinner();
		expect(spinner).toBeDefined();
		expect(typeof spinner.start).toBe('function');
		expect(typeof spinner.stop).toBe('function');
	});

	it('accepts custom text', () => {
		const spinner = createSpinner('loading...');
		expect(spinner).toBeDefined();
	});
});
