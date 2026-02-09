import { createCliTheme } from './theme.js';

/**
 * Conversation history browsing and search for CLI.
 * Pure functions — no I/O, no side effects.
 */

const MAX_PREVIEW_LENGTH = 80;

export interface HistoryEntry {
	readonly sessionId: string;
	readonly timestamp: Date;
	readonly role: 'user' | 'assistant';
	readonly preview: string;
}

/**
 * Format history entries for terminal display.
 * Shows timestamp, truncated session ID, role, and message preview.
 */
export function browseHistory(entries: readonly HistoryEntry[]): string {
	if (entries.length === 0) {
		return '';
	}

	const theme = createCliTheme();
	const lines: string[] = [theme.header('History'), ''];

	for (const entry of entries) {
		const shortId = entry.sessionId.slice(0, 10);
		const hh = entry.timestamp.getUTCHours().toString().padStart(2, '0');
		const mm = entry.timestamp.getUTCMinutes().toString().padStart(2, '0');
		const time = `${hh}:${mm}`;
		const preview = truncatePreview(entry.preview);
		const roleLabel =
			entry.role === 'user'
				? theme.accent(entry.role)
				: theme.success(entry.role);

		lines.push(
			`  ${theme.dim(time)} ${theme.muted(shortId)} ${roleLabel} ${theme.text(preview)}`,
		);
	}

	lines.push('');
	return lines.join('\n');
}

/**
 * Search history entries by query string.
 * Matches against preview text and session IDs, case-insensitive.
 * Returns empty query matches all entries.
 */
export function searchHistory(
	entries: readonly HistoryEntry[],
	query: string,
): readonly HistoryEntry[] {
	if (query === '') {
		return entries;
	}

	const lowerQuery = query.toLowerCase();
	return entries.filter(
		(entry) =>
			entry.preview.toLowerCase().includes(lowerQuery) ||
			entry.sessionId.toLowerCase().includes(lowerQuery),
	);
}

function truncatePreview(text: string): string {
	if (text.length <= MAX_PREVIEW_LENGTH) {
		return text;
	}
	return `${text.slice(0, MAX_PREVIEW_LENGTH)}...`;
}
