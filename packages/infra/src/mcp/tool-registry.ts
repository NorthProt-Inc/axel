import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { ToolExecutor } from '@axel/core/orchestrator';
import { ToolError } from '@axel/core/types';
import type { ToolCallRequest, ToolCategory, ToolDefinition, ToolResult } from '@axel/core/types';
import { z } from 'zod';

/** Handler function type for tool execution */
type ToolHandler = (args: Record<string, unknown>) => Promise<ToolResult>;

/** Internal tool registration entry */
interface RegisteredTool {
	readonly definition: ToolDefinition;
	readonly schema: z.ZodSchema;
	readonly handler: ToolHandler;
}

/** Configuration for defineTool */
interface DefineToolConfig<T extends z.ZodSchema> {
	readonly name: string;
	readonly description: string;
	readonly category: ToolCategory;
	readonly schema: T;
	readonly requiresApproval?: boolean;
	readonly handler: (args: z.infer<T>) => Promise<ToolResult>;
}

/** McpToolExecutor options */
interface McpToolExecutorOptions {
	readonly commandAllowlist?: readonly string[];
	readonly basePath?: string;
}

/**
 * Convert a Zod schema to a JSON Schema-like object.
 * Simplified conversion: uses Zod's shape for object schemas.
 */
function zodToJsonSchema(schema: z.ZodSchema): unknown {
	if (schema instanceof z.ZodObject) {
		const shape = schema.shape as Record<string, z.ZodTypeAny>;
		const properties: Record<string, unknown> = {};
		const required: string[] = [];

		for (const [key, value] of Object.entries(shape)) {
			properties[key] = { type: getZodTypeName(value) };
			if (!value.isOptional()) {
				required.push(key);
			}
		}

		return {
			type: 'object',
			properties,
			...(required.length > 0 ? { required } : {}),
		};
	}
	return { type: 'object' };
}

function getZodTypeName(schema: z.ZodTypeAny): string {
	if (schema instanceof z.ZodString) return 'string';
	if (schema instanceof z.ZodNumber) return 'number';
	if (schema instanceof z.ZodBoolean) return 'boolean';
	if (schema instanceof z.ZodArray) return 'array';
	if (schema instanceof z.ZodObject) return 'object';
	if (schema instanceof z.ZodEnum) return 'string';
	if (schema instanceof z.ZodDefault) return getZodTypeName(schema._def.innerType as z.ZodTypeAny);
	if (schema instanceof z.ZodOptional) return getZodTypeName(schema._def.innerType as z.ZodTypeAny);
	return 'string';
}

/** Dangerous shell metacharacters per ADR-019 */
const SHELL_METACHARACTERS = /[;&|`$(){}[\]<>!#~]/;

/**
 * Validate command arguments for shell metacharacters.
 *
 * Security: prevents command injection via argument pollution (ADR-019).
 * Recursively checks all string values in the args object.
 */
function validateCommandArgs(args: Record<string, unknown>): string | null {
	for (const [key, value] of Object.entries(args)) {
		if (typeof value === 'string' && SHELL_METACHARACTERS.test(value)) {
			return `Argument '${key}' contains disallowed shell metacharacters`;
		}
		if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
			const nestedError = validateCommandArgs(value as Record<string, unknown>);
			if (nestedError) return nestedError;
		}
	}
	return null; // valid
}

/**
 * Validate cwd parameter against a base path.
 *
 * Security: prevents directory traversal via cwd (ADR-019).
 * Ensures the resolved cwd stays within the base directory boundary.
 */
function validateCwd(cwd: unknown, basePath: string): string | null {
	if (cwd === undefined || cwd === null) return null;
	if (typeof cwd !== 'string') return 'cwd must be a string';
	const resolved = path.resolve(basePath, cwd);
	if (!resolved.startsWith(basePath)) {
		return `cwd '${cwd}' escapes base directory`;
	}
	return null; // valid
}

/**
 * Define a tool with Zod schema validation and handler.
 *
 * Returns a ToolDefinition (core type) and stores the handler internally.
 * Plan §4.5 Layer 6: single registration point.
 */
function defineTool<T extends z.ZodSchema>(
	config: DefineToolConfig<T>,
): ToolDefinition & { readonly __handler: ToolHandler; readonly __schema: z.ZodSchema } {
	const jsonSchema = zodToJsonSchema(config.schema);

	return {
		name: config.name,
		description: config.description,
		category: config.category,
		inputSchema: jsonSchema,
		requiresApproval: config.requiresApproval ?? false,
		__handler: config.handler as ToolHandler,
		__schema: config.schema,
	};
}

/**
 * Tool Registry — manages tool definitions and handlers.
 *
 * Plan §4.5 Layer 6: MCP-compatible tool registry.
 * Single registration point, no duplicate names.
 */
class ToolRegistry {
	private readonly tools = new Map<string, RegisteredTool>();

	register(
		tool: ToolDefinition & { readonly __handler?: ToolHandler; readonly __schema?: z.ZodSchema },
	): void {
		if (this.tools.has(tool.name)) {
			throw new Error(`Tool '${tool.name}' is already registered`);
		}

		this.tools.set(tool.name, {
			definition: {
				name: tool.name,
				description: tool.description,
				category: tool.category,
				inputSchema: tool.inputSchema,
				requiresApproval: tool.requiresApproval,
			},
			schema: tool.__schema ?? z.object({}),
			handler:
				tool.__handler ??
				(async () => ({
					callId: '',
					success: false,
					content: null,
					error: 'No handler',
					durationMs: 0,
				})),
		});
	}

	get(name: string): ToolDefinition | undefined {
		return this.tools.get(name)?.definition;
	}

	getRegistered(name: string): RegisteredTool | undefined {
		return this.tools.get(name);
	}

	listAll(): readonly ToolDefinition[] {
		return [...this.tools.values()].map((t) => t.definition);
	}

	listByCategory(category: ToolCategory): readonly ToolDefinition[] {
		return [...this.tools.values()]
			.filter((t) => t.definition.category === category)
			.map((t) => t.definition);
	}
}

/**
 * MCP Tool Executor — implements ToolExecutor interface from core.
 *
 * Validates input via Zod, enforces command allowlist (ADR-010),
 * executes handler with timeout.
 */
class McpToolExecutor implements ToolExecutor {
	private readonly registry: ToolRegistry;
	private readonly options: McpToolExecutorOptions;

	constructor(registry: ToolRegistry, options?: McpToolExecutorOptions) {
		this.registry = registry;
		this.options = options ?? {};
	}

	async execute(call: ToolCallRequest, timeoutMs: number): Promise<ToolResult> {
		const startTime = Date.now();
		const registered = this.registry.getRegistered(call.toolName);

		if (!registered) {
			return {
				callId: call.callId,
				success: false,
				content: null,
				error: `Tool '${call.toolName}' not found`,
				durationMs: Date.now() - startTime,
			};
		}

		// Command allowlist enforcement (ADR-010)
		if (this.options.commandAllowlist && call.toolName === 'execute_command') {
			const command = (call.args as Record<string, unknown>)['command'];
			if (typeof command === 'string' && !this.options.commandAllowlist.includes(command)) {
				return {
					callId: call.callId,
					success: false,
					content: null,
					error: `Command '${command}' not in allowlist`,
					durationMs: Date.now() - startTime,
				};
			}
		}

		// Validate input with Zod
		const parsed = registered.schema.safeParse(call.args);
		if (!parsed.success) {
			return {
				callId: call.callId,
				success: false,
				content: null,
				error: `Validation failed: ${parsed.error.message}`,
				durationMs: Date.now() - startTime,
			};
		}

		// Validate command arguments for shell metacharacters (GAP-CMD-001)
		const argsError = validateCommandArgs(parsed.data as Record<string, unknown>);
		if (argsError) {
			return {
				callId: call.callId,
				success: false,
				content: null,
				error: argsError,
				durationMs: Date.now() - startTime,
			};
		}

		// Validate cwd if basePath is set (GAP-CMD-001)
		if (this.options.basePath) {
			const cwdValue = (parsed.data as Record<string, unknown>)['cwd'];
			const cwdError = validateCwd(cwdValue, this.options.basePath);
			if (cwdError) {
				return {
					callId: call.callId,
					success: false,
					content: null,
					error: cwdError,
					durationMs: Date.now() - startTime,
				};
			}
		}

		// Execute with timeout
		try {
			const result = await Promise.race([
				registered.handler(parsed.data as Record<string, unknown>),
				new Promise<never>((_, reject) =>
					setTimeout(
						() => reject(new ToolError('Tool execution timeout', call.toolName, true)),
						timeoutMs,
					),
				),
			]);

			return {
				...result,
				callId: call.callId,
				durationMs: Date.now() - startTime,
			};
		} catch (error) {
			return {
				callId: call.callId,
				success: false,
				content: null,
				error: error instanceof Error ? error.message : String(error),
				durationMs: Date.now() - startTime,
			};
		}
	}
}

/**
 * Validate a file path against a base directory boundary.
 *
 * Security: prevents directory traversal (ADR-010, CONSTITUTION security rules).
 * Resolves symlinks via fs.realpath and ensures the result is within basePath.
 */
async function validatePath(inputPath: string, basePath: string): Promise<string> {
	const resolved = path.resolve(basePath, inputPath);
	if (!resolved.startsWith(basePath)) {
		throw new Error(`Path '${inputPath}' escapes base directory '${basePath}'`);
	}

	// Resolve symlinks to prevent symlink-based traversal
	let realResolved: string;
	try {
		realResolved = await fs.realpath(resolved);
	} catch {
		// Path does not exist yet — use the resolved path (for new file creation)
		realResolved = resolved;
	}

	if (!realResolved.startsWith(basePath)) {
		throw new Error(`Path '${inputPath}' resolves outside base directory '${basePath}'`);
	}
	return realResolved;
}

export {
	defineTool,
	ToolRegistry,
	McpToolExecutor,
	validatePath,
	type ToolHandler,
	type RegisteredTool,
	type DefineToolConfig,
	type McpToolExecutorOptions,
};
