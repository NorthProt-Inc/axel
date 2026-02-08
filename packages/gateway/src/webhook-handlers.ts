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

interface TelegramExtractedMessage {
	readonly userId: string;
	readonly channelId: string;
	readonly content: string;
	readonly timestamp: number;
}

function extractTelegramMessage(update: Record<string, unknown>): TelegramExtractedMessage | null {
	const message = update.message;
	if (typeof message !== 'object' || message === null) return null;

	const msg = message as Record<string, unknown>;
	const from = msg.from;
	if (typeof from !== 'object' || from === null) return null;

	const fromObj = from as Record<string, unknown>;
	if (fromObj.is_bot === true) return null;

	const text = typeof msg.text === 'string' ? msg.text.trim() : '';
	if (text.length === 0) return null;

	const userId = String(fromObj.id ?? '');
	if (userId.length === 0) return null;

	const chat = msg.chat;
	const channelId =
		typeof chat === 'object' && chat !== null
			? String((chat as Record<string, unknown>).id ?? '')
			: '';

	const date = typeof msg.date === 'number' ? msg.date * 1000 : Date.now();

	return { userId, channelId, content: text, timestamp: date };
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

		const interactionType = parsed.type;

		if (interactionType === INTERACTION_PING) {
			sendJson(res, 200, { type: RESPONSE_PONG });
			return;
		}

		if (interactionType === INTERACTION_APPLICATION_COMMAND) {
			await handleDiscordCommand(res, parsed, deps, requestId);
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
	interaction: Record<string, unknown>,
	deps: GatewayDeps,
	requestId: string,
): Promise<void> {
	if (!deps.handleMessage) {
		sendError(res, 503, 'Chat handler not configured', requestId);
		return;
	}

	const { userId, channelId, content } = extractDiscordInteraction(interaction);

	await deps.handleMessage({
		userId,
		channelId,
		content,
		timestamp: Date.now(),
	});

	sendJson(res, 200, { type: RESPONSE_DEFERRED });
}

interface DiscordExtracted {
	readonly userId: string;
	readonly channelId: string;
	readonly content: string;
}

function extractDiscordInteraction(interaction: Record<string, unknown>): DiscordExtracted {
	const userId = extractDiscordUserId(interaction);
	const channelId = typeof interaction.channel_id === 'string' ? interaction.channel_id : '';
	const content = extractDiscordContent(interaction);
	return { userId, channelId, content };
}

function extractDiscordUserId(interaction: Record<string, unknown>): string {
	const fromMember = extractUserIdFromObject(interaction.member, 'user');
	if (fromMember.length > 0) return fromMember;
	return extractUserIdFromObject(interaction, 'user');
}

function extractUserIdFromObject(source: unknown, userKey: string): string {
	if (typeof source !== 'object' || source === null) return '';
	const obj = source as Record<string, unknown>;
	const user = obj[userKey];
	if (typeof user !== 'object' || user === null) return '';
	return String((user as Record<string, unknown>).id ?? '');
}

function extractDiscordContent(interaction: Record<string, unknown>): string {
	const data = interaction.data;
	if (typeof data !== 'object' || data === null) return '';

	const dataObj = data as Record<string, unknown>;
	const options = dataObj.options;
	if (Array.isArray(options)) {
		const messageOpt = options.find(
			(opt): opt is Record<string, unknown> =>
				typeof opt === 'object' &&
				opt !== null &&
				(opt as Record<string, unknown>).name === 'message',
		);
		if (messageOpt && typeof messageOpt.value === 'string') {
			return messageOpt.value;
		}
	}

	return typeof dataObj.name === 'string' ? `/${dataObj.name}` : '';
}
