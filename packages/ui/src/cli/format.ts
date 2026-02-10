import { getCliTheme } from './theme.js';

/**
 * CLI formatting utilities: code blocks, tables, lists, session info.
 */

export function formatSessionInfo(sessionId: string, status: string): string {
	const theme = getCliTheme();
	const shortId = sessionId.slice(0, 8);
	const statusColor = status === 'connected' ? theme.success : theme.warning;
	return theme.dim(`[${shortId}] `) + statusColor(status);
}

export function formatTimestamp(date: Date): string {
	const theme = getCliTheme();
	const hh = date.getHours().toString().padStart(2, '0');
	const mm = date.getMinutes().toString().padStart(2, '0');
	return theme.dim(`${hh}:${mm}`);
}

export function formatDivider(width?: number): string {
	const theme = getCliTheme();
	return theme.dim('─'.repeat(width ?? 40));
}

export function formatHelp(): string {
	const theme = getCliTheme();
	const commands = [
		['/help', 'Show this help message'],
		['/session', 'Show current session info'],
		['/clear', 'Clear the screen'],
		['/quit', 'Exit Axel'],
	] as const;

	const lines = [theme.header('Commands'), ''];
	for (const [cmd, desc] of commands) {
		lines.push(`  ${theme.accent(cmd.padEnd(12))} ${theme.muted(desc)}`);
	}
	lines.push('');
	return lines.join('\n');
}
