import type { LlmChatChunk, LlmChatParams, LlmProvider } from '@axel/core/orchestrator';
import { ProviderError } from '@axel/core/types';
import type { ToolCallRequest } from '@axel/core/types';

/** Ollama chat streaming chunk */
interface OllamaChatChunk {
	readonly message?: {
		readonly role?: string;
		readonly content?: string;
		readonly tool_calls?: readonly {
			readonly function?: {
				readonly name?: string;
				readonly arguments?: Record<string, unknown>;
			};
		}[];
	};
	readonly done?: boolean;
}

/** Ollama client interface — DI-friendly, works with `ollama` npm package */
interface OllamaClient {
	chat(params: Record<string, unknown>): AsyncIterable<OllamaChatChunk>;
}

/** Configuration for the Ollama provider */
interface OllamaProviderConfig {
	readonly model: string;
	readonly baseUrl: string;
	readonly supportsVision?: boolean;
}

const RETRYABLE_STATUS_CODES = new Set([500, 502, 503, 504]);
const RETRYABLE_ERROR_CODES = new Set(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EPIPE']);

let callIdCounter = 0;

function generateCallId(): string {
	callIdCounter += 1;
	return `ollama-${Date.now()}-${callIdCounter}`;
}

function isRetryable(error: unknown): boolean {
	if (typeof error === 'object' && error !== null) {
		if ('status' in error && RETRYABLE_STATUS_CODES.has((error as { status: number }).status)) {
			return true;
		}
		if ('code' in error && RETRYABLE_ERROR_CODES.has((error as { code: string }).code)) {
			return true;
		}
	}
	return false;
}

/**
 * Ollama LLM Provider — local LLM support.
 *
 * Implements LlmProvider interface using Ollama REST API.
 * Streaming-first: returns AsyncIterable<LlmChatChunk>.
 * Supports tool calling for models that support it (e.g., llama3.2, mistral).
 */
class OllamaLlmProvider implements LlmProvider {
	private readonly client: OllamaClient;
	private readonly config: OllamaProviderConfig;
	readonly supportsVision: boolean;

	constructor(client: OllamaClient, config: OllamaProviderConfig) {
		this.client = client;
		this.config = config;
		this.supportsVision = config.supportsVision ?? false;
	}

	async *chat(params: LlmChatParams): AsyncIterable<LlmChatChunk> {
		const requestParams = this.buildRequestParams(params);

		let stream: AsyncIterable<OllamaChatChunk>;
		try {
			stream = this.client.chat(requestParams);
		} catch (error) {
			throw this.wrapError(error);
		}

		yield* this.processStream(stream);
	}

	private buildRequestParams(params: LlmChatParams): Record<string, unknown> {
		const { messages, tools } = params;

		const ollamaMessages = messages.map((m) => ({
			role: m.role === 'assistant' ? 'assistant' : m.role === 'system' ? 'system' : 'user',
			content: m.content,
		}));

		const result: Record<string, unknown> = {
			model: this.config.model,
			stream: true,
			messages: ollamaMessages,
		};

		if (tools.length > 0) {
			result['tools'] = tools.map((t) => ({
				type: 'function',
				function: {
					name: t.name,
					description: t.description,
					parameters: t.inputSchema,
				},
			}));
		}

		return result;
	}

	private async *processStream(stream: AsyncIterable<OllamaChatChunk>): AsyncIterable<LlmChatChunk> {
		try {
			for await (const chunk of stream) {
				if (chunk.done) continue;

				const msg = chunk.message;
				if (!msg) continue;

				// Yield text content
				if (msg.content && msg.content.length > 0) {
					yield { type: 'text', content: msg.content };
				}

				// Yield tool calls
				if (msg.tool_calls) {
					for (const toolCall of msg.tool_calls) {
						const fn = toolCall.function;
						if (!fn?.name) continue;

						const request: ToolCallRequest = {
							toolName: fn.name,
							callId: generateCallId(),
							args: fn.arguments ?? {},
						};
						yield { type: 'tool_call', content: request };
					}
				}
			}
		} catch (error) {
			throw this.wrapError(error);
		}
	}

	private wrapError(error: unknown): ProviderError {
		const retryable = isRetryable(error);
		const message = error instanceof Error ? error.message : String(error);
		const cause = error instanceof Error ? error : undefined;
		return new ProviderError(message, 'ollama', retryable, {
			...(cause ? { cause } : {}),
		});
	}
}

export { OllamaLlmProvider, type OllamaClient, type OllamaProviderConfig, type OllamaChatChunk };
