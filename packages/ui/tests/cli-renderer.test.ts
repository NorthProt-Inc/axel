import { describe, expect, it } from 'vitest';
import {
	renderError,
	renderMarkdown,
	renderSystemMessage,
	renderUserPrompt,
} from '../src/cli/renderer.js';

describe('CLI Renderer', () => {
	describe('renderMarkdown', () => {
		it('renders plain text', () => {
			const result = renderMarkdown('hello world');
			expect(result).toContain('hello world');
		});

		it('renders bold text', () => {
			const result = renderMarkdown('**bold**');
			expect(result).toBeDefined();
			expect(typeof result).toBe('string');
		});

		it('renders code blocks', () => {
			const result = renderMarkdown('```js\nconsole.log("hi")\n```');
			expect(result).toContain('console.log');
		});
	});

	describe('renderUserPrompt', () => {
		it('includes prompt indicator', () => {
			const result = renderUserPrompt('hello');
			expect(result).toContain('❯');
			expect(result).toContain('hello');
		});
	});

	describe('renderSystemMessage', () => {
		it('includes system prefix', () => {
			const result = renderSystemMessage('info');
			expect(result).toContain('[system]');
			expect(result).toContain('info');
		});
	});

	describe('renderError', () => {
		it('includes error indicator', () => {
			const result = renderError('something failed');
			expect(result).toContain('✗');
			expect(result).toContain('something failed');
		});
	});
});
