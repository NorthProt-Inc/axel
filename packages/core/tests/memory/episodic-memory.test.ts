import { describe, expect, it, beforeEach } from 'vitest';
import { InMemoryEpisodicMemory } from '../../src/memory/episodic-memory.js';

describe('InMemoryEpisodicMemory', () => {
	let episodic: InMemoryEpisodicMemory;

	beforeEach(() => {
		episodic = new InMemoryEpisodicMemory();
	});

	describe('layerName', () => {
		it('should be "M2:episodic"', () => {
			expect(episodic.layerName).toBe('M2:episodic');
		});
	});

	describe('createSession / endSession', () => {
		it('should create a session and return session ID', async () => {
			const sessionId = await episodic.createSession({
				userId: 'user-1',
				channelId: 'discord-123',
			});
			expect(typeof sessionId).toBe('string');
			expect(sessionId.length).toBeGreaterThan(0);
		});

		it('should end a session with summary', async () => {
			const sessionId = await episodic.createSession({
				userId: 'user-1',
				channelId: 'discord-123',
			});

			await expect(
				episodic.endSession(sessionId, 'Discussed weather and music'),
			).resolves.not.toThrow();
		});

		it('should throw when ending non-existent session', async () => {
			await expect(
				episodic.endSession('nonexistent', 'summary'),
			).rejects.toThrow();
		});
	});

	describe('addMessage', () => {
		it('should add message to session', async () => {
			const sessionId = await episodic.createSession({
				userId: 'user-1',
				channelId: 'discord-123',
			});

			await expect(
				episodic.addMessage(sessionId, {
					role: 'user',
					content: 'Hello!',
					channelId: 'discord-123',
					timestamp: new Date(),
					tokenCount: 5,
				}),
			).resolves.not.toThrow();
		});

		it('should throw when adding to non-existent session', async () => {
			await expect(
				episodic.addMessage('nonexistent', {
					role: 'user',
					content: 'Hello!',
					channelId: 'discord-123',
					timestamp: new Date(),
					tokenCount: 5,
				}),
			).rejects.toThrow();
		});
	});

	describe('getRecentSessions', () => {
		it('should return recent sessions for user', async () => {
			const sessionId = await episodic.createSession({
				userId: 'user-1',
				channelId: 'discord-123',
			});

			await episodic.addMessage(sessionId, {
				role: 'user',
				content: 'Hello!',
				channelId: 'discord-123',
				timestamp: new Date(),
				tokenCount: 5,
			});

			await episodic.endSession(sessionId, 'Greeted the assistant');

			const sessions = await episodic.getRecentSessions('user-1', 10);
			expect(sessions).toHaveLength(1);
			expect(sessions[0]!.summary).toBe('Greeted the assistant');
		});

		it('should return empty array for user with no sessions', async () => {
			const sessions = await episodic.getRecentSessions('unknown-user', 10);
			expect(sessions).toHaveLength(0);
		});

		it('should limit results', async () => {
			for (let i = 0; i < 5; i++) {
				const sid = await episodic.createSession({
					userId: 'user-1',
					channelId: 'discord',
				});
				await episodic.endSession(sid, `Session ${i}`);
			}

			const sessions = await episodic.getRecentSessions('user-1', 3);
			expect(sessions).toHaveLength(3);
		});

		it('should only return completed sessions', async () => {
			const sid1 = await episodic.createSession({
				userId: 'user-1',
				channelId: 'discord',
			});
			await episodic.endSession(sid1, 'Completed session');

			// Create but don't end
			await episodic.createSession({
				userId: 'user-1',
				channelId: 'discord',
			});

			const sessions = await episodic.getRecentSessions('user-1', 10);
			expect(sessions).toHaveLength(1);
		});
	});

	describe('searchByTopic', () => {
		it('should find sessions by topic keyword', async () => {
			const sid = await episodic.createSession({
				userId: 'user-1',
				channelId: 'discord',
			});
			await episodic.addMessage(sid, {
				role: 'user',
				content: 'Tell me about TypeScript generics',
				channelId: 'discord',
				timestamp: new Date(),
				tokenCount: 10,
			});
			await episodic.endSession(sid, 'Discussed TypeScript generics');

			const results = await episodic.searchByTopic('TypeScript', 10);
			expect(results.length).toBeGreaterThanOrEqual(1);
		});

		it('should return empty for no matches', async () => {
			const results = await episodic.searchByTopic('nonexistent-topic', 10);
			expect(results).toHaveLength(0);
		});
	});

	describe('searchByContent', () => {
		it('should find messages by content', async () => {
			const sid = await episodic.createSession({
				userId: 'user-1',
				channelId: 'discord',
			});
			await episodic.addMessage(sid, {
				role: 'user',
				content: 'I really love jazz music',
				channelId: 'discord',
				timestamp: new Date(),
				tokenCount: 10,
			});
			await episodic.endSession(sid, 'Discussed music');

			const results = await episodic.searchByContent('jazz', 10);
			expect(results.length).toBeGreaterThanOrEqual(1);
			expect(results[0]!.content).toContain('jazz');
		});

		it('should return empty for no matches', async () => {
			const results = await episodic.searchByContent('nonexistent', 10);
			expect(results).toHaveLength(0);
		});
	});

	describe('healthCheck', () => {
		it('should return healthy status', async () => {
			const health = await episodic.healthCheck();
			expect(health.state).toBe('healthy');
			expect(health.lastChecked).toBeInstanceOf(Date);
		});
	});
});
