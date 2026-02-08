import { renderMarkdown } from './renderer.js';
import { createCliTheme } from './theme.js';

/**
 * CLI output rendering functions for CliChannel integration.
 * These functions format Axel's responses, streaming output,
 * tool calls, and thinking indicators for terminal display.
 */

const MAX_TOOL_OUTPUT_LENGTH = 200;

export function renderAssistantMessage(content: string): string {
	if (content.length === 0) {
		return '';
	}
	const theme = createCliTheme();
	const rendered = renderMarkdown(content);
	return `${theme.accent('Axel')}${theme.dim(':')} ${rendered}`;
}

export function renderStreamStart(): string {
	const theme = createCliTheme();
	return `${theme.accent('Axel')}${theme.dim(':')} `;
}

export function renderStreamChunk(chunk: string): string {
	return chunk;
}

export function renderStreamEnd(): string {
	return '\n';
}

export function renderToolCall(
	toolName: string,
	input: Record<string, unknown>,
): string {
	const theme = createCliTheme();
	const inputSummary = Object.entries(input)
		.map(([k, v]) => `${k}=${JSON.stringify(v)}`)
		.join(', ');
	return theme.dim(`  ⚙ ${toolName}(${inputSummary})`);
}

export function renderToolResult(
	toolName: string,
	success: boolean,
	output: string,
): string {
	const theme = createCliTheme();
	const indicator = success ? theme.success('✓') : theme.error('✗');
	const truncated =
		output.length > MAX_TOOL_OUTPUT_LENGTH
			? `${output.slice(0, MAX_TOOL_OUTPUT_LENGTH)}...`
			: output;
	return `  ${indicator} ${theme.dim(toolName)} ${theme.muted(truncated)}`;
}

export function renderThinking(content: string): string {
	const theme = createCliTheme();
	return theme.muted(`  💭 ${content}`);
}
