import { z } from 'zod';

// ─── Sub-schemas (plan lines 583-684) ───

const TypeMultipliersSchema = z.object({
	fact: z.number().default(0.3),
	preference: z.number().default(0.5),
	insight: z.number().default(0.7),
	conversation: z.number().default(1.0),
});

const DecayConfigSchema = z.object({
	baseRate: z.number().default(0.001),
	minRetention: z.number().min(0).max(1).default(0.3),
	deleteThreshold: z.number().default(0.03),
	accessStabilityK: z.number().default(0.3),
	relationResistanceK: z.number().default(0.1),
	channelDiversityK: z.number().default(0.2),
	recencyBoost: z.number().default(1.3),
	recencyAgeThreshold: z.number().default(168),
	recencyAccessThreshold: z.number().default(24),
	typeMultipliers: TypeMultipliersSchema.default(TypeMultipliersSchema.parse({})),
});

const BudgetsSchema = z.object({
	systemPrompt: z.number().int().default(8000),
	workingMemory: z.number().int().default(40000),
	semanticSearch: z.number().int().default(12000),
	graphTraversal: z.number().int().default(4000),
	sessionArchive: z.number().int().default(4000),
	streamBuffer: z.number().int().default(2000),
	metaMemory: z.number().int().default(2000),
	toolDefinitions: z.number().int().default(4000),
});

const MemoryConfigSchema = z.object({
	decay: DecayConfigSchema.default(DecayConfigSchema.parse({})),
	budgets: BudgetsSchema.default(BudgetsSchema.parse({})),
	workingMemoryMaxTurns: z.number().int().default(20),
	sessionArchiveDays: z.number().int().default(30),
	consolidationIntervalHours: z.number().int().default(6),
});

const LlmConfigSchema = z.object({
	anthropic: z.object({
		apiKey: z.string().min(1),
		model: z.string().default('claude-sonnet-4-5-20250929'),
		thinkingBudget: z.number().int().min(0).max(32000).default(10000),
		maxTokens: z.number().int().default(16384),
	}),
	google: z.object({
		apiKey: z.string().min(1),
		flashModel: z.string().default('gemini-3-flash-preview'),
		embeddingModel: z.string().default('gemini-embedding-001'),
		embeddingDimension: z.number().int().default(3072),
	}),
	fallbackChain: z
		.array(z.enum(['anthropic', 'google', 'ollama']))
		.default(['anthropic', 'google']),
});

const ChannelConfigSchema = z.object({
	discord: z
		.object({
			botToken: z.string().optional(),
			allowedGuilds: z.array(z.string()).default([]),
		})
		.optional(),
	telegram: z
		.object({
			botToken: z.string().optional(),
			allowedUsers: z.array(z.number()).default([]),
		})
		.optional(),
	cli: z
		.object({
			enabled: z.boolean().default(true),
		})
		.optional(),
});

const SecurityConfigSchema = z.object({
	iotRequireHttps: z.boolean().default(true),
	commandAllowlist: z
		.array(z.string())
		.default([
			'ls',
			'cat',
			'head',
			'tail',
			'grep',
			'find',
			'wc',
			'date',
			'whoami',
			'git',
			'pnpm',
			'node',
		]),
	maxRequestsPerMinute: z.number().int().default(30),
	toolApprovalRequired: z
		.array(z.string())
		.default(['execute_command', 'delete_file', 'hass_control_device']),
});

const PersonaConfigSchema = z.object({
	path: z.string().default('./data/dynamic_persona.json'),
	hotReload: z.boolean().default(true),
});

// ─── Root schema ───

export const AxelConfigSchema = z.object({
	env: z.enum(['development', 'production', 'test']).default('development'),
	port: z.number().int().default(8000),
	host: z.string().default('0.0.0.0'),
	timezone: z.string().default('America/Vancouver'),
	db: z.object({
		url: z.string().url(),
		maxConnections: z.number().int().default(10),
	}),
	redis: z.object({
		url: z.string().url(),
		connectTimeoutMs: z.number().int().default(5000),
		commandTimeoutMs: z.number().int().default(1000),
		maxRetriesPerRequest: z.number().int().default(3),
	}),
	llm: LlmConfigSchema,
	memory: MemoryConfigSchema.default(MemoryConfigSchema.parse({})),
	channels: ChannelConfigSchema.default(ChannelConfigSchema.parse({})),
	security: SecurityConfigSchema.default(SecurityConfigSchema.parse({})),
	persona: PersonaConfigSchema.default(PersonaConfigSchema.parse({})),
});

export type AxelConfig = z.infer<typeof AxelConfigSchema>;

// ─── Environment variable mapping (plan lines 689+) ───

function parseOptionalInt(val: string | undefined): number | undefined {
	if (val === undefined) return undefined;
	const n = Number.parseInt(val, 10);
	return Number.isNaN(n) ? undefined : n;
}

/**
 * Load configuration from environment variables.
 *
 * Maps AXEL_* env vars to the AxelConfigSchema structure.
 * Validates with Zod; throws on invalid configuration.
 */
export function loadConfig(env: Record<string, string | undefined> = process.env): AxelConfig {
	const raw: Record<string, unknown> = {
		env: env['AXEL_ENV'],
		port: parseOptionalInt(env['AXEL_PORT']),
		host: env['AXEL_HOST'],
		timezone: env['AXEL_TIMEZONE'],
		db: {
			url: env['AXEL_DB_URL'],
			maxConnections: parseOptionalInt(env['AXEL_DB_MAX_CONNECTIONS']),
		},
		redis: {
			url: env['AXEL_REDIS_URL'],
			connectTimeoutMs: parseOptionalInt(env['AXEL_REDIS_CONNECT_TIMEOUT_MS']),
			commandTimeoutMs: parseOptionalInt(env['AXEL_REDIS_COMMAND_TIMEOUT_MS']),
			maxRetriesPerRequest: parseOptionalInt(env['AXEL_REDIS_MAX_RETRIES']),
		},
		llm: {
			anthropic: {
				apiKey: env['AXEL_ANTHROPIC_API_KEY'],
				model: env['AXEL_ANTHROPIC_MODEL'],
				thinkingBudget: parseOptionalInt(env['AXEL_ANTHROPIC_THINKING_BUDGET']),
				maxTokens: parseOptionalInt(env['AXEL_ANTHROPIC_MAX_TOKENS']),
			},
			google: {
				apiKey: env['AXEL_GOOGLE_API_KEY'],
				flashModel: env['AXEL_GOOGLE_FLASH_MODEL'],
				embeddingModel: env['AXEL_GOOGLE_EMBEDDING_MODEL'],
				embeddingDimension: parseOptionalInt(env['AXEL_GOOGLE_EMBEDDING_DIMENSION']),
			},
		},
		channels: buildChannelConfig(env),
		security: {
			maxRequestsPerMinute: parseOptionalInt(env['AXEL_MAX_REQUESTS_PER_MINUTE']),
		},
		persona: {
			path: env['AXEL_PERSONA_PATH'],
			hotReload: env['AXEL_PERSONA_HOT_RELOAD'] === 'false' ? false : undefined,
		},
	};

	const cleaned = stripUndefined(raw);
	return AxelConfigSchema.parse(cleaned);
}

function buildChannelConfig(
	env: Record<string, string | undefined>,
): Record<string, unknown> | undefined {
	const discord = env['AXEL_DISCORD_BOT_TOKEN']
		? { botToken: env['AXEL_DISCORD_BOT_TOKEN'] }
		: undefined;

	const telegram = env['AXEL_TELEGRAM_BOT_TOKEN']
		? { botToken: env['AXEL_TELEGRAM_BOT_TOKEN'] }
		: undefined;

	if (discord === undefined && telegram === undefined) return undefined;
	const result: Record<string, unknown> = {};
	if (discord) result['discord'] = discord;
	if (telegram) result['telegram'] = telegram;
	return result;
}

function stripUndefined(obj: Record<string, unknown>): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(obj)) {
		if (value === undefined) continue;
		if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
			const nested = stripUndefined(value as Record<string, unknown>);
			if (Object.keys(nested).length > 0) {
				result[key] = nested;
			}
		} else {
			result[key] = value;
		}
	}
	return result;
}
