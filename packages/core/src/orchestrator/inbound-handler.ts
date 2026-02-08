import type { ContextAssembler } from '../context/assembler.js';
import type { ContextSection } from '../context/types.js';
import type { PersonaEngine } from '../persona/engine.js';
import type { InboundMessage, OutboundMessage } from '../types/channel.js';
import type { Message } from '../types/message.js';
import type { ReActEvent } from '../types/react.js';
import { reactLoop } from './react-loop.js';
import type { SessionRouter } from './session-router.js';
import type { LlmProvider, ReActConfig, ToolExecutor } from './types.js';
import { DEFAULT_REACT_CONFIG } from './types.js';

/** Send callback — channel adapters provide this to deliver responses */
export type SendCallback = (target: string, msg: OutboundMessage) => Promise<void>;

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
	readonly config?: ReActConfig;
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
		config = DEFAULT_REACT_CONFIG,
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
					tools: [],
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
		} catch (_err: unknown) {
			await send(userId, {
				content: ERROR_MESSAGE,
				format: 'markdown',
			});
		}
	};
}

// ─── Internal Helpers ───

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
