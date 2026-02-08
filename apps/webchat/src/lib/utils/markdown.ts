import { Marked } from 'marked';

/**
 * Markdown renderer for WebChat.
 * Uses marked for parsing. Shiki integration for code blocks can be added later.
 */

const marked = new Marked();

export function renderMarkdown(content: string): string {
	const result = marked.parse(content);
	if (typeof result === 'string') {
		return result;
	}
	return content;
}
