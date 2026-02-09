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
		embeddingDimension: z.number().int().default(1536),
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

const GatewayConfigSchema = z.object({
	authToken: z.string().min(1),
	corsOrigins: z.array(z.string()).default(['http://localhost:3000']),
	trustedProxies: z.array(z.string()).default([]),
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
	gateway: GatewayConfigSchema.optional(),
	security: SecurityConfigSchema.default(SecurityConfigSchema.parse({})),
	persona: PersonaConfigSchema.default(PersonaConfigSchema.parse({})),
});

export type AxelConfig = z.infer<typeof AxelConfigSchema>;

// ─── Environment variable mapping (plan lines 689+) ───

/** Type-safe env var getter that satisfies both noUncheckedIndexedAccess and Biome */
function getEnv(env: Record<string, string | undefined>, key: string): string | undefined {
	return env[key];
}

function getEnvInt(env: Record<string, string | undefined>, key: string): number | undefined {
	const val = env[key];
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
		env: getEnv(env, 'AXEL_ENV'),
		port: getEnvInt(env, 'AXEL_PORT'),
		host: getEnv(env, 'AXEL_HOST'),
		timezone: getEnv(env, 'AXEL_TIMEZONE'),
		db: {
			url: getEnv(env, 'AXEL_DB_URL'),
			maxConnections: getEnvInt(env, 'AXEL_DB_MAX_CONNECTIONS'),
		},
		redis: {
			url: getEnv(env, 'AXEL_REDIS_URL'),
			connectTimeoutMs: getEnvInt(env, 'AXEL_REDIS_CONNECT_TIMEOUT_MS'),
			commandTimeoutMs: getEnvInt(env, 'AXEL_REDIS_COMMAND_TIMEOUT_MS'),
			maxRetriesPerRequest: getEnvInt(env, 'AXEL_REDIS_MAX_RETRIES'),
		},
		llm: {
			anthropic: {
				apiKey: getEnv(env, 'AXEL_ANTHROPIC_API_KEY'),
				model: getEnv(env, 'AXEL_ANTHROPIC_MODEL'),
				thinkingBudget: getEnvInt(env, 'AXEL_ANTHROPIC_THINKING_BUDGET'),
				maxTokens: getEnvInt(env, 'AXEL_ANTHROPIC_MAX_TOKENS'),
			},
			google: {
				apiKey: getEnv(env, 'AXEL_GOOGLE_API_KEY'),
				flashModel: getEnv(env, 'AXEL_GOOGLE_FLASH_MODEL'),
				embeddingModel: getEnv(env, 'AXEL_GOOGLE_EMBEDDING_MODEL'),
				embeddingDimension: getEnvInt(env, 'AXEL_GOOGLE_EMBEDDING_DIMENSION'),
			},
		},
		channels: buildChannelConfig(env),
		gateway: buildGatewayConfig(env),
		security: {
			maxRequestsPerMinute: getEnvInt(env, 'AXEL_MAX_REQUESTS_PER_MINUTE'),
		},
		persona: {
			path: getEnv(env, 'AXEL_PERSONA_PATH'),
			hotReload: getEnv(env, 'AXEL_PERSONA_HOT_RELOAD') === 'false' ? false : undefined,
		},
	};

	const cleaned = stripUndefined(raw);
	return AxelConfigSchema.parse(cleaned);
}

function buildGatewayConfig(
	env: Record<string, string | undefined>,
): Record<string, unknown> | undefined {
	const authToken = getEnv(env, 'AXEL_GATEWAY_AUTH_TOKEN');
	if (!authToken) return undefined;

	const corsRaw = getEnv(env, 'AXEL_GATEWAY_CORS_ORIGINS');
	const corsOrigins = corsRaw ? corsRaw.split(',').map((s) => s.trim()) : undefined;

	const result: Record<string, unknown> = { authToken };
	if (corsOrigins) result.corsOrigins = corsOrigins;
	return result;
}

function buildChannelConfig(
	env: Record<string, string | undefined>,
): Record<string, unknown> | undefined {
	const discordToken = getEnv(env, 'AXEL_DISCORD_BOT_TOKEN');
	const telegramToken = getEnv(env, 'AXEL_TELEGRAM_BOT_TOKEN');
	const discord = discordToken ? { botToken: discordToken } : undefined;
	const telegram = telegramToken ? { botToken: telegramToken } : undefined;

	if (discord === undefined && telegram === undefined) return undefined;
	const result: Record<string, unknown> = {};
	if (discord) result.discord = discord;
	if (telegram) result.telegram = telegram;
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
