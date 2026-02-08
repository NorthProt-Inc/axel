import { describe, expect, it } from 'vitest';
import { formatDivider, formatHelp, formatSessionInfo, formatTimestamp } from '../src/cli/format.js';

describe('CLI Format', () => {
	describe('formatSessionInfo', () => {
		it('truncates session ID to 8 chars', () => {
			const result = formatSessionInfo('abcdef1234567890', 'connected');
			expect(result).toContain('abcdef12');
		});

		it('includes status', () => {
			const result = formatSessionInfo('abc12345', 'connected');
			expect(result).toContain('connected');
		});
	});

	describe('formatTimestamp', () => {
		it('formats as HH:MM', () => {
			const date = new Date('2025-01-15T14:30:00');
			const result = formatTimestamp(date);
			expect(result).toContain('14:30');
		});

		it('zero-pads single digits', () => {
			const date = new Date('2025-01-15T03:05:00');
			const result = formatTimestamp(date);
			expect(result).toContain('03:05');
		});
	});

	describe('formatDivider', () => {
		it('creates divider with default width', () => {
			const result = formatDivider();
			expect(result).toContain('─');
		});

		it('respects custom width', () => {
			const result = formatDivider(20);
			// The raw string inside (ignoring ANSI codes) should have 20 dashes
			const stripped = result.replace(/\x1b\[[0-9;]*m/g, '');
			expect(stripped.length).toBe(20);
		});
	});

	describe('formatHelp', () => {
		it('includes all commands', () => {
			const result = formatHelp();
			expect(result).toContain('/help');
			expect(result).toContain('/session');
			expect(result).toContain('/clear');
			expect(result).toContain('/quit');
		});

		it('includes Commands header', () => {
			const result = formatHelp();
			expect(result).toContain('Commands');
		});
	});
});
