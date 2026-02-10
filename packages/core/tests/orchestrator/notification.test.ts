import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	type NotificationResult,
	type NotificationRule,
	NotificationRuleSchema,
	NotificationScheduler,
	type NotificationSender,
	parseCronExpression,
	shouldTrigger,
} from '../../src/orchestrator/notification.js';

function createMockSender(): NotificationSender {
	return {
		send: vi.fn().mockResolvedValue(undefined),
	};
}

function createRule(overrides?: Partial<NotificationRule>): NotificationRule {
	return {
		id: 'rule-1',
		name: 'Daily reminder',
		cronExpression: '0 9 * * *',
		channelId: 'cli',
		userId: 'user-1',
		message: 'Good morning!',
		enabled: true,
		...overrides,
	};
}

describe('parseCronExpression', () => {
	it('parses standard 5-field cron', () => {
		const result = parseCronExpression('0 9 * * *');
		expect(result).toEqual({
			minute: [0],
			hour: [9],
			dayOfMonth: null,
			month: null,
			dayOfWeek: null,
		});
	});

	it('parses wildcards as null (matches all)', () => {
		const result = parseCronExpression('* * * * *');
		expect(result).toEqual({
			minute: null,
			hour: null,
			dayOfMonth: null,
			month: null,
			dayOfWeek: null,
		});
	});

	it('parses comma-separated values', () => {
		const result = parseCronExpression('0,30 9,17 * * *');
		expect(result).toEqual({
			minute: [0, 30],
			hour: [9, 17],
			dayOfMonth: null,
			month: null,
			dayOfWeek: null,
		});
	});

	it('parses range values', () => {
		const result = parseCronExpression('0 9-17 * * 1-5');
		expect(result).toEqual({
			minute: [0],
			hour: [9, 10, 11, 12, 13, 14, 15, 16, 17],
			dayOfMonth: null,
			month: null,
			dayOfWeek: [1, 2, 3, 4, 5],
		});
	});

	it('parses step values', () => {
		const result = parseCronExpression('*/15 * * * *');
		expect(result).toEqual({
			minute: [0, 15, 30, 45],
			hour: null,
			dayOfMonth: null,
			month: null,
			dayOfWeek: null,
		});
	});

	it('returns null for invalid expression', () => {
		expect(parseCronExpression('invalid')).toBeNull();
		expect(parseCronExpression('0 9 *')).toBeNull();
		expect(parseCronExpression('')).toBeNull();
	});
});

describe('shouldTrigger', () => {
	it('returns true when time matches cron', () => {
		const date = new Date(2026, 1, 9, 9, 0); // Mon Feb 9 09:00
		expect(shouldTrigger('0 9 * * *', date)).toBe(true);
	});

	it('returns false when time does not match', () => {
		const date = new Date(2026, 1, 9, 10, 0); // Mon Feb 9 10:00
		expect(shouldTrigger('0 9 * * *', date)).toBe(false);
	});

	it('matches day of week', () => {
		const monday = new Date(2026, 1, 9, 9, 0); // Monday
		const sunday = new Date(2026, 1, 8, 9, 0); // Sunday
		expect(shouldTrigger('0 9 * * 1', monday)).toBe(true);
		expect(shouldTrigger('0 9 * * 1', sunday)).toBe(false);
	});

	it('matches day of month', () => {
		const feb9 = new Date(2026, 1, 9, 9, 0);
		const feb10 = new Date(2026, 1, 10, 9, 0);
		expect(shouldTrigger('0 9 9 * *', feb9)).toBe(true);
		expect(shouldTrigger('0 9 9 * *', feb10)).toBe(false);
	});

	it('returns false for invalid cron expression', () => {
		const date = new Date();
		expect(shouldTrigger('invalid', date)).toBe(false);
	});
});

describe('NotificationRuleSchema', () => {
	it('validates a correct rule', () => {
		const rule = createRule();
		const result = NotificationRuleSchema.safeParse(rule);
		expect(result.success).toBe(true);
	});

	it('rejects missing required fields', () => {
		const result = NotificationRuleSchema.safeParse({ id: 'rule-1' });
		expect(result.success).toBe(false);
	});

	it('rejects empty cronExpression', () => {
		const result = NotificationRuleSchema.safeParse(createRule({ cronExpression: '' }));
		expect(result.success).toBe(false);
	});
});

describe('NotificationScheduler', () => {
	let sender: NotificationSender;

	beforeEach(() => {
		sender = createMockSender();
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('creates scheduler with no rules', () => {
		const scheduler = new NotificationScheduler(sender, []);
		expect(scheduler.getRules()).toEqual([]);
	});

	it('adds and retrieves rules', () => {
		const scheduler = new NotificationScheduler(sender, []);
		const rule = createRule();
		scheduler.addRule(rule);
		expect(scheduler.getRules()).toEqual([rule]);
	});

	it('removes rules by id', () => {
		const rule = createRule();
		const scheduler = new NotificationScheduler(sender, [rule]);
		scheduler.removeRule('rule-1');
		expect(scheduler.getRules()).toEqual([]);
	});

	it('enables and disables rules', () => {
		const rule = createRule({ enabled: false });
		const scheduler = new NotificationScheduler(sender, [rule]);
		scheduler.enableRule('rule-1');
		expect(scheduler.getRules()[0]?.enabled).toBe(true);
		scheduler.disableRule('rule-1');
		expect(scheduler.getRules()[0]?.enabled).toBe(false);
	});

	it('checkAndSend triggers matching rules', async () => {
		const date = new Date(2026, 1, 9, 9, 0); // matches '0 9 * * *'
		const rule = createRule();
		const scheduler = new NotificationScheduler(sender, [rule]);

		const results = await scheduler.checkAndSend(date);

		expect(results).toHaveLength(1);
		expect(results[0]).toMatchObject({
			ruleId: 'rule-1',
			success: true,
		});
		expect(sender.send).toHaveBeenCalledWith('user-1', 'cli', 'Good morning!');
	});

	it('checkAndSend skips disabled rules', async () => {
		const date = new Date(2026, 1, 9, 9, 0);
		const rule = createRule({ enabled: false });
		const scheduler = new NotificationScheduler(sender, [rule]);

		const results = await scheduler.checkAndSend(date);

		expect(results).toHaveLength(0);
		expect(sender.send).not.toHaveBeenCalled();
	});

	it('checkAndSend skips non-matching time', async () => {
		const date = new Date(2026, 1, 9, 10, 0); // does NOT match '0 9 * * *'
		const rule = createRule();
		const scheduler = new NotificationScheduler(sender, [rule]);

		const results = await scheduler.checkAndSend(date);

		expect(results).toHaveLength(0);
	});

	it('checkAndSend reports failure on send error', async () => {
		const date = new Date(2026, 1, 9, 9, 0);
		const rule = createRule();
		sender.send = vi.fn().mockRejectedValue(new Error('channel offline'));
		const scheduler = new NotificationScheduler(sender, [rule]);

		const results = await scheduler.checkAndSend(date);

		expect(results).toHaveLength(1);
		expect(results[0]).toMatchObject({
			ruleId: 'rule-1',
			success: false,
			error: 'channel offline',
		});
	});

	it('checkAndSend processes multiple rules independently', async () => {
		const date = new Date(2026, 1, 9, 9, 0);
		const rules = [
			createRule({ id: 'r1', cronExpression: '0 9 * * *', message: 'A' }),
			createRule({ id: 'r2', cronExpression: '0 10 * * *', message: 'B' }), // no match
			createRule({ id: 'r3', cronExpression: '0 9 * * *', message: 'C' }),
		];
		const scheduler = new NotificationScheduler(sender, rules);

		const results = await scheduler.checkAndSend(date);

		expect(results).toHaveLength(2);
		expect(results.map((r) => r.ruleId)).toEqual(['r1', 'r3']);
	});

	it('prevents duplicate rule ids', () => {
		const rule = createRule();
		const scheduler = new NotificationScheduler(sender, [rule]);
		expect(() => scheduler.addRule(rule)).toThrow('Duplicate rule id');
	});

	it('getRule returns specific rule', () => {
		const rule = createRule();
		const scheduler = new NotificationScheduler(sender, [rule]);
		expect(scheduler.getRule('rule-1')).toEqual(rule);
		expect(scheduler.getRule('nonexistent')).toBeNull();
	});
});
