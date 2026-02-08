import { describe, expect, it } from 'vitest';
import { renderBanner } from '../src/cli/banner.js';

describe('CLI Banner', () => {
	it('renders without options', () => {
		const banner = renderBanner();
		expect(banner).toContain('AXEL');
	});

	it('renders with version', () => {
		const banner = renderBanner({ version: '0.1.0' });
		expect(banner).toContain('0.1.0');
	});

	it('renders with session ID (truncated to 8 chars)', () => {
		const banner = renderBanner({ sessionId: 'abcdef12-3456-7890-abcd-ef1234567890' });
		expect(banner).toContain('abcdef12');
	});

	it('renders with status', () => {
		const banner = renderBanner({ status: 'connected' });
		expect(banner).toContain('connected');
	});

	it('includes star art', () => {
		const banner = renderBanner();
		expect(banner).toContain('✦');
	});

	it('includes divider', () => {
		const banner = renderBanner();
		expect(banner).toContain('─');
	});
});
