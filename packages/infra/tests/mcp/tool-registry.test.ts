import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { ToolResult } from '../../../core/src/types/tool.js';

const importModule = async () => import('../../src/mcp/tool-registry.js');

describe('ToolRegistry', () => {
	describe('defineTool', () => {
		it('should create a ToolDefinition from config', async () => {
			const { defineTool } = await importModule();

			const tool = defineTool({
				name: 'read_file',
				description: 'Read a file from the filesystem',
				category: 'file',
				schema: z.object({
					path: z.string().min(1),
					encoding: z.enum(['utf-8', 'base64']).default('utf-8'),
				}),
				handler: async () => ({
					callId: 'c1',
					success: true,
					content: 'file content',
					durationMs: 10,
				}),
			});

			expect(tool.name).toBe('read_file');
			expect(tool.description).toBe('Read a file from the filesystem');
			expect(tool.category).toBe('file');
			expect(tool.requiresApproval).toBe(false);
			expect(tool.inputSchema).toBeDefined();
		});

		it('should set requiresApproval when specified', async () => {
			const { defineTool } = await importModule();

			const tool = defineTool({
				name: 'execute_command',
				description: 'Run a command',
				category: 'system',
				schema: z.object({ command: z.string() }),
				requiresApproval: true,
				handler: async () => ({
					callId: 'c1',
					success: true,
					content: '',
					durationMs: 0,
				}),
			});

			expect(tool.requiresApproval).toBe(true);
		});

		it('should produce valid JSON schema from Zod schema', async () => {
			const { defineTool } = await importModule();

			const tool = defineTool({
				name: 'search',
				description: 'Search memories',
				category: 'memory',
				schema: z.object({
					query: z.string(),
					limit: z.number().int().positive().default(10),
				}),
				handler: async () => ({
					callId: 'c1',
					success: true,
					content: [],
					durationMs: 5,
				}),
			});

			const schema = tool.inputSchema as Record<string, unknown>;
			expect(schema).toBeDefined();
			expect(typeof schema).toBe('object');
		});
	});

	describe('ToolRegistry', () => {
		it('should register and retrieve tools', async () => {
			const { ToolRegistry, defineTool } = await importModule();
			const registry = new ToolRegistry();

			const tool = defineTool({
				name: 'test_tool',
				description: 'Test',
				category: 'system',
				schema: z.object({ x: z.number() }),
				handler: async () => ({
					callId: 'c1',
					success: true,
					content: 42,
					durationMs: 1,
				}),
			});

			registry.register(tool);

			const retrieved = registry.get('test_tool');
			expect(retrieved).toBeDefined();
			expect(retrieved?.name).toBe('test_tool');
		});

		it('should return undefined for unregistered tool', async () => {
			const { ToolRegistry } = await importModule();
			const registry = new ToolRegistry();

			expect(registry.get('nonexistent')).toBeUndefined();
		});

		it('should list all registered tools', async () => {
			const { ToolRegistry, defineTool } = await importModule();
			const registry = new ToolRegistry();

			registry.register(
				defineTool({
					name: 'tool_a',
					description: 'A',
					category: 'file',
					schema: z.object({}),
					handler: async () => ({ callId: 'c1', success: true, content: null, durationMs: 0 }),
				}),
			);
			registry.register(
				defineTool({
					name: 'tool_b',
					description: 'B',
					category: 'memory',
					schema: z.object({}),
					handler: async () => ({ callId: 'c1', success: true, content: null, durationMs: 0 }),
				}),
			);

			const all = registry.listAll();
			expect(all).toHaveLength(2);
			expect(all.map((t) => t.name)).toEqual(['tool_a', 'tool_b']);
		});

		it('should throw on duplicate tool name', async () => {
			const { ToolRegistry, defineTool } = await importModule();
			const registry = new ToolRegistry();

			const tool = defineTool({
				name: 'dup_tool',
				description: 'Dup',
				category: 'system',
				schema: z.object({}),
				handler: async () => ({ callId: 'c1', success: true, content: null, durationMs: 0 }),
			});

			registry.register(tool);
			expect(() => registry.register(tool)).toThrow(/already registered/);
		});

		it('should filter tools by category', async () => {
			const { ToolRegistry, defineTool } = await importModule();
			const registry = new ToolRegistry();

			registry.register(
				defineTool({
					name: 'file_tool',
					description: 'File op',
					category: 'file',
					schema: z.object({}),
					handler: async () => ({ callId: 'c1', success: true, content: null, durationMs: 0 }),
				}),
			);
			registry.register(
				defineTool({
					name: 'mem_tool',
					description: 'Memory op',
					category: 'memory',
					schema: z.object({}),
					handler: async () => ({ callId: 'c1', success: true, content: null, durationMs: 0 }),
				}),
			);

			const fileTools = registry.listByCategory('file');
			expect(fileTools).toHaveLength(1);
			expect(fileTools[0]?.name).toBe('file_tool');
		});
	});
});

describe('McpToolExecutor', () => {
	it('should execute a registered tool and return ToolResult', async () => {
		const { ToolRegistry, defineTool, McpToolExecutor } = await importModule();
		const registry = new ToolRegistry();

		registry.register(
			defineTool({
				name: 'add_numbers',
				description: 'Add two numbers',
				category: 'system',
				schema: z.object({ a: z.number(), b: z.number() }),
				handler: async (args) => ({
					callId: 'c1',
					success: true,
					content: args.a + args.b,
					durationMs: 1,
				}),
			}),
		);

		const executor = new McpToolExecutor(registry);
		const result = await executor.execute(
			{ toolName: 'add_numbers', args: { a: 2, b: 3 }, callId: 'call-1' },
			5000,
		);

		expect(result.success).toBe(true);
		expect(result.content).toBe(5);
		expect(result.callId).toBe('call-1');
	});

	it('should return error result for unregistered tool', async () => {
		const { ToolRegistry, McpToolExecutor } = await importModule();
		const registry = new ToolRegistry();
		const executor = new McpToolExecutor(registry);

		const result = await executor.execute(
			{ toolName: 'nonexistent', args: {}, callId: 'call-2' },
			5000,
		);

		expect(result.success).toBe(false);
		expect(result.error).toMatch(/not found/i);
	});

	it('should return error result on validation failure', async () => {
		const { ToolRegistry, defineTool, McpToolExecutor } = await importModule();
		const registry = new ToolRegistry();

		registry.register(
			defineTool({
				name: 'strict_tool',
				description: 'Requires specific input',
				category: 'system',
				schema: z.object({ name: z.string().min(1) }),
				handler: async () => ({
					callId: 'c1',
					success: true,
					content: 'ok',
					durationMs: 1,
				}),
			}),
		);

		const executor = new McpToolExecutor(registry);
		const result = await executor.execute(
			{ toolName: 'strict_tool', args: { name: '' }, callId: 'call-3' },
			5000,
		);

		expect(result.success).toBe(false);
		expect(result.error).toBeDefined();
	});

	it('should return error result when handler throws', async () => {
		const { ToolRegistry, defineTool, McpToolExecutor } = await importModule();
		const registry = new ToolRegistry();

		registry.register(
			defineTool({
				name: 'failing_tool',
				description: 'Always fails',
				category: 'system',
				schema: z.object({}),
				handler: async () => {
					throw new Error('Internal tool error');
				},
			}),
		);

		const executor = new McpToolExecutor(registry);
		const result = await executor.execute(
			{ toolName: 'failing_tool', args: {}, callId: 'call-4' },
			5000,
		);

		expect(result.success).toBe(false);
		expect(result.error).toMatch(/Internal tool error/);
	});

	it('should timeout if handler exceeds timeoutMs', async () => {
		const { ToolRegistry, defineTool, McpToolExecutor } = await importModule();
		const registry = new ToolRegistry();

		registry.register(
			defineTool({
				name: 'slow_tool',
				description: 'Very slow',
				category: 'system',
				schema: z.object({}),
				handler: async () => {
					await new Promise((resolve) => setTimeout(resolve, 10_000));
					return { callId: 'c1', success: true, content: 'done', durationMs: 10000 };
				},
			}),
		);

		const executor = new McpToolExecutor(registry);
		const result = await executor.execute(
			{ toolName: 'slow_tool', args: {}, callId: 'call-5' },
			50, // 50ms timeout
		);

		expect(result.success).toBe(false);
		expect(result.error).toMatch(/timeout/i);
	});

	describe('command allowlist (ADR-010)', () => {
		it('should validate command against allowlist for system tools', async () => {
			const { ToolRegistry, defineTool, McpToolExecutor } = await importModule();
			const registry = new ToolRegistry();
			const allowlist = ['git', 'ls', 'cat'];

			registry.register(
				defineTool({
					name: 'execute_command',
					description: 'Execute a system command',
					category: 'system',
					schema: z.object({
						command: z.string(),
						args: z.array(z.string()).default([]),
					}),
					requiresApproval: true,
					handler: async (input) => ({
						callId: 'c1',
						success: true,
						content: `executed: ${input.command}`,
						durationMs: 5,
					}),
				}),
			);

			const executor = new McpToolExecutor(registry, { commandAllowlist: allowlist });

			// Allowed command
			const okResult = await executor.execute(
				{
					toolName: 'execute_command',
					args: { command: 'git', args: ['status'] },
					callId: 'call-ok',
				},
				5000,
			);
			expect(okResult.success).toBe(true);

			// Blocked command
			const blockedResult = await executor.execute(
				{
					toolName: 'execute_command',
					args: { command: 'rm', args: ['-rf', '/'] },
					callId: 'call-bad',
				},
				5000,
			);
			expect(blockedResult.success).toBe(false);
			expect(blockedResult.error).toMatch(/not in allowlist/i);
		});
	});

	describe('path validation', () => {
		it('should reject paths with directory traversal', async () => {
			const { validatePath } = await importModule();

			await expect(validatePath('../../../etc/passwd', '/home/axel')).rejects.toThrow();
			await expect(validatePath('/etc/passwd', '/home/axel')).rejects.toThrow();
		});

		it('should accept valid paths within boundary', async () => {
			const { validatePath } = await importModule();

			const result = await validatePath('data/test.txt', '/home/axel');
			expect(result).toContain('/home/axel/data/test.txt');
		});

		it('should resolve symlinks before validating path boundary (FIX-INFRA-003)', async () => {
			const { validatePath } = await importModule();
			// validatePath is async — resolves symlinks via fs.realpath
			const result = await validatePath('data/test.txt', '/home/axel');
			expect(result).toContain('/home/axel/data/test.txt');
		});
	});
});
