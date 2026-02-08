import { Marked } from 'marked';
import { createHighlighter, type Highlighter } from 'shiki';

/**
 * Markdown renderer for WebChat.
 * - marked for parsing
 * - shiki for code block syntax highlighting
 * - sanitizeHtml for XSS prevention
 */

const marked = new Marked();

export function renderMarkdown(content: string): string {
	const result = marked.parse(content);
	if (typeof result === 'string') {
		return result;
	}
	return content;
}

let highlighterPromise: Promise<Highlighter> | null = null;

function getHighlighter(): Promise<Highlighter> {
	if (!highlighterPromise) {
		highlighterPromise = createHighlighter({
			themes: ['github-dark'],
			langs: ['typescript', 'javascript', 'python', 'bash', 'json', 'html', 'css', 'sql'],
		});
	}
	return highlighterPromise;
}

export async function renderMarkdownWithHighlight(content: string): Promise<string> {
	if (content.length === 0) {
		return '';
	}

	const hl = await getHighlighter();
	const instance = new Marked();

	instance.use({
		renderer: {
			code({ text, lang }: { text: string; lang?: string }) {
				const language = lang ?? '';
				try {
					const highlighted = hl.codeToHtml(text, {
						lang: language.length > 0 ? language : 'text',
						theme: 'github-dark',
					});
					return highlighted;
				} catch {
					return `<pre><code>${escapeHtml(text)}</code></pre>`;
				}
			},
		},
	});

	const result = instance.parse(content);
	if (typeof result === 'string') {
		return sanitizeHtml(result);
	}
	return content;
}

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

/** Allowlist-based HTML sanitizer for XSS prevention. */
const ALLOWED_TAGS = new Set([
	'p', 'br', 'hr',
	'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
	'strong', 'b', 'em', 'i', 'u', 's', 'del', 'ins', 'mark',
	'code', 'pre', 'kbd', 'samp', 'var',
	'ul', 'ol', 'li',
	'blockquote', 'q',
	'a',
	'img',
	'table', 'thead', 'tbody', 'tr', 'th', 'td',
	'div', 'span',
	'sup', 'sub',
	'details', 'summary',
]);

const ALLOWED_ATTRS: Record<string, ReadonlySet<string>> = {
	a: new Set(['href', 'title', 'rel', 'target']),
	img: new Set(['src', 'alt', 'title', 'width', 'height']),
	code: new Set(['class']),
	pre: new Set(['class']),
	span: new Set(['class', 'style']),
	div: new Set(['class']),
	td: new Set(['align']),
	th: new Set(['align']),
};

const DANGEROUS_URL_PATTERN = /^\s*(javascript|data|vbscript)\s*:/i;

export function sanitizeHtml(html: string): string {
	if (html.length === 0) {
		return '';
	}

	// Strip dangerous tags entirely (including content for script/style/iframe)
	let result = html.replace(/<(script|style|iframe|object|embed|form|textarea|select|button|input)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
	// Strip self-closing dangerous tags
	result = result.replace(/<(script|style|iframe|object|embed|form|textarea|select|button|input)\b[^>]*\/?>/gi, '');

	// Process remaining tags: strip disallowed tags, filter attributes
	result = result.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, (match, tagName: string, attrs: string) => {
		const tag = tagName.toLowerCase();
		const isClosing = match.startsWith('</');

		if (!ALLOWED_TAGS.has(tag)) {
			return '';
		}

		if (isClosing) {
			return `</${tag}>`;
		}

		const filteredAttrs = filterAttributes(tag, attrs);
		const selfClose = match.endsWith('/>') ? ' /' : '';
		return filteredAttrs.length > 0
			? `<${tag} ${filteredAttrs}${selfClose}>`
			: `<${tag}${selfClose}>`;
	});

	return result;
}

function filterAttributes(tag: string, attrString: string): string {
	const allowedSet = ALLOWED_ATTRS[tag];
	if (!allowedSet) {
		return '';
	}

	const attrs: string[] = [];
	const attrPattern = /([a-zA-Z][a-zA-Z0-9_-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/g;
	let attrMatch: RegExpExecArray | null;

	while ((attrMatch = attrPattern.exec(attrString)) !== null) {
		const name = attrMatch[1]!.toLowerCase();
		const value = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? '';

		// Strip event handlers (on*)
		if (name.startsWith('on')) {
			continue;
		}

		if (!allowedSet.has(name)) {
			continue;
		}

		// Check dangerous URLs
		if ((name === 'href' || name === 'src') && DANGEROUS_URL_PATTERN.test(value)) {
			continue;
		}

		attrs.push(`${name}="${escapeHtml(value)}"`);
	}

	return attrs.join(' ');
}
