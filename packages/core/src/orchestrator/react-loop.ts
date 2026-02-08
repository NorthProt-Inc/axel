import { AxelError, PermanentError, ProviderError, TimeoutError } from '../types/errors.js';
import type { Message } from '../types/message.js';
import type { AxelErrorInfo, ReActEvent, ToolCallRequest } from '../types/react.js';
import type { LlmProvider, ReActConfig, ToolExecutor } from './types.js';

/** Parameters for the ReAct loop */
export interface ReActLoopParams {
	readonly messages: readonly Message[];
	readonly tools: readonly import('../types/tool.js').ToolDefinition[];
	readonly llmProvider: LlmProvider;
	readonly toolExecutor: ToolExecutor;
	readonly config: ReActConfig;
}

// ─── Internal State ───

interface LoopState {
	readonly messages: Message[];
	readonly startTime: number;
	readonly config: ReActConfig;
}

/** Check if total timeout has been exceeded */
function isTimedOut(state: LoopState): boolean {
	return Date.now() - state.startTime >= state.config.totalTimeoutMs;
}

/** Create timeout error event */
function timeoutEvent(config: ReActConfig): ReActEvent {
	return {
		type: 'error',
		error: toErrorInfo(new TimeoutError('ReAct loop total timeout', config.totalTimeoutMs)),
	};
}

/** Create done event with token usage */
function doneEvent(): ReActEvent {
	return {
		type: 'done',
		usage: {
			inputTokens: 0,
			outputTokens: 0,
			cacheReadTokens: 0,
			cacheCreationTokens: 0,
		},
	};
}

// ─── Chunk Processing ───

/** Convert an LLM chunk to a ReActEvent (text/thinking only) */
function chunkToEvent(chunk: { type: string; content: unknown }): ReActEvent | null {
	if (chunk.type === 'text') {
		return { type: 'message_delta', content: chunk.content as string };
	}
	if (chunk.type === 'thinking') {
		return { type: 'thinking_delta', content: chunk.content as string };
	}
	return null;
}

/** Execute a tool call and append result/error to messages */
async function executeToolCall(
	call: ToolCallRequest,
	executor: ToolExecutor,
	state: LoopState,
): Promise<ReActEvent> {
	try {
		const result = await executor.execute(call, state.config.toolTimeoutMs);
		state.messages.push(makeToolMessage(call, result));
		return { type: 'tool_result', result };
	} catch (toolErr) {
		state.messages.push(makeToolErrorMessage(call, toolErr));
		return { type: 'error', error: toErrorInfo(toolErr) };
	}
}

// ─── LLM Iteration ───

/** Result of a single LLM iteration */
interface IterationResult {
	readonly events: ReActEvent[];
	readonly hadToolCall: boolean;
	readonly timedOut: boolean;
}

/** Run one LLM call iteration, collecting events */
async function runIteration(
	provider: LlmProvider,
	executor: ToolExecutor,
	state: LoopState,
	tools: readonly import('../types/tool.js').ToolDefinition[],
): Promise<IterationResult> {
	const events: ReActEvent[] = [];
	let hadToolCall = false;

	for await (const chunk of provider.chat({ messages: state.messages, tools })) {
		if (isTimedOut(state)) {
			events.push(timeoutEvent(state.config));
			return { events, hadToolCall, timedOut: true };
		}

		const simpleEvent = chunkToEvent(chunk);
		if (simpleEvent) {
			events.push(simpleEvent);
			continue;
		}

		if (chunk.type === 'tool_call') {
			hadToolCall = true;
			const call = chunk.content as ToolCallRequest;
			events.push({ type: 'tool_call', tool: call });
			events.push(await executeToolCall(call, executor, state));
		}
	}

	return { events, hadToolCall, timedOut: false };
}

// ─── Main Loop ───

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
export async function* reactLoop(params: ReActLoopParams): AsyncGenerator<ReActEvent> {
	const { llmProvider, toolExecutor, config } = params;
	const state: LoopState = {
		messages: [...params.messages],
		startTime: Date.now(),
		config,
	};
	let iteration = 0;

	while (iteration < config.maxIterations) {
		if (isTimedOut(state)) {
			yield timeoutEvent(config);
			break;
		}

		const result = await runIterationSafe(llmProvider, toolExecutor, state, params.tools);

		for (const event of result.events) {
			yield event;
		}

		if (result.shouldStop) {
			break;
		}

		if (result.shouldRetry) {
			await delay(exponentialBackoff(iteration));
			iteration++;
			continue;
		}

		if (!result.hadToolCall) {
			break;
		}

		iteration++;
	}

	if (iteration >= config.maxIterations) {
		yield {
			type: 'error',
			error: toErrorInfo(new PermanentError('ReAct loop max iterations exceeded')),
		};
	}

	yield doneEvent();
}

/** Wrapper result for iteration with error handling */
interface SafeIterationResult {
	readonly events: ReActEvent[];
	readonly hadToolCall: boolean;
	readonly shouldStop: boolean;
	readonly shouldRetry: boolean;
}

/** Run one iteration with error handling for LLM provider errors */
async function runIterationSafe(
	provider: LlmProvider,
	executor: ToolExecutor,
	state: LoopState,
	tools: readonly import('../types/tool.js').ToolDefinition[],
): Promise<SafeIterationResult> {
	try {
		const result = await runIteration(provider, executor, state, tools);
		return {
			events: result.events,
			hadToolCall: result.hadToolCall,
			shouldStop: result.timedOut,
			shouldRetry: false,
		};
	} catch (err) {
		if (err instanceof ProviderError && err.isRetryable) {
			return {
				events: [{ type: 'error', error: toErrorInfo(err) }],
				hadToolCall: false,
				shouldStop: false,
				shouldRetry: true,
			};
		}
		return {
			events: [{ type: 'error', error: toErrorInfo(err) }],
			hadToolCall: false,
			shouldStop: true,
			shouldRetry: false,
		};
	}
}

// ─── Utilities ───

/** Convert any error to serializable AxelErrorInfo */
function toErrorInfo(err: unknown): AxelErrorInfo {
	if (err instanceof AxelError) {
		return { code: err.code, message: err.message, isRetryable: err.isRetryable };
	}
	const message = err instanceof Error ? err.message : String(err);
	return { code: 'PERMANENT', message, isRetryable: false };
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function exponentialBackoff(attempt: number): number {
	return Math.min(100 * 2 ** attempt, 5_000);
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
		content: JSON.stringify({ callId: call.callId, error: message }),
		channelId: null,
		timestamp: new Date(),
		emotionalContext: '',
		metadata: { toolName: call.toolName, callId: call.callId, error: true },
	};
}
