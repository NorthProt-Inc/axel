import type { LlmChatChunk, LlmChatParams, LlmProvider } from '@axel/core/orchestrator';
import { ProviderError } from '@axel/core/types';
import type { ToolCallRequest } from '@axel/core/types';

/** Google Generative AI stream response chunk */
interface GoogleStreamChunk {
	readonly candidates?: readonly {
		readonly content: {
			readonly parts: readonly GooglePart[];
			readonly role: string;
		};
		readonly finishReason?: string;
	}[];
}

type GooglePart =
	| { readonly text: string }
	| { readonly functionCall: { readonly name: string; readonly args: Record<string, unknown> } };

/** Google GenerativeModel interface (subset) */
interface GoogleGenerativeModel {
	generateContentStream(
		params: Record<string, unknown>,
	): Promise<{ stream: AsyncIterable<GoogleStreamChunk> }>;
}

/** Google GenAI client interface (subset) */
interface GoogleGenAIClient {
	getGenerativeModel(config: { model: string }): GoogleGenerativeModel;
}

/** Configuration for Google provider */
interface GoogleProviderConfig {
	readonly model: string;
}

const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

function isRetryableStatus(error: unknown): boolean {
	if (typeof error === 'object' && error !== null && 'status' in error) {
		return RETRYABLE_STATUS_CODES.has((error as { status: number }).status);
	}
	const msg = error instanceof Error ? error.message : String(error);
	return msg.includes('429') || msg.includes('503') || msg.includes('ECONNRESET');
}

/**
 * Google Generative AI LLM Provider (ADR-020).
 *
 * Implements LlmProvider interface using Google's generateContentStream.
 * Supports text generation and function calling.
 */
class GoogleLlmProvider implements LlmProvider {
	private readonly client: GoogleGenAIClient;
	private readonly config: GoogleProviderConfig;
	private toolCallCounter = 0;

	constructor(client: GoogleGenAIClient, config: GoogleProviderConfig) {
		this.client = client;
		this.config = config;
	}

	async *chat(params: LlmChatParams): AsyncIterable<LlmChatChunk> {
		const requestParams = this.buildRequestParams(params);
		const model = this.client.getGenerativeModel({ model: this.config.model });

		let response: { stream: AsyncIterable<GoogleStreamChunk> };
		try {
			response = await model.generateContentStream(requestParams);
		} catch (error) {
			throw this.wrapError(error);
		}

		yield* this.processStream(response.stream);
	}

	private buildRequestParams(params: LlmChatParams): Record<string, unknown> {
		const { messages, tools } = params;
		const systemMessages = messages.filter((m) => m.role === 'system');
		const nonSystemMessages = messages.filter((m) => m.role !== 'system');

		const contents = nonSystemMessages.map((m) => ({
			role: m.role === 'assistant' ? 'model' : 'user',
			parts: [{ text: m.content }],
		}));

		const requestParams: Record<string, unknown> = { contents };

		if (systemMessages.length > 0) {
			requestParams['systemInstruction'] = {
				parts: [{ text: systemMessages.map((m) => m.content).join('\n') }],
			};
		}

		if (tools.length > 0) {
			requestParams['tools'] = [
				{
					functionDeclarations: tools.map((t) => ({
						name: t.name,
						description: t.description,
						parameters: t.inputSchema,
					})),
				},
			];
		}

		return requestParams;
	}

	private async *processStream(
		stream: AsyncIterable<GoogleStreamChunk>,
	): AsyncIterable<LlmChatChunk> {
		try {
			for await (const chunk of stream) {
				yield* this.processChunk(chunk);
			}
		} catch (error) {
			throw this.wrapError(error);
		}
	}

	private *processChunk(chunk: GoogleStreamChunk): Iterable<LlmChatChunk> {
		if (!chunk.candidates || chunk.candidates.length === 0) return;

		const candidate = chunk.candidates[0];
		if (!candidate) return;

		for (const part of candidate.content.parts) {
			if ('text' in part) {
				yield { type: 'text', content: part.text };
			}

			if ('functionCall' in part) {
				this.toolCallCounter++;
				const toolCall: ToolCallRequest = {
					toolName: part.functionCall.name,
					callId: `google_call_${this.toolCallCounter}`,
					args: part.functionCall.args,
				};
				yield { type: 'tool_call', content: toolCall };
			}
		}
	}

	private wrapError(error: unknown): ProviderError {
		const retryable = isRetryableStatus(error);
		const message = error instanceof Error ? error.message : String(error);
		const cause = error instanceof Error ? error : undefined;
		return new ProviderError(message, 'google', retryable, {
			...(cause ? { cause } : {}),
		});
	}
}

export { GoogleLlmProvider, type GoogleGenAIClient, type GoogleProviderConfig };
