import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '../src/lib/utils/markdown.js';

describe('WebChat Markdown Rendering', () => {
	it('renders plain text', () => {
		const result = renderMarkdown('hello world');
		expect(result).toContain('hello world');
	});

	it('renders bold text as <strong>', () => {
		const result = renderMarkdown('**bold**');
		expect(result).toContain('<strong>');
		expect(result).toContain('bold');
	});

	it('renders inline code as <code>', () => {
		const result = renderMarkdown('use `npm install`');
		expect(result).toContain('<code>');
		expect(result).toContain('npm install');
	});

	it('renders code blocks as <pre><code>', () => {
		const result = renderMarkdown('```js\nconsole.log("hi")\n```');
		expect(result).toContain('<code');
		expect(result).toContain('console.log');
	});

	it('renders links as <a> tags', () => {
		const result = renderMarkdown('[Axel](https://axel.dev)');
		expect(result).toContain('<a');
		expect(result).toContain('https://axel.dev');
	});

	it('renders headings', () => {
		const result = renderMarkdown('# Title');
		expect(result).toContain('<h1');
		expect(result).toContain('Title');
	});

	it('renders unordered lists', () => {
		const result = renderMarkdown('- item 1\n- item 2');
		expect(result).toContain('<li>');
		expect(result).toContain('item 1');
	});

	it('returns original content for empty string', () => {
		const result = renderMarkdown('');
		expect(result).toBe('');
	});
});
