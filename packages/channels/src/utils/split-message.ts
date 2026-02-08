/**
 * Split content into chunks that fit within maxLength.
 *
 * Used by Discord (2000 char) and Telegram (4096 char) channels.
 */
export function splitMessage(content: string, maxLength: number): string[] {
	if (content.length <= maxLength) {
		return [content];
	}

	const chunks: string[] = [];
	let remaining = content;
	while (remaining.length > 0) {
		chunks.push(remaining.slice(0, maxLength));
		remaining = remaining.slice(maxLength);
	}
	return chunks;
}
