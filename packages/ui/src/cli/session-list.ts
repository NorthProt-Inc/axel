import { createCliTheme } from './theme.js';

/**
 * CLI session list formatting.
 * Renders available sessions for /session command output.
 */

export interface SessionListEntry {
	readonly id: string;
	readonly title: string;
	readonly createdAt: Date;
	readonly messageCount: number;
	readonly active: boolean;
}

export function formatSessionEntry(session: SessionListEntry): string {
	const theme = createCliTheme();
	const indicator = session.active ? theme.accent('▶ ') : '  ';
	const shortId = session.id.slice(0, 8);
	const title = session.active ? theme.bold(session.title) : session.title;
	const count = theme.dim(`(${session.messageCount} msgs)`);
	return `${indicator}${theme.dim(shortId)} ${title} ${count}`;
}

export function formatSessionList(sessions: readonly SessionListEntry[]): string {
	if (sessions.length === 0) {
		const theme = createCliTheme();
		return theme.muted('  No sessions found.');
	}

	const theme = createCliTheme();
	const lines: string[] = [theme.header('  Sessions'), ''];

	for (const session of sessions) {
		lines.push(`  ${formatSessionEntry(session)}`);
	}

	return lines.join('\n');
}
