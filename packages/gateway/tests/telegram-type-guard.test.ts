import { describe, expect, it } from 'vitest';
import {
	isTelegramUpdate,
	extractTelegramMessage,
	type TelegramUpdate,
} from '../src/webhook-handlers.js';

/**
 * HARDEN-003: Telegram type guard — replace nested Record<string,unknown>
 * casting with a lightweight TelegramUpdate interface + type guard.
 *
 * Tests for isTelegramUpdate type guard and extractTelegramMessage refactored
 * to use the typed interface instead of 4-level Record<string,unknown> chains.
 */

describe('HARDEN-003: isTelegramUpdate type guard', () => {
	it('returns true for a valid Telegram update with message', () => {
		const update = {
			message: {
				from: { id: 456, is_bot: false },
				chat: { id: 123 },
				text: 'hello',
				date: 1700000000,
			},
		};
		expect(isTelegramUpdate(update)).toBe(true);
	});

	it('returns false when input is null', () => {
		expect(isTelegramUpdate(null)).toBe(false);
	});

	it('returns false when input is not an object', () => {
		expect(isTelegramUpdate('string')).toBe(false);
		expect(isTelegramUpdate(42)).toBe(false);
		expect(isTelegramUpdate(undefined)).toBe(false);
	});

	it('returns false when message field is missing', () => {
		expect(isTelegramUpdate({ update_id: 1 })).toBe(false);
	});

	it('returns false when message is not an object', () => {
		expect(isTelegramUpdate({ message: 'not-object' })).toBe(false);
	});

	it('returns false when message.from is missing', () => {
		expect(
			isTelegramUpdate({
				message: { chat: { id: 1 }, text: 'hi', date: 123 },
			}),
		).toBe(false);
	});

	it('returns false when message.from is not an object', () => {
		expect(
			isTelegramUpdate({
				message: { from: 'string', chat: { id: 1 }, text: 'hi', date: 123 },
			}),
		).toBe(false);
	});

	it('returns false when message.from.id is missing', () => {
		expect(
			isTelegramUpdate({
				message: { from: { is_bot: false }, chat: { id: 1 }, text: 'hi', date: 123 },
			}),
		).toBe(false);
	});

	it('returns false when message.chat is missing', () => {
		expect(
			isTelegramUpdate({
				message: { from: { id: 1, is_bot: false }, text: 'hi', date: 123 },
			}),
		).toBe(false);
	});

	it('returns false when message.chat is not an object', () => {
		expect(
			isTelegramUpdate({
				message: { from: { id: 1, is_bot: false }, chat: 42, text: 'hi', date: 123 },
			}),
		).toBe(false);
	});

	it('returns false when message.chat.id is missing', () => {
		expect(
			isTelegramUpdate({
				message: { from: { id: 1, is_bot: false }, chat: {}, text: 'hi', date: 123 },
			}),
		).toBe(false);
	});
});

describe('HARDEN-003: extractTelegramMessage with typed interface', () => {
	it('extracts userId, channelId, content, timestamp from valid update', () => {
		const update: TelegramUpdate = {
			message: {
				from: { id: 456, is_bot: false },
				chat: { id: 123 },
				text: 'hello axel',
				date: 1700000000,
			},
		};
		const result = extractTelegramMessage(update);
		expect(result).toEqual({
			userId: '456',
			channelId: '123',
			content: 'hello axel',
			timestamp: 1700000000000,
		});
	});

	it('returns null for bot messages', () => {
		const update: TelegramUpdate = {
			message: {
				from: { id: 789, is_bot: true },
				chat: { id: 123 },
				text: 'bot msg',
				date: 1700000000,
			},
		};
		expect(extractTelegramMessage(update)).toBeNull();
	});

	it('returns null when text is empty after trim', () => {
		const update: TelegramUpdate = {
			message: {
				from: { id: 456, is_bot: false },
				chat: { id: 123 },
				text: '   ',
				date: 1700000000,
			},
		};
		expect(extractTelegramMessage(update)).toBeNull();
	});

	it('returns null when text is undefined (photo-only message)', () => {
		const update: TelegramUpdate = {
			message: {
				from: { id: 456, is_bot: false },
				chat: { id: 123 },
				date: 1700000000,
			},
		};
		expect(extractTelegramMessage(update)).toBeNull();
	});

	it('uses Date.now() when date is missing', () => {
		const before = Date.now();
		const update: TelegramUpdate = {
			message: {
				from: { id: 456, is_bot: false },
				chat: { id: 123 },
				text: 'hello',
			},
		};
		const result = extractTelegramMessage(update);
		const after = Date.now();
		expect(result).not.toBeNull();
		expect(result!.timestamp).toBeGreaterThanOrEqual(before);
		expect(result!.timestamp).toBeLessThanOrEqual(after);
	});
});
