import { describe, expect, it } from 'vitest';
import { renderMarkdownWithHighlight, sanitizeHtml } from '../src/lib/utils/markdown.js';

describe('WebChat Enhanced Markdown — Shiki Code Highlighting', () => {
	it('highlights TypeScript code blocks', async () => {
		const md = '```typescript\nconst x: number = 42;\n```';
		const result = await renderMarkdownWithHighlight(md);
		// Shiki outputs <pre> with styled spans
		expect(result).toContain('<pre');
		expect(result).toContain('const');
	});

	it('highlights JavaScript code blocks', async () => {
		const md = '```js\nfunction hello() { return "hi"; }\n```';
		const result = await renderMarkdownWithHighlight(md);
		expect(result).toContain('<pre');
		expect(result).toContain('hello');
	});

	it('highlights Python code blocks', async () => {
		const md = '```python\ndef greet(name):\n    return f"Hello {name}"\n```';
		const result = await renderMarkdownWithHighlight(md);
		expect(result).toContain('<pre');
		expect(result).toContain('greet');
	});

	it('renders code blocks without language as plain', async () => {
		const md = '```\nplain code here\n```';
		const result = await renderMarkdownWithHighlight(md);
		expect(result).toContain('plain code here');
	});

	it('renders non-code markdown normally', async () => {
		const md = '**bold** and *italic*';
		const result = await renderMarkdownWithHighlight(md);
		expect(result).toContain('<strong>');
		expect(result).toContain('<em>');
	});

	it('returns empty string for empty input', async () => {
		const result = await renderMarkdownWithHighlight('');
		expect(result).toBe('');
	});

	it('renders inline code without shiki', async () => {
		const md = 'Use `npm install` to install';
		const result = await renderMarkdownWithHighlight(md);
		expect(result).toContain('<code>');
		expect(result).toContain('npm install');
	});
});

describe('WebChat Markdown — XSS Sanitization', () => {
	it('strips script tags', () => {
		const dirty = '<p>Hello</p><script>alert("xss")</script>';
		const clean = sanitizeHtml(dirty);
		expect(clean).not.toContain('<script');
		expect(clean).not.toContain('alert');
		expect(clean).toContain('Hello');
	});

	it('strips onerror attributes', () => {
		const dirty = '<img src="x" onerror="alert(1)">';
		const clean = sanitizeHtml(dirty);
		expect(clean).not.toContain('onerror');
	});

	it('strips onclick attributes', () => {
		const dirty = '<div onclick="steal()">text</div>';
		const clean = sanitizeHtml(dirty);
		expect(clean).not.toContain('onclick');
		expect(clean).toContain('text');
	});

	it('strips javascript: URLs', () => {
		const dirty = '<a href="javascript:alert(1)">click</a>';
		const clean = sanitizeHtml(dirty);
		expect(clean).not.toContain('javascript:');
	});

	it('preserves safe HTML', () => {
		const safe = '<p><strong>bold</strong> and <em>italic</em></p>';
		const clean = sanitizeHtml(safe);
		expect(clean).toContain('<strong>');
		expect(clean).toContain('<em>');
		expect(clean).toContain('<p>');
	});

	it('preserves pre and code tags', () => {
		const safe = '<pre><code class="language-js">const x = 1;</code></pre>';
		const clean = sanitizeHtml(safe);
		expect(clean).toContain('<pre>');
		expect(clean).toContain('<code');
	});

	it('strips style tags', () => {
		const dirty = '<style>body{display:none}</style><p>text</p>';
		const clean = sanitizeHtml(dirty);
		expect(clean).not.toContain('<style');
		expect(clean).toContain('text');
	});

	it('strips iframe tags', () => {
		const dirty = '<iframe src="evil.com"></iframe><p>safe</p>';
		const clean = sanitizeHtml(dirty);
		expect(clean).not.toContain('<iframe');
		expect(clean).toContain('safe');
	});

	it('returns empty string for empty input', () => {
		expect(sanitizeHtml('')).toBe('');
	});

	it('strips data: URLs in href', () => {
		const dirty = '<a href="data:text/html,<script>alert(1)</script>">link</a>';
		const clean = sanitizeHtml(dirty);
		expect(clean).not.toContain('data:');
	});
});
