import { describe, expect, it, beforeEach } from 'vitest';
import { InMemoryWorkingMemory } from '../../src/memory/working-memory.js';
import type { Turn } from '../../src/memory/types.js';

describe('InMemoryWorkingMemory', () => {
	let wm: InMemoryWorkingMemory;

	beforeEach(() => {
		wm = new InMemoryWorkingMemory();
	});

	describe('layerName', () => {
		it('should be "M1:working"', () => {
			expect(wm.layerName).toBe('M1:working');
		});
	});

	describe('pushTurn / getTurns', () => {
		it('should store and retrieve turns', async () => {
			const turn: Turn = {
				turnId: 1,
				role: 'user',
				content: 'Hello!',
				channelId: 'discord',
				timestamp: new Date(),
				tokenCount: 5,
			};
			await wm.pushTurn('user-1', turn);

			const turns = await wm.getTurns('user-1', 10);
			expect(turns).toHaveLength(1);
			expect(turns[0]!.content).toBe('Hello!');
		});

		it('should return turns in chronological order', async () => {
			for (let i = 0; i < 3; i++) {
				await wm.pushTurn('user-1', {
					turnId: i,
					role: 'user',
					content: `Message ${i}`,
					channelId: 'discord',
					timestamp: new Date(),
					tokenCount: 10,
				});
			}

			const turns = await wm.getTurns('user-1', 10);
			expect(turns).toHaveLength(3);
			expect(turns[0]!.turnId).toBe(0);
			expect(turns[2]!.turnId).toBe(2);
		});

		it('should limit returned turns', async () => {
			for (let i = 0; i < 10; i++) {
				await wm.pushTurn('user-1', {
					turnId: i,
					role: 'user',
					content: `Message ${i}`,
					channelId: 'discord',
					timestamp: new Date(),
					tokenCount: 10,
				});
			}

			const turns = await wm.getTurns('user-1', 3);
			expect(turns).toHaveLength(3);
			// Should return the most recent 3 turns
			expect(turns[0]!.turnId).toBe(7);
			expect(turns[2]!.turnId).toBe(9);
		});

		it('should keep only 20 turns max (plan spec)', async () => {
			for (let i = 0; i < 25; i++) {
				await wm.pushTurn('user-1', {
					turnId: i,
					role: 'user',
					content: `Message ${i}`,
					channelId: 'discord',
					timestamp: new Date(),
					tokenCount: 10,
				});
			}

			const turns = await wm.getTurns('user-1', 100);
			expect(turns.length).toBeLessThanOrEqual(20);
		});

		it('should isolate users', async () => {
			await wm.pushTurn('user-1', {
				turnId: 0,
				role: 'user',
				content: 'From user 1',
				channelId: 'discord',
				timestamp: new Date(),
				tokenCount: 10,
			});

			await wm.pushTurn('user-2', {
				turnId: 0,
				role: 'user',
				content: 'From user 2',
				channelId: 'telegram',
				timestamp: new Date(),
				tokenCount: 10,
			});

			const turns1 = await wm.getTurns('user-1', 10);
			const turns2 = await wm.getTurns('user-2', 10);
			expect(turns1).toHaveLength(1);
			expect(turns2).toHaveLength(1);
			expect(turns1[0]!.content).toBe('From user 1');
			expect(turns2[0]!.content).toBe('From user 2');
		});

		it('should support cross-channel turns in same user working memory', async () => {
			await wm.pushTurn('user-1', {
				turnId: 0,
				role: 'user',
				content: 'Discord message',
				channelId: 'discord',
				timestamp: new Date(),
				tokenCount: 10,
			});
			await wm.pushTurn('user-1', {
				turnId: 1,
				role: 'user',
				content: 'Telegram message',
				channelId: 'telegram',
				timestamp: new Date(),
				tokenCount: 10,
			});

			const turns = await wm.getTurns('user-1', 10);
			expect(turns).toHaveLength(2);
			expect(turns[0]!.channelId).toBe('discord');
			expect(turns[1]!.channelId).toBe('telegram');
		});
	});

	describe('getSummary / compress', () => {
		it('should return null when no summary exists', async () => {
			const summary = await wm.getSummary('user-1');
			expect(summary).toBeNull();
		});

		it('should generate summary after compress', async () => {
			for (let i = 0; i < 5; i++) {
				await wm.pushTurn('user-1', {
					turnId: i,
					role: 'user',
					content: `Message about topic ${i}`,
					channelId: 'discord',
					timestamp: new Date(),
					tokenCount: 10,
				});
			}

			await wm.compress('user-1');
			const summary = await wm.getSummary('user-1');
			expect(summary).not.toBeNull();
			expect(typeof summary).toBe('string');
		});
	});

	describe('flush', () => {
		it('should not throw (no-op in memory stub)', async () => {
			await wm.pushTurn('user-1', {
				turnId: 0,
				role: 'user',
				content: 'test',
				channelId: 'discord',
				timestamp: new Date(),
				tokenCount: 5,
			});
			await expect(wm.flush('user-1')).resolves.not.toThrow();
		});
	});

	describe('clear', () => {
		it('should remove all turns and summary for user', async () => {
			await wm.pushTurn('user-1', {
				turnId: 0,
				role: 'user',
				content: 'test',
				channelId: 'discord',
				timestamp: new Date(),
				tokenCount: 5,
			});

			await wm.clear('user-1');

			const turns = await wm.getTurns('user-1', 10);
			const summary = await wm.getSummary('user-1');
			expect(turns).toHaveLength(0);
			expect(summary).toBeNull();
		});

		it('should not affect other users', async () => {
			await wm.pushTurn('user-1', {
				turnId: 0,
				role: 'user',
				content: 'user 1 msg',
				channelId: 'discord',
				timestamp: new Date(),
				tokenCount: 5,
			});
			await wm.pushTurn('user-2', {
				turnId: 0,
				role: 'user',
				content: 'user 2 msg',
				channelId: 'discord',
				timestamp: new Date(),
				tokenCount: 5,
			});

			await wm.clear('user-1');

			const turns2 = await wm.getTurns('user-2', 10);
			expect(turns2).toHaveLength(1);
		});
	});

	describe('healthCheck', () => {
		it('should return healthy status', async () => {
			const health = await wm.healthCheck();
			expect(health.state).toBe('healthy');
			expect(health.lastChecked).toBeInstanceOf(Date);
		});
	});
});
