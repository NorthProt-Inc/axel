import { getCliTheme } from './theme.js';

/**
 * CLI conversation history formatting.
 * Renders past messages in a readable terminal format.
 */

const MAX_CONTENT_LENGTH = 200;
const DEFAULT_MAX_ENTRIES = 20;

export interface HistoryEntry {
	readonly role: 'user' | 'assistant' | 'system';
	readonly content: string;
	readonly timestamp: Date;
}

export function formatHistoryEntry(entry: HistoryEntry): string {
	const theme = getCliTheme();
	const time = formatTime(entry.timestamp);
	const prefix = entry.role === 'user' ? theme.accent('You') : theme.text('Axel');
	const content = truncateContent(entry.content, MAX_CONTENT_LENGTH);
	return `${theme.dim(time)} ${prefix}: ${content}`;
}

export function formatHistoryList(
	entries: readonly HistoryEntry[],
	maxEntries: number = DEFAULT_MAX_ENTRIES,
): string {
	if (entries.length === 0) {
		const theme = getCliTheme();
		return theme.muted('  No history in this session.');
	}

	const theme = getCliTheme();
	const lines: string[] = [theme.header('  Conversation History'), ''];

	const visible = entries.slice(-maxEntries);
	if (entries.length > maxEntries) {
		lines.push(theme.dim(`  ... ${entries.length - maxEntries} earlier messages omitted`), '');
	}

	for (const entry of visible) {
		lines.push(`  ${formatHistoryEntry(entry)}`);
	}

	return lines.join('\n');
}

function formatTime(date: Date): string {
	const h = String(date.getHours()).padStart(2, '0');
	const m = String(date.getMinutes()).padStart(2, '0');
	return `${h}:${m}`;
}

function truncateContent(content: string, maxLen: number): string {
	const singleLine = content.replace(/\n/g, ' ').trim();
	if (singleLine.length <= maxLen) {
		return singleLine;
	}
	return `${singleLine.slice(0, maxLen)}...`;
}
