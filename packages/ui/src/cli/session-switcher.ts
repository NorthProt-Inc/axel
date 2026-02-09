import { createCliTheme } from './theme.js';

/**
 * Session switching and listing for CLI.
 * Pure functions — validates sessions, returns descriptive results.
 */

export interface SessionInfo {
	readonly id: string;
	readonly startedAt: Date;
	readonly messageCount: number;
	readonly status: string;
}

export interface SessionSwitchResult {
	readonly status: 'success' | 'notFound' | 'alreadyActive';
	readonly previousSessionId: string;
	readonly newSessionId: string;
	readonly message: string;
}

/**
 * Validate and switch from current session to target session.
 * Returns a result describing the outcome without performing any I/O.
 */
export function switchSession(
	currentSessionId: string,
	targetSessionId: string,
	sessions: readonly SessionInfo[],
): SessionSwitchResult {
	if (currentSessionId === targetSessionId) {
		return {
			status: 'alreadyActive',
			previousSessionId: currentSessionId,
			newSessionId: targetSessionId,
			message: `Session ${targetSessionId.slice(0, 10)} is already active.`,
		};
	}

	const targetExists = sessions.some((s) => s.id === targetSessionId);
	if (!targetExists) {
		return {
			status: 'notFound',
			previousSessionId: currentSessionId,
			newSessionId: targetSessionId,
			message: `Session ${targetSessionId.slice(0, 10)} not found.`,
		};
	}

	return {
		status: 'success',
		previousSessionId: currentSessionId,
		newSessionId: targetSessionId,
		message: `Switched from ${currentSessionId.slice(0, 10)} to ${targetSessionId.slice(0, 10)}.`,
	};
}

/**
 * Format a list of sessions for terminal display.
 * Shows session ID (truncated), started time, message count, and status.
 */
export function listActiveSessions(
	sessions: readonly SessionInfo[],
): string {
	if (sessions.length === 0) {
		return '';
	}

	const theme = createCliTheme();
	const lines: string[] = [theme.header('Sessions'), ''];

	for (const session of sessions) {
		const shortId = session.id.slice(0, 10);
		const hh = session.startedAt.getUTCHours().toString().padStart(2, '0');
		const mm = session.startedAt.getUTCMinutes().toString().padStart(2, '0');
		const time = `${hh}:${mm}`;
		const statusColor =
			session.status === 'active' ? theme.success : theme.warning;

		lines.push(
			`  ${theme.dim(shortId)} ${theme.muted(time)} ${theme.text(`${session.messageCount} msgs`)} ${statusColor(session.status)}`,
		);
	}

	lines.push('');
	return lines.join('\n');
}
