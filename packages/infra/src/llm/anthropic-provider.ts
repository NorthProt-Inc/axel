import type {
	LlmChatChunk,
	LlmChatParams,
	LlmProvider,
} from '@axel/core/orchestrator';
import { ProviderError } from '@axel/core/types';
import type { ToolCallRequest } from '@axel/core/types';

/** Anthropic SDK stream event subset */
interface AnthropicStreamEvent {
	readonly type: string;
	readonly index?: number;
	readonly delta?: {
		readonly type: string;
		readonly text?: string;
		readonly thinking?: string;
		readonly partial_json?: string;
	};
	readonly content_block?: {
		readonly type: string;
		readonly id?: string;
		readonly name?: string;
	};
}

/** Anthropic Messages API client interface */
interface AnthropicClient {
	messages: {
		create(params: Record<string, unknown>): AsyncIterable<AnthropicStreamEvent>;
	};
}

/** Configuration for the Anthropic provider */
interface AnthropicProviderConfig {
	readonly model: string;
	readonly maxTokens: number;
}

/** Mutable state for tracking tool call accumulation */
interface ToolCallState {
	id: string | null;
	name: string | null;
	json: string;
}

const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504, 529]);

function isRetryableStatus(error: unknown): boolean {
	if (typeof error === 'object' && error !== null && 'status' in error) {
		return RETRYABLE_STATUS_CODES.has((error as { status: number }).status);
	}
	return false;
}

/**
 * Anthropic LLM Provider (ADR-020, ADR-021).
 *
 * Implements LlmProvider interface using Anthropic Messages API.
 * Streaming-first: returns AsyncIterable<LlmChatChunk>.
 */
class AnthropicLlmProvider implements LlmProvider {
	private readonly client: AnthropicClient;
	private readonly config: AnthropicProviderConfig;

	constructor(client: AnthropicClient, config: AnthropicProviderConfig) {
		this.client = client;
		this.config = config;
	}

	async *chat(params: LlmChatParams): AsyncIterable<LlmChatChunk> {
		const anthropicParams = this.buildRequestParams(params);

		let stream: AsyncIterable<AnthropicStreamEvent>;
		try {
			stream = this.client.messages.create(anthropicParams);
		} catch (error) {
			throw this.wrapError(error);
		}

		yield* this.processStream(stream);
	}

	private buildRequestParams(params: LlmChatParams): Record<string, unknown> {
		const { messages, tools } = params;
		const systemMessages = messages.filter((m) => m.role === 'system');
		const nonSystemMessages = messages.filter((m) => m.role !== 'system');

		const result: Record<string, unknown> = {
			model: this.config.model,
			max_tokens: this.config.maxTokens,
			stream: true,
			messages: nonSystemMessages.map((m) => ({
				role: m.role === 'assistant' ? 'assistant' : 'user',
				content: m.content,
			})),
		};

		if (systemMessages.length > 0) {
			result.system = systemMessages.map((m) => m.content).join('\n');
		}

		if (tools.length > 0) {
			result.tools = tools.map((t) => ({
				name: t.name,
				description: t.description,
				input_schema: t.inputSchema,
			}));
		}

		return result;
	}

	private async *processStream(
		stream: AsyncIterable<AnthropicStreamEvent>,
	): AsyncIterable<LlmChatChunk> {
		const toolState: ToolCallState = { id: null, name: null, json: '' };

		try {
			for await (const event of stream) {
				yield* this.handleEvent(event, toolState);
			}
		} catch (error) {
			throw this.wrapError(error);
		}
	}

	private *handleEvent(
		event: AnthropicStreamEvent,
		toolState: ToolCallState,
	): Iterable<LlmChatChunk> {
		if (event.type === 'content_block_start') {
			this.handleBlockStart(event, toolState);
			return;
		}

		if (event.type === 'content_block_delta' && event.delta) {
			yield* this.handleDelta(event.delta, toolState);
			return;
		}

		if (event.type === 'content_block_stop') {
			yield* this.handleBlockStop(toolState);
		}
	}

	private handleBlockStart(event: AnthropicStreamEvent, toolState: ToolCallState): void {
		if (event.content_block?.type === 'tool_use') {
			toolState.id = event.content_block.id ?? null;
			toolState.name = event.content_block.name ?? null;
			toolState.json = '';
		}
	}

	private *handleDelta(
		delta: NonNullable<AnthropicStreamEvent['delta']>,
		toolState: ToolCallState,
	): Iterable<LlmChatChunk> {
		if (delta.type === 'text_delta' && delta.text) {
			yield { type: 'text', content: delta.text };
		}

		if (delta.type === 'thinking_delta' && delta.thinking) {
			yield { type: 'thinking', content: delta.thinking };
		}

		if (delta.type === 'input_json_delta' && delta.partial_json) {
			toolState.json += delta.partial_json;
		}
	}

	private *handleBlockStop(toolState: ToolCallState): Iterable<LlmChatChunk> {
		if (!toolState.id || !toolState.name) return;

		let args: Record<string, unknown>;
		try {
			args = JSON.parse(toolState.json) as Record<string, unknown>;
		} catch (error: unknown) {
			throw new ProviderError(
				`Malformed tool call JSON for '${toolState.name}': ${error instanceof Error ? error.message : String(error)}`,
				'anthropic',
				false,
			);
		}

		const toolCall: ToolCallRequest = {
			toolName: toolState.name,
			callId: toolState.id,
			args,
		};
		yield { type: 'tool_call', content: toolCall };

		toolState.id = null;
		toolState.name = null;
		toolState.json = '';
	}

	private wrapError(error: unknown): ProviderError {
		const retryable = isRetryableStatus(error);
		const message = error instanceof Error ? error.message : String(error);
		return new ProviderError(message, 'anthropic', retryable, {
			cause: error instanceof Error ? error : undefined,
		});
	}
}

export { AnthropicLlmProvider, type AnthropicClient, type AnthropicProviderConfig };
