import * as crypto from 'node:crypto';
import type * as http from 'node:http';
import { generateRequestId, parseJsonBody, sendError, sendJson } from './http-utils.js';
import type { GatewayConfig, GatewayDeps, RouteHandler } from './types.js';

/**
 * Create webhook route handlers for Telegram and Discord.
 *
 * Webhook endpoints do NOT use Bearer JWT auth — they use
 * channel-specific verification (Telegram secret token, Discord Ed25519).
 */
export function createWebhookHandlers(
	config: GatewayConfig,
	deps: GatewayDeps,
): {
	handleTelegramWebhook: RouteHandler;
	handleDiscordWebhook: RouteHandler;
} {
	return {
		handleTelegramWebhook: createTelegramHandler(config, deps),
		handleDiscordWebhook: createDiscordHandler(config, deps),
	};
}

// ─── Telegram Types (HARDEN-003) ───

/** Lightweight Telegram Update interface for type-safe extraction. */
export interface TelegramUpdate {
	readonly message: {
		readonly from: {
			readonly id: number;
			readonly is_bot: boolean;
		};
		readonly chat: {
			readonly id: number;
		};
		readonly text?: string;
		readonly date?: number;
	};
}

/**
 * Type guard: validates the structural shape of a Telegram Update.
 * Uses `in` narrowing to avoid Record<string,unknown> index-signature casts.
 */
export function isTelegramUpdate(value: unknown): value is TelegramUpdate {
	if (typeof value !== 'object' || value === null) return false;
	if (!('message' in value)) return false;

	const { message } = value as { message: unknown };
	if (typeof message !== 'object' || message === null) return false;
	if (!('from' in message) || !('chat' in message)) return false;

	const { from, chat } = message as { from: unknown; chat: unknown };
	if (typeof from !== 'object' || from === null) return false;
	if (!('id' in from)) return false;

	const { id: fromId } = from as { id: unknown };
	if (typeof fromId !== 'number') return false;

	if (typeof chat !== 'object' || chat === null) return false;
	if (!('id' in chat)) return false;

	const { id: chatId } = chat as { id: unknown };
	if (typeof chatId !== 'number') return false;

	return true;
}

interface TelegramExtractedMessage {
	readonly userId: string;
	readonly channelId: string;
	readonly content: string;
	readonly timestamp: number;
}

/**
 * Extract message fields from a validated TelegramUpdate.
 * Returns null for bot messages, empty text, or missing text.
 */
export function extractTelegramMessage(update: TelegramUpdate): TelegramExtractedMessage | null {
	const { message } = update;

	if (message.from.is_bot) return null;

	const text = typeof message.text === 'string' ? message.text.trim() : '';
	if (text.length === 0) return null;

	const userId = String(message.from.id);
	const channelId = String(message.chat.id);
	const timestamp = typeof message.date === 'number' ? message.date * 1000 : Date.now();

	return { userId, channelId, content: text, timestamp };
}

// ─── Discord Types (HARDEN-004) ───

/** Discord interaction option. */
interface DiscordCommandOption {
	readonly name: string;
	readonly value?: string;
}

/** Lightweight Discord Interaction interface for type-safe extraction. */
export interface DiscordInteraction {
	readonly type: number;
	readonly data?: {
		readonly name: string;
		readonly options?: readonly DiscordCommandOption[];
	};
	readonly member?: {
		readonly user: {
			readonly id: string;
		};
	};
	readonly user?: {
		readonly id: string;
	};
	readonly channel_id?: string;
	readonly token?: string;
	readonly application_id?: string;
}

/**
 * Type guard: validates the structural shape of a Discord Interaction.
 * Uses `in` narrowing to avoid Record<string,unknown> index-signature casts.
 */
export function isDiscordInteraction(value: unknown): value is DiscordInteraction {
	if (typeof value !== 'object' || value === null) return false;
	if (!('type' in value)) return false;

	const { type } = value as { type: unknown };
	if (typeof type !== 'number') return false;

	if ('data' in value && !isValidDiscordData((value as { data: unknown }).data)) return false;
	if ('member' in value && !isValidDiscordMember((value as { member: unknown }).member)) {
		return false;
	}

	return true;
}

function isValidDiscordData(data: unknown): boolean {
	if (typeof data !== 'object' || data === null) return false;
	if (!('name' in data)) return false;
	const { name } = data as { name: unknown };
	return typeof name === 'string';
}

function isValidDiscordMember(member: unknown): boolean {
	if (typeof member !== 'object' || member === null) return false;
	if (!('user' in member)) return false;
	const { user } = member as { user: unknown };
	if (typeof user !== 'object' || user === null) return false;
	if (!('id' in user)) return false;
	const { id } = user as { id: unknown };
	return typeof id === 'string';
}

interface DiscordExtracted {
	readonly userId: string;
	readonly channelId: string;
	readonly content: string;
}

/** Extract userId, channelId, content from a validated DiscordInteraction. */
export function extractDiscordInteraction(interaction: DiscordInteraction): DiscordExtracted {
	const userId = interaction.member?.user.id ?? interaction.user?.id ?? '';
	const channelId = interaction.channel_id ?? '';
	const content = extractDiscordContent(interaction);
	return { userId, channelId, content };
}

function extractDiscordContent(interaction: DiscordInteraction): string {
	const data = interaction.data;
	if (!data) return '';

	if (data.options) {
		const messageOpt = data.options.find((opt) => opt.name === 'message');
		if (messageOpt && typeof messageOpt.value === 'string') {
			return messageOpt.value;
		}
	}

	return `/${data.name}`;
}

// ─── Telegram Webhook ───

function createTelegramHandler(config: GatewayConfig, deps: GatewayDeps): RouteHandler {
	return async (
		req: http.IncomingMessage,
		res: http.ServerResponse,
		body: string,
	): Promise<void> => {
		const requestId = generateRequestId();

		if (!verifyTelegramSecret(req, config)) {
			sendError(res, 401, 'Invalid secret token', requestId);
			return;
		}

		const parsed = parseJsonBody(body);
		if (!parsed) {
			sendError(res, 400, 'Invalid JSON body', requestId);
			return;
		}

		if (!isTelegramUpdate(parsed)) {
			sendJson(res, 200, { ok: true });
			return;
		}

		const message = extractTelegramMessage(parsed);
		if (!message) {
			sendJson(res, 200, { ok: true });
			return;
		}

		if (!deps.handleMessage) {
			sendError(res, 503, 'Chat handler not configured', requestId);
			return;
		}

		await deps.handleMessage({
			userId: message.userId,
			channelId: message.channelId,
			content: message.content,
			timestamp: message.timestamp,
		});

		sendJson(res, 200, { ok: true });
	};
}

function verifyTelegramSecret(req: http.IncomingMessage, config: GatewayConfig): boolean {
	const secret = config.telegramWebhookSecret;
	if (!secret) return false;

	const header = req.headers['x-telegram-bot-api-secret-token'];
	if (typeof header !== 'string') return false;

	const headerBuf = Buffer.from(header);
	const secretBuf = Buffer.from(secret);
	if (headerBuf.length !== secretBuf.length) return false;

	return crypto.timingSafeEqual(headerBuf, secretBuf);
}

// ─── Discord Webhook ───

/** Discord interaction types */
const INTERACTION_PING = 1;
const INTERACTION_APPLICATION_COMMAND = 2;

/** Discord interaction response types */
const RESPONSE_PONG = 1;
const RESPONSE_DEFERRED = 5;

function createDiscordHandler(config: GatewayConfig, deps: GatewayDeps): RouteHandler {
	return async (
		req: http.IncomingMessage,
		res: http.ServerResponse,
		body: string,
	): Promise<void> => {
		const requestId = generateRequestId();

		if (!verifyDiscordSignature(req, body, config)) {
			sendError(res, 401, 'Invalid signature', requestId);
			return;
		}

		const parsed = parseJsonBody(body);
		if (!parsed) {
			sendError(res, 400, 'Invalid JSON body', requestId);
			return;
		}

		if (!isDiscordInteraction(parsed)) {
			sendJson(res, 200, { ok: true });
			return;
		}

		if (parsed.type === INTERACTION_PING) {
			sendJson(res, 200, { type: RESPONSE_PONG });
			return;
		}

		if (parsed.type === INTERACTION_APPLICATION_COMMAND) {
			await handleDiscordCommand(res, parsed, config, deps, requestId);
			return;
		}

		sendJson(res, 200, { ok: true });
	};
}

function verifyDiscordSignature(
	req: http.IncomingMessage,
	body: string,
	config: GatewayConfig,
): boolean {
	const publicKeyHex = config.discordPublicKey;
	if (!publicKeyHex) return false;

	const signature = req.headers['x-signature-ed25519'];
	const timestamp = req.headers['x-signature-timestamp'];

	if (typeof signature !== 'string' || typeof timestamp !== 'string') return false;

	try {
		const publicKey = crypto.createPublicKey({
			key: Buffer.concat([
				Buffer.from('302a300506032b6570032100', 'hex'),
				Buffer.from(publicKeyHex, 'hex'),
			]),
			format: 'der',
			type: 'spki',
		});

		const message = Buffer.from(timestamp + body);
		const sig = Buffer.from(signature, 'hex');
		return crypto.verify(null, message, publicKey, sig);
	} catch {
		return false;
	}
}

async function handleDiscordCommand(
	res: http.ServerResponse,
	interaction: DiscordInteraction,
	config: GatewayConfig,
	deps: GatewayDeps,
	requestId: string,
): Promise<void> {
	if (!deps.handleMessage) {
		sendError(res, 503, 'Chat handler not configured', requestId);
		return;
	}

	// Send DEFERRED (type=5) response immediately — Discord expects this within 3s
	sendJson(res, 200, { type: RESPONSE_DEFERRED });

	const { userId, channelId, content } = extractDiscordInteraction(interaction);
	const interactionToken = interaction.token;
	const applicationId = interaction.application_id ?? config.discordApplicationId;

	// Fire-and-forget: process message asynchronously, send follow-up via webhook PATCH
	void processDiscordCommand(userId, channelId, content, interactionToken, applicationId, deps);
}

async function processDiscordCommand(
	userId: string,
	channelId: string,
	content: string,
	interactionToken: string | undefined,
	applicationId: string | undefined,
	deps: GatewayDeps,
): Promise<void> {
	try {
		const result = await deps.handleMessage?.({
			userId,
			channelId,
			content,
			timestamp: Date.now(),
		});

		if (result && interactionToken && applicationId && deps.discordFollowUp) {
			await deps.discordFollowUp(applicationId, interactionToken, result.content);
		}
	} catch {
		if (interactionToken && applicationId && deps.discordFollowUp) {
			await deps
				.discordFollowUp(
					applicationId,
					interactionToken,
					'처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
				)
				.catch(() => {
					// Follow-up delivery failure is non-fatal — the DEFERRED response was already sent
				});
		}
	}
}
