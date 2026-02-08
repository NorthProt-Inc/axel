import type { TokenUsage } from './common.js';
import type { ToolResult } from './tool.js';

/** Tool invocation request */
export interface ToolCallRequest {
	readonly toolName: string;
	readonly args: unknown;
	readonly callId: string;
}

/** Serializable error info for ReAct events */
export interface AxelErrorInfo {
	readonly code: string;
	readonly message: string;
	readonly isRetryable: boolean;
}

/** ReAct loop streaming event (discriminated union) */
export type ReActEvent =
	| { readonly type: 'message_delta'; readonly content: string }
	| { readonly type: 'thinking_delta'; readonly content: string }
	| { readonly type: 'tool_call'; readonly tool: ToolCallRequest }
	| { readonly type: 'tool_result'; readonly result: ToolResult }
	| { readonly type: 'error'; readonly error: AxelErrorInfo }
	| { readonly type: 'done'; readonly usage: TokenUsage };
