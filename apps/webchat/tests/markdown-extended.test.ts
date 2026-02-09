import { describe, expect, it } from 'vitest';
import {
	renderMermaidBlock,
	renderLatexInline,
	renderLatexBlock,
	renderExtendedMarkdown,
} from '../src/lib/utils/markdown-extended.js';

describe('WebChat Extended Markdown — Mermaid Diagrams', () => {
	it('renders mermaid code block as container div', () => {
		const md = '```mermaid\ngraph TD\nA-->B\n```';
		const result = renderMermaidBlock(md);
		expect(result).toContain('class="mermaid"');
		expect(result).toContain('graph TD');
		// > is HTML-escaped in the output
		expect(result).toContain('A--&gt;B');
	});

	it('preserves non-mermaid code blocks unchanged', () => {
		const md = '```js\nconsole.log("hi")\n```';
		const result = renderMermaidBlock(md);
		expect(result).not.toContain('class="mermaid"');
		expect(result).toContain('```js');
	});

	it('handles multiple mermaid blocks', () => {
		const md = '```mermaid\ngraph TD\nA-->B\n```\n\ntext\n\n```mermaid\nsequenceDiagram\nA->>B: hi\n```';
		const result = renderMermaidBlock(md);
		const matches = result.match(/class="mermaid"/g);
		expect(matches).toHaveLength(2);
	});

	it('returns empty for empty input', () => {
		expect(renderMermaidBlock('')).toBe('');
	});
});

describe('WebChat Extended Markdown — LaTeX Math', () => {
	it('renders inline LaTeX $...$', () => {
		const md = 'The formula $E = mc^2$ is famous';
		const result = renderLatexInline(md);
		expect(result).toContain('katex');
		expect(result).toContain('E = mc^2');
	});

	it('does not render $ in code blocks', () => {
		const md = '`$not-latex$`';
		const result = renderLatexInline(md);
		expect(result).not.toContain('katex');
	});

	it('renders block LaTeX $$...$$', () => {
		const md = '$$\n\\int_0^1 x^2 dx = \\frac{1}{3}\n$$';
		const result = renderLatexBlock(md);
		expect(result).toContain('katex');
		expect(result).toContain('display');
	});

	it('returns empty for empty input', () => {
		expect(renderLatexInline('')).toBe('');
		expect(renderLatexBlock('')).toBe('');
	});
});

describe('WebChat Extended Markdown — Combined Rendering', () => {
	it('renders markdown with mermaid and LaTeX', async () => {
		const md = '# Title\n\n$E=mc^2$\n\n```mermaid\ngraph TD\nA-->B\n```\n\n**bold**';
		const result = await renderExtendedMarkdown(md);
		expect(result).toContain('katex');
		expect(result).toContain('class="mermaid"');
		expect(result).toContain('<strong>');
	});

	it('renders plain markdown without extended syntax', async () => {
		const md = '**bold** and *italic*';
		const result = await renderExtendedMarkdown(md);
		expect(result).toContain('<strong>');
		expect(result).toContain('<em>');
	});

	it('returns empty for empty input', async () => {
		expect(await renderExtendedMarkdown('')).toBe('');
	});
});
