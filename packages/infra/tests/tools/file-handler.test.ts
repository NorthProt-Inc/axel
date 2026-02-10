import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	FileHandler,
	type FileHandlerConfig,
	createFileReadTool,
	createFileSummaryTool,
	createFileWriteTool,
} from '../../src/tools/file-handler.js';

describe('File Handler Tool', () => {
	let tmpDir: string;
	let handler: FileHandler;

	beforeEach(async () => {
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'axel-file-test-'));
		const config: FileHandlerConfig = {
			basePath: tmpDir,
			maxFileSizeBytes: 1024 * 1024, // 1MB
			allowedExtensions: ['.txt', '.md', '.json', '.csv', '.log'],
		};
		handler = new FileHandler(config);
	});

	afterEach(async () => {
		await fs.rm(tmpDir, { recursive: true, force: true });
	});

	describe('readFile', () => {
		it('reads a text file', async () => {
			const filePath = path.join(tmpDir, 'test.txt');
			await fs.writeFile(filePath, 'Hello World');

			const result = await handler.readFile('test.txt');
			expect(result.content).toBe('Hello World');
			expect(result.fileName).toBe('test.txt');
			expect(result.sizeBytes).toBe(11);
		});

		it('rejects path traversal', async () => {
			await expect(handler.readFile('../../../etc/secret.txt')).rejects.toThrow(
				'escapes base directory',
			);
		});

		it('rejects non-existent file', async () => {
			await expect(handler.readFile('nonexistent.txt')).rejects.toThrow();
		});

		it('rejects disallowed extension', async () => {
			const filePath = path.join(tmpDir, 'script.sh');
			await fs.writeFile(filePath, '#!/bin/bash');

			await expect(handler.readFile('script.sh')).rejects.toThrow('Extension not allowed');
		});

		it('rejects file exceeding max size', async () => {
			const smallHandler = new FileHandler({
				basePath: tmpDir,
				maxFileSizeBytes: 10,
				allowedExtensions: ['.txt'],
			});
			const filePath = path.join(tmpDir, 'big.txt');
			await fs.writeFile(filePath, 'A'.repeat(100));

			await expect(smallHandler.readFile('big.txt')).rejects.toThrow('exceeds maximum');
		});
	});

	describe('writeFile', () => {
		it('writes content to a file', async () => {
			await handler.writeFile('output.txt', 'Written content');

			const written = await fs.readFile(path.join(tmpDir, 'output.txt'), 'utf-8');
			expect(written).toBe('Written content');
		});

		it('creates subdirectories as needed', async () => {
			await handler.writeFile('sub/dir/file.txt', 'Nested content');

			const written = await fs.readFile(path.join(tmpDir, 'sub/dir/file.txt'), 'utf-8');
			expect(written).toBe('Nested content');
		});

		it('rejects path traversal on write', async () => {
			await expect(handler.writeFile('../escape.txt', 'bad')).rejects.toThrow(
				'escapes base directory',
			);
		});

		it('rejects disallowed extension on write', async () => {
			await expect(handler.writeFile('script.py', 'bad')).rejects.toThrow('Extension not allowed');
		});
	});

	describe('summarizeFile', () => {
		it('returns summary for small file', async () => {
			const filePath = path.join(tmpDir, 'data.txt');
			await fs.writeFile(filePath, 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5');

			const summary = await handler.summarizeFile('data.txt');
			expect(summary.fileName).toBe('data.txt');
			expect(summary.lineCount).toBe(5);
			expect(summary.sizeBytes).toBeGreaterThan(0);
			expect(summary.preview).toContain('Line 1');
		});

		it('truncates preview for large files', async () => {
			const filePath = path.join(tmpDir, 'large.txt');
			const lines = Array.from({ length: 100 }, (_, i) => `Line ${i + 1}: content`);
			await fs.writeFile(filePath, lines.join('\n'));

			const summary = await handler.summarizeFile('large.txt');
			expect(summary.lineCount).toBe(100);
			// Preview should not contain all lines
			expect(summary.preview.split('\n').length).toBeLessThanOrEqual(21); // 10 head + ... + 10 tail
		});
	});

	describe('createFileReadTool', () => {
		it('returns a valid tool definition', () => {
			const tool = createFileReadTool(handler);
			expect(tool.name).toBe('file_read');
			expect(tool.category).toBe('file');
			expect(tool.description).toBeDefined();
		});

		it('tool handler reads file successfully', async () => {
			await fs.writeFile(path.join(tmpDir, 'readme.md'), '# Hello');
			const tool = createFileReadTool(handler);
			const result = await (
				tool as { __handler: (args: Record<string, unknown>) => Promise<unknown> }
			).__handler({
				path: 'readme.md',
			});
			expect((result as { success: boolean }).success).toBe(true);
			expect((result as { content: string }).content).toContain('# Hello');
		});
	});

	describe('createFileWriteTool', () => {
		it('returns a valid tool definition', () => {
			const tool = createFileWriteTool(handler);
			expect(tool.name).toBe('file_write');
			expect(tool.category).toBe('file');
		});

		it('tool handler writes file successfully', async () => {
			const tool = createFileWriteTool(handler);
			const result = await (
				tool as { __handler: (args: Record<string, unknown>) => Promise<unknown> }
			).__handler({
				path: 'new.txt',
				content: 'written via tool',
			});
			expect((result as { success: boolean }).success).toBe(true);

			const content = await fs.readFile(path.join(tmpDir, 'new.txt'), 'utf-8');
			expect(content).toBe('written via tool');
		});
	});

	describe('createFileSummaryTool', () => {
		it('returns a valid tool definition', () => {
			const tool = createFileSummaryTool(handler);
			expect(tool.name).toBe('file_summary');
			expect(tool.category).toBe('file');
		});
	});
});
