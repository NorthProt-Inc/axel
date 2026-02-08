import { describe, expect, it } from 'vitest';
import {
	type DiscordInteraction,
	extractDiscordInteraction,
	isDiscordInteraction,
} from '../src/webhook-handlers.js';

/**
 * HARDEN-004: Discord type guard — replace nested Record<string,unknown>
 * casting with a Discord interaction interface + type guard.
 *
 * Tests for isDiscordInteraction type guard and extractDiscordInteraction
 * refactored to use the typed interface.
 */

describe('HARDEN-004: isDiscordInteraction type guard', () => {
	it('returns true for a valid application command interaction', () => {
		const interaction = {
			type: 2,
			data: { name: 'chat', options: [{ name: 'message', value: 'hello' }] },
			member: { user: { id: 'user-1' } },
			channel_id: 'ch-1',
		};
		expect(isDiscordInteraction(interaction)).toBe(true);
	});

	it('returns true for a minimal interaction (type only)', () => {
		const interaction = { type: 1 };
		expect(isDiscordInteraction(interaction)).toBe(true);
	});

	it('returns false when input is null', () => {
		expect(isDiscordInteraction(null)).toBe(false);
	});

	it('returns false when input is not an object', () => {
		expect(isDiscordInteraction('string')).toBe(false);
		expect(isDiscordInteraction(42)).toBe(false);
		expect(isDiscordInteraction(undefined)).toBe(false);
	});

	it('returns false when type field is missing', () => {
		expect(isDiscordInteraction({ data: { name: 'chat' } })).toBe(false);
	});

	it('returns false when type is not a number', () => {
		expect(isDiscordInteraction({ type: 'string' })).toBe(false);
	});

	it('validates data.name as string when data is present', () => {
		expect(isDiscordInteraction({ type: 2, data: { name: 123 } })).toBe(false);
		expect(isDiscordInteraction({ type: 2, data: { name: 'chat' } })).toBe(true);
	});

	it('validates member.user.id when member is present', () => {
		expect(
			isDiscordInteraction({
				type: 2,
				member: { user: { id: 123 } },
			}),
		).toBe(false);
		expect(
			isDiscordInteraction({
				type: 2,
				member: { user: { id: 'user-1' } },
			}),
		).toBe(true);
	});
});

describe('HARDEN-004: extractDiscordInteraction with typed interface', () => {
	it('extracts userId from member.user.id', () => {
		const interaction: DiscordInteraction = {
			type: 2,
			data: { name: 'chat', options: [{ name: 'message', value: 'hello' }] },
			member: { user: { id: 'user-123' } },
			channel_id: 'ch-456',
		};
		const result = extractDiscordInteraction(interaction);
		expect(result.userId).toBe('user-123');
	});

	it('extracts channelId from channel_id', () => {
		const interaction: DiscordInteraction = {
			type: 2,
			channel_id: 'ch-789',
		};
		const result = extractDiscordInteraction(interaction);
		expect(result.channelId).toBe('ch-789');
	});

	it('extracts content from data.options message value', () => {
		const interaction: DiscordInteraction = {
			type: 2,
			data: {
				name: 'chat',
				options: [{ name: 'message', value: 'hello from discord' }],
			},
		};
		const result = extractDiscordInteraction(interaction);
		expect(result.content).toBe('hello from discord');
	});

	it('falls back to /command-name when no message option', () => {
		const interaction: DiscordInteraction = {
			type: 2,
			data: { name: 'ping' },
		};
		const result = extractDiscordInteraction(interaction);
		expect(result.content).toBe('/ping');
	});

	it('returns empty content when no data', () => {
		const interaction: DiscordInteraction = {
			type: 2,
		};
		const result = extractDiscordInteraction(interaction);
		expect(result.content).toBe('');
	});

	it('returns empty userId when no member or user', () => {
		const interaction: DiscordInteraction = {
			type: 2,
			channel_id: 'ch-1',
		};
		const result = extractDiscordInteraction(interaction);
		expect(result.userId).toBe('');
	});

	it('falls back to interaction.user when member is absent', () => {
		const interaction: DiscordInteraction = {
			type: 2,
			user: { id: 'dm-user-1' },
			channel_id: 'dm-ch',
		};
		const result = extractDiscordInteraction(interaction);
		expect(result.userId).toBe('dm-user-1');
	});

	it('returns empty channelId when channel_id is missing', () => {
		const interaction: DiscordInteraction = {
			type: 2,
		};
		const result = extractDiscordInteraction(interaction);
		expect(result.channelId).toBe('');
	});
});
