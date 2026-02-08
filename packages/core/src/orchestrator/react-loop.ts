import type { AxelErrorInfo, ReActEvent, ToolCallRequest } from '../types/react.js';
import type { TokenUsage } from '../types/common.js';
import type { Message } from '../types/message.js';
import type { ToolDefinition } from '../types/tool.js';
import {
	AxelError,
	PermanentError,
	ProviderError,
	TimeoutError,
} from '../types/errors.js';
import type {
	LlmChatChunk,
	LlmProvider,
	ReActConfig,
	ToolExecutor,
} from './types.js';

/** Parameters for the ReAct loop */
export interface ReActLoopParams {
	readonly messages: readonly Message[];
	readonly tools: readonly ToolDefinition[];
	readonly llmProvider: LlmProvider;
	readonly toolExecutor: ToolExecutor;
	readonly config: ReActConfig;
}

/** Convert any error to serializable AxelErrorInfo */
function toErrorInfo(err: unknown): AxelErrorInfo {
	if (err instanceof AxelError) {
		return {
			code: err.code,
			message: err.message,
			isRetryable: err.isRetryable,
		};
	}
	const message = err instanceof Error ? err.message : String(err);
	return {
		code: 'PERMANENT',
		message,
		isRetryable: false,
	};
}

/** Simple delay for retry backoff */
function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Exponential backoff: 100ms, 200ms, 400ms, ... capped at 5s */
function exponentialBackoff(attempt: number): number {
	return Math.min(100 * 2 ** attempt, 5_000);
}

/**
 * ReAct Loop — reasoning-action cycle (plan §4.6, ADR-020).
 *
 * Streams ReActEvents via AsyncGenerator. Each iteration:
 * 1. Call LLM with current messages + tools
 * 2. If LLM returns text → yield message_delta, break
 * 3. If LLM returns tool_call → execute tool, yield events, loop
 *
 * Error recovery per ADR-020:
 * - Retryable ProviderError → exponential backoff retry
 * - Permanent ProviderError → yield error, stop
 * - ToolError → yield error info to LLM for alternative action
 * - Total timeout → yield timeout error, stop
 */
export async function* reactLoop(
	params: ReActLoopParams,
): AsyncGenerator<ReActEvent> {
	const { llmProvider, toolExecutor, config } = params;
	const startTime = Date.now();
	let iteration = 0;
	let totalInputTokens = 0;
	let totalOutputTokens = 0;

	// Mutable messages array for appending tool results
	const messages: Message[] = [...params.messages];

	while (iteration < config.maxIterations) {
		// Check total timeout before LLM call
		if (Date.now() - startTime >= config.totalTimeoutMs) {
			yield {
				type: 'error',
				error: toErrorInfo(
					new TimeoutError('ReAct loop total timeout', config.totalTimeoutMs),
				),
			};
			break;
		}

		let hadToolCall = false;
		let llmSucceeded = false;

		try {
			for await (const chunk of llmProvider.chat({
				messages,
				tools: params.tools,
			})) {
				// Check timeout during streaming
				if (Date.now() - startTime >= config.totalTimeoutMs) {
					yield {
						type: 'error',
						error: toErrorInfo(
							new TimeoutError(
								'ReAct loop total timeout',
								config.totalTimeoutMs,
							),
						),
					};
					return yieldDone(totalInputTokens, totalOutputTokens);
				}

				if (chunk.type === 'text') {
					yield { type: 'message_delta', content: chunk.content };
				} else if (chunk.type === 'thinking') {
					yield { type: 'thinking_delta', content: chunk.content };
				} else if (chunk.type === 'tool_call') {
					hadToolCall = true;
					yield { type: 'tool_call', tool: chunk.content };

					try {
						const result = await toolExecutor.execute(
							chunk.content,
							config.toolTimeoutMs,
						);
						yield { type: 'tool_result', result };
						// Append tool result as message for next iteration
						messages.push(makeToolMessage(chunk.content, result));
					} catch (toolErr) {
						yield { type: 'error', error: toErrorInfo(toolErr) };
						// Inform LLM about the error
						messages.push(makeToolErrorMessage(chunk.content, toolErr));
					}
				}
			}
			llmSucceeded = true;
		} catch (err) {
			if (err instanceof ProviderError && err.isRetryable) {
				yield { type: 'error', error: toErrorInfo(err) };
				await delay(exponentialBackoff(iteration));
				iteration++;
				continue;
			}
			// Non-retryable or unknown error — stop
			yield { type: 'error', error: toErrorInfo(err) };
			break;
		}

		if (!hadToolCall) {
			// LLM produced final text response — loop ends
			break;
		}

		iteration++;
	}

	// Check if we hit max iterations
	if (iteration >= config.maxIterations) {
		yield {
			type: 'error',
			error: toErrorInfo(
				new PermanentError('ReAct loop max iterations exceeded'),
			),
		};
	}

	yield {
		type: 'done',
		usage: {
			inputTokens: totalInputTokens,
			outputTokens: totalOutputTokens,
			cacheReadTokens: 0,
			cacheCreationTokens: 0,
		},
	};
}

function* yieldDone(
	inputTokens: number,
	outputTokens: number,
): Generator<ReActEvent> {
	yield {
		type: 'done',
		usage: {
			inputTokens,
			outputTokens,
			cacheReadTokens: 0,
			cacheCreationTokens: 0,
		},
	};
}

function makeToolMessage(call: ToolCallRequest, result: unknown): Message {
	return {
		sessionId: '',
		turnId: 0,
		role: 'tool',
		content: JSON.stringify({ callId: call.callId, result }),
		channelId: null,
		timestamp: new Date(),
		emotionalContext: '',
		metadata: { toolName: call.toolName, callId: call.callId },
	};
}

function makeToolErrorMessage(call: ToolCallRequest, err: unknown): Message {
	const message = err instanceof Error ? err.message : String(err);
	return {
		sessionId: '',
		turnId: 0,
		role: 'tool',
		content: JSON.stringify({
			callId: call.callId,
			error: message,
		}),
		channelId: null,
		timestamp: new Date(),
		emotionalContext: '',
		metadata: { toolName: call.toolName, callId: call.callId, error: true },
	};
}
