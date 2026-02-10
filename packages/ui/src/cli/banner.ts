import { getCliTheme } from './theme.js';

/**
 * NorthProt 4-point star ASCII art banner.
 * Displayed at CLI startup.
 */

const STAR_ART = [
	'      ✦      ',
	'    ╱   ╲    ',
	'  ✦  AXEL  ✦ ',
	'    ╲   ╱    ',
	'      ✦      ',
];

export interface BannerOptions {
	readonly version?: string;
	readonly sessionId?: string;
	readonly status?: string;
}

export function renderBanner(options?: BannerOptions): string {
	const theme = getCliTheme();
	const lines: string[] = [];

	lines.push('');
	for (const line of STAR_ART) {
		lines.push(theme.accent(line));
	}

	const infoLine: string[] = [];
	if (options?.version) {
		infoLine.push(theme.muted(`v${options.version}`));
	}
	if (options?.sessionId) {
		infoLine.push(theme.dim(`session: ${options.sessionId.slice(0, 8)}`));
	}
	if (options?.status) {
		const statusColor = options.status === 'connected' ? theme.success : theme.warning;
		infoLine.push(statusColor(options.status));
	}

	if (infoLine.length > 0) {
		lines.push(`  ${infoLine.join(theme.dim(' │ '))}`);
	}

	lines.push(theme.dim('─'.repeat(40)));
	lines.push('');

	return lines.join('\n');
}
