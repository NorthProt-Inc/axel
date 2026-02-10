import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { ToolResult } from '@axel/core/types';
import { z } from 'zod';
import { defineTool } from '../mcp/tool-registry.js';

/** Configuration for file handler */
export interface FileHandlerConfig {
	readonly basePath: string;
	readonly maxFileSizeBytes: number;
	readonly allowedExtensions: readonly string[];
}

/** Result of reading a file */
export interface FileReadResult {
	readonly fileName: string;
	readonly content: string;
	readonly sizeBytes: number;
}

/** Result of summarizing a file */
export interface FileSummary {
	readonly fileName: string;
	readonly sizeBytes: number;
	readonly lineCount: number;
	readonly preview: string;
}

const PREVIEW_HEAD_LINES = 10;
const PREVIEW_TAIL_LINES = 10;

/**
 * File Handler — secure file read/write with path boundary enforcement.
 *
 * Security: All paths are validated against basePath to prevent directory traversal.
 * Extensions are checked against an allowlist.
 */
export class FileHandler {
	private readonly config: FileHandlerConfig;

	constructor(config: FileHandlerConfig) {
		this.config = config;
	}

	/** Validate and resolve a file path against basePath */
	private resolvePath(inputPath: string): string {
		const resolved = path.resolve(this.config.basePath, inputPath);
		if (!resolved.startsWith(this.config.basePath)) {
			throw new Error(`Path '${inputPath}' escapes base directory`);
		}
		return resolved;
	}

	/** Validate file extension against allowlist */
	private validateExtension(fileName: string): void {
		const ext = path.extname(fileName).toLowerCase();
		if (!this.config.allowedExtensions.includes(ext)) {
			throw new Error(`Extension not allowed: ${ext}`);
		}
	}

	async readFile(relativePath: string): Promise<FileReadResult> {
		this.validateExtension(relativePath);
		const fullPath = this.resolvePath(relativePath);

		const stat = await fs.stat(fullPath);
		if (stat.size > this.config.maxFileSizeBytes) {
			throw new Error(`File size ${stat.size} exceeds maximum ${this.config.maxFileSizeBytes}`);
		}

		const content = await fs.readFile(fullPath, 'utf-8');
		return {
			fileName: path.basename(relativePath),
			content,
			sizeBytes: stat.size,
		};
	}

	async writeFile(relativePath: string, content: string): Promise<void> {
		this.validateExtension(relativePath);
		const fullPath = this.resolvePath(relativePath);

		// Create parent directories if needed
		await fs.mkdir(path.dirname(fullPath), { recursive: true });
		await fs.writeFile(fullPath, content, 'utf-8');
	}

	async summarizeFile(relativePath: string): Promise<FileSummary> {
		this.validateExtension(relativePath);
		const fullPath = this.resolvePath(relativePath);

		const stat = await fs.stat(fullPath);
		const content = await fs.readFile(fullPath, 'utf-8');
		const lines = content.split('\n');

		let preview: string;
		if (lines.length <= PREVIEW_HEAD_LINES + PREVIEW_TAIL_LINES) {
			preview = content;
		} else {
			const head = lines.slice(0, PREVIEW_HEAD_LINES);
			const tail = lines.slice(-PREVIEW_TAIL_LINES);
			preview = [
				...head,
				`... (${lines.length - PREVIEW_HEAD_LINES - PREVIEW_TAIL_LINES} lines omitted) ...`,
				...tail,
			].join('\n');
		}

		return {
			fileName: path.basename(relativePath),
			sizeBytes: stat.size,
			lineCount: lines.length,
			preview,
		};
	}
}

// ─── Tool Definitions ───

const FileReadInputSchema = z.object({
	path: z.string().min(1).describe('Relative file path to read'),
});

const FileWriteInputSchema = z.object({
	path: z.string().min(1).describe('Relative file path to write'),
	content: z.string().describe('Content to write to the file'),
});

const FileSummaryInputSchema = z.object({
	path: z.string().min(1).describe('Relative file path to summarize'),
});

export function createFileReadTool(handler: FileHandler) {
	return defineTool({
		name: 'file_read',
		description:
			'Read a file and return its contents. Path must be relative to the base directory.',
		category: 'file',
		schema: FileReadInputSchema,
		handler: async (args): Promise<ToolResult> => {
			try {
				const result = await handler.readFile(args.path);
				return {
					callId: '',
					success: true,
					content: `File: ${result.fileName} (${result.sizeBytes} bytes)\n\n${result.content}`,
					error: undefined,
					durationMs: 0,
				};
			} catch (error) {
				return {
					callId: '',
					success: false,
					content: null,
					error: error instanceof Error ? error.message : String(error),
					durationMs: 0,
				};
			}
		},
	});
}

export function createFileWriteTool(handler: FileHandler) {
	return defineTool({
		name: 'file_write',
		description: 'Write content to a file. Path must be relative to the base directory.',
		category: 'file',
		schema: FileWriteInputSchema,
		requiresApproval: true,
		handler: async (args): Promise<ToolResult> => {
			try {
				await handler.writeFile(args.path, args.content);
				return {
					callId: '',
					success: true,
					content: `File written: ${args.path}`,
					error: undefined,
					durationMs: 0,
				};
			} catch (error) {
				return {
					callId: '',
					success: false,
					content: null,
					error: error instanceof Error ? error.message : String(error),
					durationMs: 0,
				};
			}
		},
	});
}

export function createFileSummaryTool(handler: FileHandler) {
	return defineTool({
		name: 'file_summary',
		description: 'Get a summary of a file including size, line count, and preview of head/tail.',
		category: 'file',
		schema: FileSummaryInputSchema,
		handler: async (args): Promise<ToolResult> => {
			try {
				const summary = await handler.summarizeFile(args.path);
				const content = [
					`File: ${summary.fileName}`,
					`Size: ${summary.sizeBytes} bytes`,
					`Lines: ${summary.lineCount}`,
					'',
					'Preview:',
					summary.preview,
				].join('\n');

				return {
					callId: '',
					success: true,
					content,
					error: undefined,
					durationMs: 0,
				};
			} catch (error) {
				return {
					callId: '',
					success: false,
					content: null,
					error: error instanceof Error ? error.message : String(error),
					durationMs: 0,
				};
			}
		},
	});
}
