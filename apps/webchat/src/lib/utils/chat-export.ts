/**
 * Chat export utilities — Markdown and JSON export.
 * Also includes Mermaid and LaTeX block detection for rendering.
 */

export interface ExportableChatMessage {
	readonly id: string;
	readonly role: 'user' | 'assistant' | 'system';
	readonly content: string;
	readonly timestamp: Date;
}

interface MermaidBlock {
	readonly type: 'mermaid';
	readonly code: string;
	readonly startIndex: number;
	readonly endIndex: number;
}

interface LatexBlock {
	readonly type: 'inline' | 'block';
	readonly expression: string;
	readonly startIndex: number;
	readonly endIndex: number;
}

// ─── Export Functions ───

/**
 * Export chat messages to Markdown format.
 */
export function exportToMarkdown(
	messages: readonly ExportableChatMessage[],
	title: string,
): string {
	const lines: string[] = [`# ${title}`, '', `*Exported: ${new Date().toISOString()}*`, ''];

	for (const msg of messages) {
		const role = msg.role === 'user' ? '**User**' : '**Axel**';
		const ts = msg.timestamp.toISOString().replace('T', ' ').slice(0, 19);
		lines.push(`### ${role} — ${ts}`, '', msg.content, '', '---', '');
	}

	return lines.join('\n');
}

/**
 * Export chat messages to JSON format.
 */
export function exportToJson(messages: readonly ExportableChatMessage[], title: string): string {
	const data = {
		title,
		exportedAt: new Date().toISOString(),
		messageCount: messages.length,
		messages: messages.map((m) => ({
			id: m.id,
			role: m.role,
			content: m.content,
			timestamp: m.timestamp.toISOString(),
		})),
	};
	return JSON.stringify(data, null, 2);
}

// ─── Mermaid Detection ───

const MERMAID_BLOCK_REGEX = /```mermaid\n([\s\S]*?)```/g;

/**
 * Parse Mermaid diagram code blocks from markdown content.
 */
export function parseMermaidBlocks(content: string): readonly MermaidBlock[] {
	const blocks: MermaidBlock[] = [];
	for (const match of content.matchAll(MERMAID_BLOCK_REGEX)) {
		if (match.index !== undefined && match[1] !== undefined) {
			blocks.push({
				type: 'mermaid',
				code: match[1].trim(),
				startIndex: match.index,
				endIndex: match.index + match[0].length,
			});
		}
	}
	return blocks;
}

// ─── LaTeX Detection ───

const BLOCK_LATEX_REGEX = /(?<!\\)\$\$([\s\S]*?)(?<!\\)\$\$/g;
const INLINE_LATEX_REGEX = /(?<!\\)\$(?!\$)(.*?)(?<!\\)\$/g;

/**
 * Parse LaTeX expressions from content.
 * Supports inline ($...$) and block ($$...$$) expressions.
 */
export function parseLatexBlocks(content: string): readonly LatexBlock[] {
	const blocks: LatexBlock[] = [];

	// Block LaTeX first ($$...$$)
	for (const match of content.matchAll(BLOCK_LATEX_REGEX)) {
		if (match.index !== undefined && match[1] !== undefined) {
			blocks.push({
				type: 'block',
				expression: match[1].trim(),
				startIndex: match.index,
				endIndex: match.index + match[0].length,
			});
		}
	}

	// Inline LaTeX ($...$) — exclude already-matched block ranges
	for (const match of content.matchAll(INLINE_LATEX_REGEX)) {
		if (match.index !== undefined && match[1] !== undefined) {
			const start = match.index;
			const end = start + match[0].length;
			const overlaps = blocks.some((b) => start >= b.startIndex && end <= b.endIndex);
			if (!overlaps) {
				blocks.push({
					type: 'inline',
					expression: match[1].trim(),
					startIndex: start,
					endIndex: end,
				});
			}
		}
	}

	return blocks.sort((a, b) => a.startIndex - b.startIndex);
}
