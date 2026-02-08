import { describe, expect, it } from 'vitest';
import {
	renderAssistantMessage,
	renderStreamStart,
	renderStreamChunk,
	renderStreamEnd,
	renderToolCall,
	renderToolResult,
	renderThinking,
} from '../src/cli/output.js';

describe('CLI Output — Assistant Message Rendering', () => {
	describe('renderAssistantMessage', () => {
		it('renders plain text response', () => {
			const result = renderAssistantMessage('Hello, Mark!');
			expect(result).toContain('Hello, Mark!');
			expect(typeof result).toBe('string');
		});

		it('renders markdown content through marked', () => {
			const result = renderAssistantMessage('**bold** and `code`');
			expect(result).toBeDefined();
			expect(typeof result).toBe('string');
		});

		it('includes assistant label', () => {
			const result = renderAssistantMessage('hi');
			expect(result).toContain('Axel');
		});

		it('returns empty string for empty content', () => {
			const result = renderAssistantMessage('');
			expect(result).toBe('');
		});
	});

	describe('renderStreamStart', () => {
		it('returns a stream prefix line', () => {
			const result = renderStreamStart();
			expect(result).toContain('Axel');
			expect(typeof result).toBe('string');
		});
	});

	describe('renderStreamChunk', () => {
		it('returns the chunk as-is for terminal output', () => {
			const result = renderStreamChunk('Hello');
			expect(result).toBe('Hello');
		});

		it('returns empty string for empty chunk', () => {
			const result = renderStreamChunk('');
			expect(result).toBe('');
		});
	});

	describe('renderStreamEnd', () => {
		it('returns a newline terminator', () => {
			const result = renderStreamEnd();
			expect(result).toContain('\n');
		});
	});

	describe('renderToolCall', () => {
		it('renders tool name and input summary', () => {
			const result = renderToolCall('web_search', { query: 'Axel AI' });
			expect(result).toContain('web_search');
			expect(typeof result).toBe('string');
		});

		it('includes a tool indicator symbol', () => {
			const result = renderToolCall('read_file', { path: '/tmp/test.ts' });
			expect(result).toContain('⚙');
		});
	});

	describe('renderToolResult', () => {
		it('renders success result', () => {
			const result = renderToolResult('web_search', true, 'Found 3 results');
			expect(result).toContain('web_search');
			expect(result).toContain('✓');
		});

		it('renders failure result', () => {
			const result = renderToolResult('web_search', false, 'Network error');
			expect(result).toContain('web_search');
			expect(result).toContain('✗');
		});

		it('truncates long output', () => {
			const longOutput = 'x'.repeat(300);
			const result = renderToolResult('tool', true, longOutput);
			expect(result.length).toBeLessThan(longOutput.length + 100);
		});
	});

	describe('renderThinking', () => {
		it('renders thinking content in muted style', () => {
			const result = renderThinking('considering options...');
			expect(result).toContain('considering options...');
			expect(typeof result).toBe('string');
		});

		it('includes thinking indicator', () => {
			const result = renderThinking('analyzing');
			expect(result).toContain('💭');
		});
	});
});
