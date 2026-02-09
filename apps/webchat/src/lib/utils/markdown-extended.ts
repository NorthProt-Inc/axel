import { renderMarkdownWithHighlight, sanitizeHtml } from './markdown.js';

/**
 * Extended Markdown renderer with Mermaid diagram and LaTeX math support.
 * - Mermaid: ```mermaid code blocks → <div class="mermaid"> containers
 * - LaTeX: $...$ inline and $$...$$ block math → KaTeX HTML
 * - Falls back to standard shiki-highlighted markdown for everything else
 */

const MERMAID_BLOCK_RE = /```mermaid\n([\s\S]*?)```/g;
const LATEX_BLOCK_RE = /\$\$([\s\S]*?)\$\$/g;
const LATEX_INLINE_RE = /(?<![`\\])\$(?!\$)([^$\n]+?)\$/g;

/**
 * Replaces ```mermaid code blocks with <div class="mermaid"> containers.
 * Non-mermaid code blocks are preserved as-is.
 */
export function renderMermaidBlock(content: string): string {
	if (content.length === 0) {
		return '';
	}
	return content.replace(MERMAID_BLOCK_RE, (_match, code: string) => {
		const escaped = escapeHtmlLight(code.trim());
		return `<div class="mermaid">${escaped}</div>`;
	});
}

/**
 * Replaces inline LaTeX $...$ with KaTeX-compatible spans.
 * Ignores $ inside backtick-quoted code.
 */
export function renderLatexInline(content: string): string {
	if (content.length === 0) {
		return '';
	}
	// Protect code spans by replacing them temporarily
	const codeSpans: string[] = [];
	let protected_ = content.replace(/`[^`]+`/g, (match) => {
		codeSpans.push(match);
		return `\x00CODE${codeSpans.length - 1}\x00`;
	});

	protected_ = protected_.replace(LATEX_INLINE_RE, (_match, tex: string) => {
		return `<span class="katex-inline" data-latex="${escapeHtmlLight(tex.trim())}">${escapeHtmlLight(tex.trim())}</span>`;
	});

	// Restore code spans
	for (let i = 0; i < codeSpans.length; i++) {
		const span = codeSpans[i];
		if (span !== undefined) {
			protected_ = protected_.replace(`\x00CODE${i}\x00`, span);
		}
	}

	return protected_;
}

/**
 * Replaces block LaTeX $$...$$ with KaTeX-compatible display blocks.
 */
export function renderLatexBlock(content: string): string {
	if (content.length === 0) {
		return '';
	}
	return content.replace(LATEX_BLOCK_RE, (_match, tex: string) => {
		return `<div class="katex-display" data-latex="${escapeHtmlLight(tex.trim())}">${escapeHtmlLight(tex.trim())}</div>`;
	});
}

/**
 * Full extended markdown pipeline:
 * 1. Extract mermaid blocks → placeholder divs
 * 2. Render LaTeX block ($$...$$)
 * 3. Render LaTeX inline ($...$)
 * 4. Render remaining markdown with shiki highlighting
 * 5. Sanitize output
 */
export async function renderExtendedMarkdown(content: string): Promise<string> {
	if (content.length === 0) {
		return '';
	}

	// Step 1: Extract and replace mermaid blocks before markdown processing
	const mermaidBlocks: string[] = [];
	let processed = content.replace(MERMAID_BLOCK_RE, (_match, code: string) => {
		const placeholder = `\x00MERMAID${mermaidBlocks.length}\x00`;
		mermaidBlocks.push(code.trim());
		return placeholder;
	});

	// Step 2+3: LaTeX processing
	processed = renderLatexBlock(processed);
	processed = renderLatexInline(processed);

	// Step 4: Render remaining markdown
	const html = await renderMarkdownWithHighlight(processed);

	// Step 5: Restore mermaid blocks
	let result = html;
	for (let i = 0; i < mermaidBlocks.length; i++) {
		const block = mermaidBlocks[i];
		if (block !== undefined) {
			result = result.replace(
				`\x00MERMAID${i}\x00`,
				`<div class="mermaid">${escapeHtmlLight(block)}</div>`,
			);
		}
	}

	return result;
}

function escapeHtmlLight(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}
