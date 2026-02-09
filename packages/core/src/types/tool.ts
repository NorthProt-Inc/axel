/** Tool execution result */
export interface ToolResult {
	readonly callId: string;
	readonly success: boolean;
	readonly content: unknown;
	readonly error?: string | undefined;
	readonly durationMs: number;
}

/** Tool category classification */
export type ToolCategory = 'memory' | 'file' | 'iot' | 'research' | 'system' | 'agent' | 'search';

/** Tool definition (schema validated at runtime via Zod in infra layer) */
export interface ToolDefinition {
	readonly name: string;
	readonly description: string;
	readonly category: ToolCategory;
	readonly inputSchema: unknown;
	readonly requiresApproval: boolean;
}
