import { beforeEach, describe, expect, it } from 'vitest';
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
			await expect(episodic.endSession('nonexistent', 'summary')).rejects.toThrow();
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
			expect(sessions[0]?.summary).toBe('Greeted the assistant');
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

		it('should find by summary even without matching messages', async () => {
			const sid = await episodic.createSession({
				userId: 'user-1',
				channelId: 'discord',
			});
			await episodic.addMessage(sid, {
				role: 'user',
				content: 'Hello',
				channelId: 'discord',
				timestamp: new Date(),
				tokenCount: 5,
			});
			await episodic.endSession(sid, 'Discussed Rust programming');

			const results = await episodic.searchByTopic('Rust', 10);
			expect(results.length).toBeGreaterThanOrEqual(1);
		});

		it('should find by message content when summary has no match', async () => {
			const sid = await episodic.createSession({
				userId: 'user-1',
				channelId: 'discord',
			});
			await episodic.addMessage(sid, {
				role: 'user',
				content: 'I love Python',
				channelId: 'discord',
				timestamp: new Date(),
				tokenCount: 5,
			});
			await episodic.endSession(sid, 'General chat session');

			const results = await episodic.searchByTopic('Python', 10);
			expect(results.length).toBeGreaterThanOrEqual(1);
		});

		it('should not return open sessions', async () => {
			const sid = await episodic.createSession({
				userId: 'user-1',
				channelId: 'discord',
			});
			await episodic.addMessage(sid, {
				role: 'user',
				content: 'Talking about Kotlin',
				channelId: 'discord',
				timestamp: new Date(),
				tokenCount: 5,
			});
			// Don't end the session

			const results = await episodic.searchByTopic('Kotlin', 10);
			expect(results).toHaveLength(0);
		});

		it('should return empty for no matches', async () => {
			const results = await episodic.searchByTopic('nonexistent-topic', 10);
			expect(results).toHaveLength(0);
		});

		it('should handle regex special characters in topic', async () => {
			const sid = await episodic.createSession({
				userId: 'user-1',
				channelId: 'discord',
			});
			await episodic.addMessage(sid, {
				role: 'user',
				content: 'C++ is great (really!)',
				channelId: 'discord',
				timestamp: new Date(),
				tokenCount: 5,
			});
			await episodic.endSession(sid, 'Discussed C++');

			// These contain regex special chars: +, (, ), !
			const plusResults = await episodic.searchByTopic('C++', 10);
			expect(plusResults).toHaveLength(1);

			const parenResults = await episodic.searchByTopic('(really!)', 10);
			expect(parenResults).toHaveLength(1);

			// Should not match unrelated content
			const noMatch = await episodic.searchByTopic('C#', 10);
			expect(noMatch).toHaveLength(0);
		});

		it('should perform well with 100+ sessions', async () => {
			// Create 150 sessions with messages
			for (let i = 0; i < 150; i++) {
				const sid = await episodic.createSession({
					userId: `user-${i % 10}`,
					channelId: 'discord',
				});
				for (let j = 0; j < 5; j++) {
					await episodic.addMessage(sid, {
						role: 'user',
						content: `Message ${j} about topic-${i} in session`,
						channelId: 'discord',
						timestamp: new Date(),
						tokenCount: 10,
					});
				}
				await episodic.endSession(sid, `Session summary ${i}`);
			}

			// Add a unique needle to find
			const needleSid = await episodic.createSession({
				userId: 'user-needle',
				channelId: 'discord',
			});
			await episodic.addMessage(needleSid, {
				role: 'user',
				content: 'The unique NEEDLE content for performance test',
				channelId: 'discord',
				timestamp: new Date(),
				tokenCount: 10,
			});
			await episodic.endSession(needleSid, 'Needle session');

			const start = performance.now();
			const results = await episodic.searchByTopic('NEEDLE', 10);
			const elapsed = performance.now() - start;

			expect(results).toHaveLength(1);
			expect(results[0]?.summary).toBe('Needle session');
			// Should complete well under 100ms even with 151 sessions
			expect(elapsed).toBeLessThan(100);
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
			expect(results[0]?.content).toContain('jazz');
		});

		it('should stop at limit (early return)', async () => {
			const sid = await episodic.createSession({
				userId: 'user-1',
				channelId: 'discord',
			});
			for (let i = 0; i < 10; i++) {
				await episodic.addMessage(sid, {
					role: 'user',
					content: `Message about topic ${i}`,
					channelId: 'discord',
					timestamp: new Date(),
					tokenCount: 5,
				});
			}
			await episodic.endSession(sid, 'Many messages');

			const results = await episodic.searchByContent('topic', 3);
			expect(results).toHaveLength(3);
		});

		it('should return empty for no matches', async () => {
			const results = await episodic.searchByContent('nonexistent', 10);
			expect(results).toHaveLength(0);
		});

		it('should search across multiple sessions', async () => {
			for (let i = 0; i < 3; i++) {
				const sid = await episodic.createSession({
					userId: 'user-1',
					channelId: 'discord',
				});
				await episodic.addMessage(sid, {
					role: 'user',
					content: `Cross-session keyword ${i}`,
					channelId: 'discord',
					timestamp: new Date(),
					tokenCount: 5,
				});
				await episodic.endSession(sid, `Session ${i}`);
			}

			const results = await episodic.searchByContent('Cross-session', 10);
			expect(results).toHaveLength(3);
		});
	});

	describe('toSessionSummary edge cases', () => {
		it('should use session channelId when no messages present', async () => {
			const sid = await episodic.createSession({
				userId: 'user-1',
				channelId: 'telegram-456',
			});
			await episodic.endSession(sid, 'Empty session');

			const sessions = await episodic.getRecentSessions('user-1', 10);
			expect(sessions).toHaveLength(1);
			expect(sessions[0]?.channelHistory).toContain('telegram-456');
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
