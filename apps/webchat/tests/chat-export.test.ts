import { describe, expect, it } from 'vitest';
import {
	type ExportableChatMessage,
	exportToJson,
	exportToMarkdown,
	parseLatexBlocks,
	parseMermaidBlocks,
} from '../src/lib/utils/chat-export.js';

function createMessages(): ExportableChatMessage[] {
	return [
		{
			id: 'msg-1',
			role: 'user',
			content: 'Hello',
			timestamp: new Date('2026-02-09T10:00:00Z'),
		},
		{
			id: 'msg-2',
			role: 'assistant',
			content: 'Hi! How can I help you?',
			timestamp: new Date('2026-02-09T10:00:01Z'),
		},
		{
			id: 'msg-3',
			role: 'user',
			content: 'What is 2+2?',
			timestamp: new Date('2026-02-09T10:00:10Z'),
		},
		{
			id: 'msg-4',
			role: 'assistant',
			content: '2+2 = 4',
			timestamp: new Date('2026-02-09T10:00:11Z'),
		},
	];
}

describe('exportToMarkdown', () => {
	it('exports messages to markdown format', () => {
		const result = exportToMarkdown(createMessages(), 'Test Session');
		expect(result).toContain('# Test Session');
		expect(result).toContain('**User**');
		expect(result).toContain('Hello');
		expect(result).toContain('**Axel**');
		expect(result).toContain('Hi! How can I help you?');
		expect(result).toContain('2+2 = 4');
	});

	it('includes timestamps', () => {
		const result = exportToMarkdown(createMessages(), 'Test');
		expect(result).toContain('2026-02-09');
	});

	it('handles empty messages', () => {
		const result = exportToMarkdown([], 'Empty');
		expect(result).toContain('# Empty');
		expect(result).not.toContain('**User**');
	});

	it('separates messages with horizontal rules', () => {
		const result = exportToMarkdown(createMessages(), 'Test');
		expect(result).toContain('---');
	});
});

describe('exportToJson', () => {
	it('exports messages to JSON format', () => {
		const messages = createMessages();
		const result = exportToJson(messages, 'Test Session');
		const parsed = JSON.parse(result);
		expect(parsed.title).toBe('Test Session');
		expect(parsed.messages).toHaveLength(4);
		expect(parsed.messages[0].role).toBe('user');
		expect(parsed.messages[0].content).toBe('Hello');
	});

	it('includes export metadata', () => {
		const result = exportToJson(createMessages(), 'Test');
		const parsed = JSON.parse(result);
		expect(parsed.exportedAt).toBeDefined();
		expect(parsed.messageCount).toBe(4);
	});

	it('handles empty messages', () => {
		const result = exportToJson([], 'Empty');
		const parsed = JSON.parse(result);
		expect(parsed.messages).toHaveLength(0);
		expect(parsed.messageCount).toBe(0);
	});
});

describe('parseMermaidBlocks', () => {
	it('detects mermaid code blocks', () => {
		const content = 'Here is a diagram:\n```mermaid\ngraph TD\n  A-->B\n```\nDone.';
		const blocks = parseMermaidBlocks(content);
		expect(blocks).toHaveLength(1);
		expect(blocks[0]).toMatchObject({
			type: 'mermaid',
			code: 'graph TD\n  A-->B',
		});
	});

	it('returns empty array for no mermaid blocks', () => {
		const blocks = parseMermaidBlocks('Just plain text');
		expect(blocks).toHaveLength(0);
	});

	it('detects multiple mermaid blocks', () => {
		const content = '```mermaid\nA-->B\n```\nText\n```mermaid\nC-->D\n```';
		const blocks = parseMermaidBlocks(content);
		expect(blocks).toHaveLength(2);
	});
});

describe('parseLatexBlocks', () => {
	it('detects inline LaTeX ($...$)', () => {
		const content = 'The formula is $E = mc^2$ in physics.';
		const blocks = parseLatexBlocks(content);
		expect(blocks).toHaveLength(1);
		expect(blocks[0]).toMatchObject({
			type: 'inline',
			expression: 'E = mc^2',
		});
	});

	it('detects block LaTeX ($$...$$)', () => {
		const content = 'The equation:\n$$\\int_0^1 x^2 dx = \\frac{1}{3}$$\nThat is it.';
		const blocks = parseLatexBlocks(content);
		expect(blocks).toHaveLength(1);
		expect(blocks[0]).toMatchObject({
			type: 'block',
			expression: '\\int_0^1 x^2 dx = \\frac{1}{3}',
		});
	});

	it('returns empty array for no LaTeX', () => {
		const blocks = parseLatexBlocks('Just plain text');
		expect(blocks).toHaveLength(0);
	});

	it('detects mixed inline and block LaTeX', () => {
		const content = 'Inline $a+b$ and block $$c+d$$';
		const blocks = parseLatexBlocks(content);
		expect(blocks).toHaveLength(2);
	});

	it('does not match escaped dollar signs', () => {
		const content = 'The price is \\$5.00';
		const blocks = parseLatexBlocks(content);
		expect(blocks).toHaveLength(0);
	});
});
