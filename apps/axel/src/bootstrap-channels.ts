import { CliChannel } from '@axel/channels/cli';
import { DiscordChannel } from '@axel/channels/discord';
import { TelegramChannel } from '@axel/channels/telegram';
import { type SendCallback, createInboundHandler } from '@axel/core/orchestrator';
import type { PersonaEngine } from '@axel/core/persona';
import type { AxelChannel, InboundMessage } from '@axel/core/types';
import type { HandleMessage, MessageResult } from '@axel/gateway';
import type { AxelConfig } from './config.js';
import type { Container } from './container.js';

/** Tracks active user IDs for graceful shutdown flush (FIX-MEMORY-002) */
export interface ActiveUserTracker {
	readonly track: (userId: string) => void;
	readonly getActiveUserIds: () => readonly string[];
}

/** Create an in-memory active user tracker */
export function createActiveUserTracker(): ActiveUserTracker {
	const activeUsers = new Set<string>();
	return {
		track: (userId: string) => {
			activeUsers.add(userId);
		},
		getActiveUserIds: () => [...activeUsers],
	};
}

/** Fallback error message for gateway HandleMessage */
const GATEWAY_ERROR_MESSAGE =
	'죄송합니다, 요청을 처리하는 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';

/**
 * Create channel instances based on configuration.
 *
 * Channels are created only when their config token/flag is present.
 * CLI is enabled by default unless explicitly disabled.
 */
export function createChannels(config: AxelConfig): AxelChannel[] {
	const channels: AxelChannel[] = [];

	// CLI channel: enabled by default
	const cliEnabled = config.channels.cli?.enabled ?? true;
	if (cliEnabled) {
		channels.push(new CliChannel());
	}

	// Discord channel: requires botToken
	if (config.channels.discord?.botToken) {
		channels.push(new DiscordChannel({ token: config.channels.discord.botToken }));
	}

	// Telegram channel: requires botToken
	if (config.channels.telegram?.botToken) {
		channels.push(new TelegramChannel({ token: config.channels.telegram.botToken }));
	}

	return channels;
}

/** Build InboundHandler from container + persona engine (FIX-MEMORY-002) */
function buildHandler(container: Container, personaEngine: PersonaEngine) {
	return createInboundHandler({
		sessionRouter: container.sessionRouter,
		contextAssembler: container.contextAssembler,
		llmProvider: container.anthropicProvider,
		toolExecutor: container.toolExecutor,
		personaEngine,
		workingMemory: container.workingMemory,
		episodicMemory: container.episodicMemory,
		toolDefinitions: container.toolRegistry.listAll(),
	});
}

/**
 * Wire InboundHandler to each channel's onMessage callback.
 *
 * For each channel, creates a send-bound InboundHandler that routes
 * the InboundMessage through the full processing pipeline:
 * SessionRouter → ContextAssembler → PersonaEngine → reactLoop → send
 *
 * If a tracker is provided, each incoming userId is recorded for
 * graceful shutdown flush (FIX-MEMORY-002).
 */
export function wireChannels(
	channels: readonly AxelChannel[],
	container: Container,
	personaEngine: PersonaEngine,
	tracker?: ActiveUserTracker,
): void {
	const handler = buildHandler(container, personaEngine);

	for (const channel of channels) {
		const sendCallback: SendCallback = (target, msg) => channel.send(target, msg);

		channel.onMessage(async (message: InboundMessage) => {
			tracker?.track(message.userId);
			await handler(message, sendCallback);
		});
	}
}

/**
 * Create a HandleMessage adapter for the gateway.
 *
 * Bridges the gateway's HandleMessage interface to the core InboundHandler
 * pipeline. The gateway doesn't use channel.send — it returns the response
 * directly as MessageResult.
 */
export function createHandleMessage(
	container: Container,
	personaEngine: PersonaEngine,
): HandleMessage {
	const handler = buildHandler(container, personaEngine);

	return async (message, onEvent?): Promise<MessageResult> => {
		let responseContent = '';
		let sessionId = '';

		const sendCapture: SendCallback = async (_target, msg) => {
			responseContent = msg.content;
		};

		try {
			const resolved = await container.sessionRouter.resolveSession(
				message.userId,
				message.channelId,
			);
			sessionId = resolved.session.sessionId;

			await handler(
				{
					userId: message.userId,
					channelId: message.channelId,
					content: message.content,
					timestamp: new Date(message.timestamp),
				},
				sendCapture,
			);

			if (onEvent) {
				onEvent({ type: 'message_complete', content: responseContent });
			}

			return {
				content: responseContent,
				sessionId,
				channelSwitched: resolved.channelSwitched,
				usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
			};
		} catch (_err: unknown) {
			return {
				content: GATEWAY_ERROR_MESSAGE,
				sessionId,
				channelSwitched: false,
				usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
			};
		}
	};
}
