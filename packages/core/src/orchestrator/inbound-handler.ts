import type { ContextAssembler } from '../context/assembler.js';
import type { ContextSection } from '../context/types.js';
import type { EpisodicMemory, WorkingMemory } from '../memory/types.js';
import type { PersonaEngine } from '../persona/engine.js';
import type { InboundMessage, OutboundMessage } from '../types/channel.js';
import type { Message } from '../types/message.js';
import type { ReActEvent } from '../types/react.js';
import type { ToolDefinition } from '../types/tool.js';
import { reactLoop } from './react-loop.js';
import type { SessionRouter } from './session-router.js';
import type { LlmProvider, ReActConfig, ToolExecutor } from './types.js';
import { DEFAULT_REACT_CONFIG } from './types.js';

/** Send callback — channel adapters provide this to deliver responses */
export type SendCallback = (target: string, msg: OutboundMessage) => Promise<void>;

/** Error context passed to onError callback (AUD-081) */
export interface ErrorInfo {
	readonly error: unknown;
	readonly errorType: string;
	readonly errorMessage: string;
	readonly userId: string;
	readonly channelId: string;
}

/**
 * Dependencies for InboundHandler (DI, ADR-006).
 *
 * All injected via createInboundHandler factory function.
 */
export interface InboundHandlerDeps {
	readonly sessionRouter: SessionRouter;
	readonly contextAssembler: ContextAssembler;
	readonly llmProvider: LlmProvider;
	readonly toolExecutor: ToolExecutor;
	readonly personaEngine: PersonaEngine;
	readonly workingMemory: WorkingMemory;
	readonly episodicMemory: EpisodicMemory;
	readonly toolDefinitions?: readonly ToolDefinition[];
	readonly config?: ReActConfig;
	readonly onError?: (info: ErrorInfo) => void;
}

/** Fallback error message when processing fails */
const ERROR_MESSAGE =
	'죄송합니다, 요청을 처리하는 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';

/**
 * Create an inbound message handler (plan L7/L8 integration).
 *
 * Wires the full message processing pipeline:
 * 1. SessionRouter.resolveSession(userId, channelType)
 * 2. PersonaEngine.getSystemPrompt(channel) for channel-adapted prompt
 * 3. ContextAssembler.assemble(userId, query) for context window
 * 4. reactLoop(params) yields ReActEvent stream
 * 5. Accumulate text events → OutboundMessage sent via send callback
 *
 * @param deps - Injected dependencies
 * @returns Handler function matching (InboundMessage, SendCallback) => Promise<void>
 */
export function createInboundHandler(
	deps: InboundHandlerDeps,
): (message: InboundMessage, send: SendCallback) => Promise<void> {
	const {
		sessionRouter,
		contextAssembler,
		llmProvider,
		toolExecutor,
		personaEngine,
		workingMemory,
		episodicMemory,
		toolDefinitions = [],
		config = DEFAULT_REACT_CONFIG,
		onError,
	} = deps;

	return async (message: InboundMessage, send: SendCallback): Promise<void> => {
		const { userId, channelId, content } = message;

		try {
			// 1. Resolve session
			const resolved = await sessionRouter.resolveSession(userId, channelId);

			// 2. Get channel-adapted system prompt
			const systemPrompt = personaEngine.getSystemPrompt(channelId);

			// 3. Assemble context
			const assembled = await contextAssembler.assemble({
				systemPrompt,
				userId,
				query: content,
			});

			// 4. Build messages for reactLoop
			const messages = buildMessages(assembled.systemPrompt, assembled.sections, message);

			// 5. Run ReAct loop and accumulate text
			const responseText = await consumeReactStream(
				reactLoop({
					messages,
					tools: toolDefinitions,
					llmProvider,
					toolExecutor,
					config,
				}),
			);

			// 6. Send response
			await send(userId, {
				content: responseText || ERROR_MESSAGE,
				format: 'markdown',
			});

			// 7. Update session activity
			await sessionRouter.updateActivity(resolved.session.sessionId);

			// 8. Persist to memory layers (FIX-MEMORY-001)
			const now = new Date();
			const baseTurnId = resolved.session.turnCount;
			await persistToMemory(
				workingMemory,
				episodicMemory,
				userId,
				resolved.session.sessionId,
				channelId,
				content,
				message.timestamp,
				responseText,
				now,
				baseTurnId,
			);
		} catch (err: unknown) {
			// AUD-081: Report error details for observability
			if (onError) {
				try {
					onError(buildErrorInfo(err, userId, channelId));
				} catch {
					// onError itself failed — do not propagate
				}
			}

			await send(userId, {
				content: ERROR_MESSAGE,
				format: 'markdown',
			});
		}
	};
}

// ─── Internal Helpers ───

/**
 * Persist user message and assistant response to M1 (WorkingMemory) and M2 (EpisodicMemory).
 *
 * Failures are silently caught — memory persistence must not break the response flow.
 * The response has already been sent to the user at this point.
 */
async function persistToMemory(
	workingMemory: WorkingMemory,
	episodicMemory: EpisodicMemory,
	userId: string,
	sessionId: string,
	channelId: string,
	userContent: string,
	userTimestamp: Date,
	assistantContent: string,
	assistantTimestamp: Date,
	baseTurnId: number,
): Promise<void> {
	try {
		const userTokenCount = estimateTokenCount(userContent);
		const assistantTokenCount = estimateTokenCount(assistantContent);

		await workingMemory.pushTurn(userId, {
			turnId: baseTurnId + 1,
			role: 'user',
			content: userContent,
			channelId,
			timestamp: userTimestamp,
			tokenCount: userTokenCount,
		});

		await workingMemory.pushTurn(userId, {
			turnId: baseTurnId + 2,
			role: 'assistant',
			content: assistantContent,
			channelId,
			timestamp: assistantTimestamp,
			tokenCount: assistantTokenCount,
		});

		await episodicMemory.addMessage(sessionId, {
			role: 'user',
			content: userContent,
			channelId,
			timestamp: userTimestamp,
			tokenCount: userTokenCount,
		});

		await episodicMemory.addMessage(sessionId, {
			role: 'assistant',
			content: assistantContent,
			channelId,
			timestamp: assistantTimestamp,
			tokenCount: assistantTokenCount,
		});
	} catch {
		// Memory persistence failure must not break the response flow.
		// The response has already been sent successfully.
	}
}

/** Estimate token count for a string (~4 chars per token, common heuristic) */
function estimateTokenCount(text: string): number {
	return Math.ceil(text.length / 4);
}

/** Extract structured error info from an unknown thrown value */
function buildErrorInfo(err: unknown, userId: string, channelId: string): ErrorInfo {
	if (err instanceof Error) {
		return {
			error: err,
			errorType: err.constructor.name,
			errorMessage: err.message,
			userId,
			channelId,
		};
	}
	return {
		error: err,
		errorType: 'unknown',
		errorMessage: String(err),
		userId,
		channelId,
	};
}

/**
 * Build Message array for reactLoop from assembled context and inbound message.
 *
 * Creates a system message from the assembled prompt, plus the user's message.
 */
function buildMessages(
	systemPrompt: string,
	sections: readonly ContextSection[],
	inbound: InboundMessage,
): Message[] {
	const contextParts = sections
		.filter((s) => s.content.length > 0)
		.map((s) => `[${s.source}]\n${s.content}`);

	const fullSystemContent =
		contextParts.length > 0 ? `${systemPrompt}\n\n${contextParts.join('\n\n')}` : systemPrompt;

	return [
		{
			sessionId: '',
			turnId: 0,
			role: 'system',
			content: fullSystemContent,
			channelId: inbound.channelId,
			timestamp: new Date(),
			emotionalContext: '',
			metadata: {},
		},
		{
			sessionId: '',
			turnId: 1,
			role: 'user',
			content: inbound.content,
			channelId: inbound.channelId,
			timestamp: inbound.timestamp,
			emotionalContext: '',
			metadata: {},
		},
	];
}

/**
 * Consume the ReAct event stream and accumulate text deltas.
 *
 * Filters message_delta events and concatenates their content.
 */
async function consumeReactStream(stream: AsyncGenerator<ReActEvent>): Promise<string> {
	const parts: string[] = [];

	for await (const event of stream) {
		if (event.type === 'message_delta') {
			parts.push(event.content);
		}
	}

	return parts.join('');
}
