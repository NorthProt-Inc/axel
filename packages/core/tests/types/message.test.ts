import { describe, expect, it } from 'vitest';
import type { Message, MessageRole } from '../../src/types/message.js';

describe('Message types', () => {
	describe('MessageRole', () => {
		it('accepts all valid roles', () => {
			const roles: MessageRole[] = ['user', 'assistant', 'system', 'tool'];
			expect(roles).toHaveLength(4);
		});
	});

	describe('Message', () => {
		it('represents a conversation message with all fields', () => {
			const message: Message = {
				sessionId: 'session-001',
				turnId: 1,
				role: 'user',
				content: 'Hello, Axel!',
				channelId: 'discord',
				timestamp: new Date('2025-06-01T12:00:00Z'),
				emotionalContext: 'neutral',
				metadata: { source: 'web' },
			};

			expect(message.sessionId).toBe('session-001');
			expect(message.turnId).toBe(1);
			expect(message.role).toBe('user');
			expect(message.content).toBe('Hello, Axel!');
			expect(message.channelId).toBe('discord');
		});

		it('allows null channelId for system messages', () => {
			const message: Message = {
				sessionId: 'session-002',
				turnId: 0,
				role: 'system',
				content: 'System prompt',
				channelId: null,
				timestamp: new Date(),
				emotionalContext: 'neutral',
				metadata: {},
			};

			expect(message.channelId).toBeNull();
		});

		it('supports metadata with arbitrary keys', () => {
			const message: Message = {
				sessionId: 'session-003',
				turnId: 2,
				role: 'assistant',
				content: 'Response',
				channelId: null,
				timestamp: new Date(),
				emotionalContext: 'friendly',
				metadata: {
					model: 'claude-opus-4-6',
					tokens: 150,
					cached: true,
				},
			};

			expect(message.metadata).toEqual({
				model: 'claude-opus-4-6',
				tokens: 150,
				cached: true,
			});
		});
	});
});
