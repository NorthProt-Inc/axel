import { Marked } from 'marked';
import { markedTerminal } from 'marked-terminal';
import { getCliTheme } from './theme.js';

/**
 * Render Markdown content to styled terminal output.
 * Uses marked + marked-terminal for syntax highlighting, bold/italic, links, code blocks.
 */

let cachedMarked: Marked | null = null;

function getMarked(): Marked {
	if (cachedMarked) {
		return cachedMarked;
	}
	const theme = getCliTheme();
	const instance = new Marked();
	instance.use(
		markedTerminal({
			code: theme.accent,
			codespan: theme.accent,
			strong: theme.bold,
			em: theme.highlight,
			heading: theme.header,
			link: theme.accent,
			href: theme.dim,
		}) as Parameters<typeof instance.use>[0],
	);
	cachedMarked = instance;
	return instance;
}

export function renderMarkdown(content: string): string {
	const marked = getMarked();
	const rendered = marked.parse(content);
	if (typeof rendered === 'string') {
		return rendered;
	}
	return content;
}

export function renderUserPrompt(content: string): string {
	const theme = getCliTheme();
	return `${theme.accent('❯')} ${theme.text(content)}`;
}

export function renderSystemMessage(content: string): string {
	const theme = getCliTheme();
	return theme.muted(`[system] ${content}`);
}

export function renderError(content: string): string {
	const theme = getCliTheme();
	return theme.error(`✗ ${content}`);
}
