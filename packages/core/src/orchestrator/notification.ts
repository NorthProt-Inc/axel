import { z } from 'zod';

// ─── Cron Expression Types ───

/** Parsed cron fields — null means "match all" (wildcard) */
interface ParsedCron {
	readonly minute: readonly number[] | null;
	readonly hour: readonly number[] | null;
	readonly dayOfMonth: readonly number[] | null;
	readonly month: readonly number[] | null;
	readonly dayOfWeek: readonly number[] | null;
}

// ─── Notification Types ───

/** Notification rule defining when and what to send */
interface NotificationRule {
	readonly id: string;
	readonly name: string;
	readonly cronExpression: string;
	readonly channelId: string;
	readonly userId: string;
	readonly message: string;
	readonly enabled: boolean;
}

/** Result of a notification send attempt */
interface NotificationResult {
	readonly ruleId: string;
	readonly success: boolean;
	readonly error?: string;
	readonly sentAt: Date;
}

/** Notification sender interface (DI contract) */
interface NotificationSender {
	send(userId: string, channelId: string, message: string): Promise<void>;
}

// ─── Zod Schema ───

const NotificationRuleSchema = z.object({
	id: z.string().min(1),
	name: z.string().min(1),
	cronExpression: z.string().min(1),
	channelId: z.string().min(1),
	userId: z.string().min(1),
	message: z.string().min(1),
	enabled: z.boolean(),
});

// ─── Cron Parsing ───

function parseField(field: string, min: number, max: number): readonly number[] | null {
	if (field === '*') return null;

	// Step: */n
	if (field.startsWith('*/')) {
		const step = Number.parseInt(field.slice(2), 10);
		if (Number.isNaN(step) || step <= 0) return null;
		const values: number[] = [];
		for (let i = min; i <= max; i += step) {
			values.push(i);
		}
		return values;
	}

	// Range: a-b
	if (field.includes('-') && !field.includes(',')) {
		const [startStr, endStr] = field.split('-');
		const start = Number.parseInt(startStr ?? '', 10);
		const end = Number.parseInt(endStr ?? '', 10);
		if (Number.isNaN(start) || Number.isNaN(end)) return null;
		const values: number[] = [];
		for (let i = start; i <= end; i++) {
			values.push(i);
		}
		return values;
	}

	// List: a,b,c
	if (field.includes(',')) {
		const values = field.split(',').map((v) => Number.parseInt(v.trim(), 10));
		if (values.some((v) => Number.isNaN(v))) return null;
		return values;
	}

	// Single value
	const val = Number.parseInt(field, 10);
	if (Number.isNaN(val)) return null;
	return [val];
}

/**
 * Parse a standard 5-field cron expression.
 * Fields: minute hour dayOfMonth month dayOfWeek
 * Returns null if the expression is invalid.
 */
function parseCronExpression(expression: string): ParsedCron | null {
	const parts = expression.trim().split(/\s+/);
	if (parts.length !== 5) return null;

	const [minuteStr, hourStr, domStr, monthStr, dowStr] = parts;
	if (!minuteStr || !hourStr || !domStr || !monthStr || !dowStr) return null;

	const minute = parseField(minuteStr, 0, 59);
	const hour = parseField(hourStr, 0, 23);
	const dayOfMonth = parseField(domStr, 1, 31);
	const month = parseField(monthStr, 1, 12);
	const dayOfWeek = parseField(dowStr, 0, 6);

	return { minute, hour, dayOfMonth, month, dayOfWeek };
}

/**
 * Check if a given date matches a cron expression.
 */
function shouldTrigger(cronExpression: string, date: Date): boolean {
	const parsed = parseCronExpression(cronExpression);
	if (!parsed) return false;

	const minute = date.getMinutes();
	const hour = date.getHours();
	const dayOfMonth = date.getDate();
	const month = date.getMonth() + 1; // JS months are 0-indexed
	const dayOfWeek = date.getDay(); // 0 = Sunday

	if (parsed.minute !== null && !parsed.minute.includes(minute)) return false;
	if (parsed.hour !== null && !parsed.hour.includes(hour)) return false;
	if (parsed.dayOfMonth !== null && !parsed.dayOfMonth.includes(dayOfMonth)) return false;
	if (parsed.month !== null && !parsed.month.includes(month)) return false;
	if (parsed.dayOfWeek !== null && !parsed.dayOfWeek.includes(dayOfWeek)) return false;

	return true;
}

// ─── Notification Scheduler ───

/**
 * Proactive Notification Scheduler.
 *
 * Manages cron-like notification rules and sends messages through channels.
 * DI-friendly: receives NotificationSender via constructor injection.
 */
class NotificationScheduler {
	private readonly sender: NotificationSender;
	private rules: NotificationRule[];

	constructor(sender: NotificationSender, rules: readonly NotificationRule[]) {
		this.sender = sender;
		this.rules = [...rules];
	}

	getRules(): readonly NotificationRule[] {
		return [...this.rules];
	}

	getRule(id: string): NotificationRule | null {
		return this.rules.find((r) => r.id === id) ?? null;
	}

	addRule(rule: NotificationRule): void {
		if (this.rules.some((r) => r.id === rule.id)) {
			throw new Error(`Duplicate rule id: ${rule.id}`);
		}
		this.rules.push(rule);
	}

	removeRule(id: string): void {
		this.rules = this.rules.filter((r) => r.id !== id);
	}

	enableRule(id: string): void {
		this.rules = this.rules.map((r) => (r.id === id ? { ...r, enabled: true } : r));
	}

	disableRule(id: string): void {
		this.rules = this.rules.map((r) => (r.id === id ? { ...r, enabled: false } : r));
	}

	/**
	 * Check all enabled rules against the given time and send matching notifications.
	 * Returns results for each triggered rule.
	 */
	async checkAndSend(now: Date): Promise<readonly NotificationResult[]> {
		const results: NotificationResult[] = [];

		for (const rule of this.rules) {
			if (!rule.enabled) continue;
			if (!shouldTrigger(rule.cronExpression, now)) continue;

			try {
				await this.sender.send(rule.userId, rule.channelId, rule.message);
				results.push({
					ruleId: rule.id,
					success: true,
					sentAt: now,
				});
			} catch (error) {
				results.push({
					ruleId: rule.id,
					success: false,
					error: error instanceof Error ? error.message : String(error),
					sentAt: now,
				});
			}
		}

		return results;
	}
}

export {
	NotificationScheduler,
	parseCronExpression,
	shouldTrigger,
	NotificationRuleSchema,
	type NotificationRule,
	type NotificationResult,
	type NotificationSender,
	type ParsedCron,
};
