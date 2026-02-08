import { describe, expect, it } from 'vitest';
import { AxelConfigSchema, loadConfig, type AxelConfig } from '../src/config.js';

describe('AxelConfigSchema', () => {
	describe('validation', () => {
		it('accepts valid full configuration', () => {
			const input = {
				env: 'development',
				port: 8000,
				host: '0.0.0.0',
				timezone: 'America/Vancouver',
				db: {
					url: 'postgresql://user:pass@localhost:5432/axel',
					maxConnections: 10,
				},
				redis: {
					url: 'redis://localhost:6379',
					connectTimeoutMs: 5000,
					commandTimeoutMs: 1000,
					maxRetriesPerRequest: 3,
				},
				llm: {
					anthropic: {
						apiKey: 'sk-test-key',
						model: 'claude-sonnet-4-5-20250929',
						thinkingBudget: 10000,
						maxTokens: 16384,
					},
					google: {
						apiKey: 'google-test-key',
						flashModel: 'gemini-3-flash-preview',
						embeddingModel: 'gemini-embedding-001',
						embeddingDimension: 3072,
					},
					fallbackChain: ['anthropic', 'google'],
				},
				memory: {
					decay: {
						baseRate: 0.001,
						minRetention: 0.3,
						deleteThreshold: 0.03,
						accessStabilityK: 0.3,
						relationResistanceK: 0.1,
						channelDiversityK: 0.2,
						recencyBoost: 1.3,
						recencyAgeThreshold: 168,
						recencyAccessThreshold: 24,
						typeMultipliers: {
							fact: 0.3,
							preference: 0.5,
							insight: 0.7,
							conversation: 1.0,
						},
					},
					budgets: {
						systemPrompt: 8000,
						workingMemory: 40000,
						semanticSearch: 12000,
						graphTraversal: 4000,
						sessionArchive: 4000,
						streamBuffer: 2000,
						metaMemory: 2000,
						toolDefinitions: 4000,
					},
					workingMemoryMaxTurns: 20,
					sessionArchiveDays: 30,
					consolidationIntervalHours: 6,
				},
				channels: {
					discord: {
						botToken: 'discord-bot-token',
						allowedGuilds: [],
					},
					telegram: {
						botToken: 'telegram-bot-token',
						allowedUsers: [],
					},
					cli: {
						enabled: true,
					},
				},
				security: {
					iotRequireHttps: true,
					commandAllowlist: ['ls', 'cat', 'git'],
					maxRequestsPerMinute: 30,
					toolApprovalRequired: ['execute_command'],
				},
				persona: {
					path: './data/dynamic_persona.json',
					hotReload: true,
				},
			};

			const result = AxelConfigSchema.safeParse(input);
			expect(result.success).toBe(true);
		});

		it('applies defaults for optional fields', () => {
			const minimal = {
				db: { url: 'postgresql://localhost:5432/axel' },
				redis: { url: 'redis://localhost:6379' },
				llm: {
					anthropic: { apiKey: 'sk-key' },
					google: { apiKey: 'g-key' },
				},
			};

			const result = AxelConfigSchema.safeParse(minimal);
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.env).toBe('development');
				expect(result.data.port).toBe(8000);
				expect(result.data.host).toBe('0.0.0.0');
				expect(result.data.memory.budgets.workingMemory).toBe(40000);
				expect(result.data.memory.decay.baseRate).toBe(0.001);
				expect(result.data.security.maxRequestsPerMinute).toBe(30);
				expect(result.data.persona.path).toBe('./data/dynamic_persona.json');
			}
		});

		it('rejects missing db.url', () => {
			const input = {
				db: { maxConnections: 10 },
				redis: { url: 'redis://localhost:6379' },
				llm: {
					anthropic: { apiKey: 'sk-key' },
					google: { apiKey: 'g-key' },
				},
			};

			const result = AxelConfigSchema.safeParse(input);
			expect(result.success).toBe(false);
		});

		it('rejects missing anthropic apiKey', () => {
			const input = {
				db: { url: 'postgresql://localhost:5432/axel' },
				redis: { url: 'redis://localhost:6379' },
				llm: {
					anthropic: { apiKey: '' },
					google: { apiKey: 'g-key' },
				},
			};

			const result = AxelConfigSchema.safeParse(input);
			expect(result.success).toBe(false);
		});

		it('rejects invalid env value', () => {
			const input = {
				env: 'staging',
				db: { url: 'postgresql://localhost:5432/axel' },
				redis: { url: 'redis://localhost:6379' },
				llm: {
					anthropic: { apiKey: 'sk-key' },
					google: { apiKey: 'g-key' },
				},
			};

			const result = AxelConfigSchema.safeParse(input);
			expect(result.success).toBe(false);
		});

		it('rejects negative thinkingBudget', () => {
			const input = {
				db: { url: 'postgresql://localhost:5432/axel' },
				redis: { url: 'redis://localhost:6379' },
				llm: {
					anthropic: { apiKey: 'sk-key', thinkingBudget: -1 },
					google: { apiKey: 'g-key' },
				},
			};

			const result = AxelConfigSchema.safeParse(input);
			expect(result.success).toBe(false);
		});

		it('rejects minRetention outside 0-1 range', () => {
			const input = {
				db: { url: 'postgresql://localhost:5432/axel' },
				redis: { url: 'redis://localhost:6379' },
				llm: {
					anthropic: { apiKey: 'sk-key' },
					google: { apiKey: 'g-key' },
				},
				memory: { decay: { minRetention: 1.5 } },
			};

			const result = AxelConfigSchema.safeParse(input);
			expect(result.success).toBe(false);
		});

		it('allows optional channel configs', () => {
			const input = {
				db: { url: 'postgresql://localhost:5432/axel' },
				redis: { url: 'redis://localhost:6379' },
				llm: {
					anthropic: { apiKey: 'sk-key' },
					google: { apiKey: 'g-key' },
				},
				channels: {},
			};

			const result = AxelConfigSchema.safeParse(input);
			expect(result.success).toBe(true);
		});
	});

	describe('loadConfig', () => {
		it('loads config from environment variables', () => {
			const env: Record<string, string> = {
				AXEL_ENV: 'production',
				AXEL_PORT: '3000',
				AXEL_HOST: '127.0.0.1',
				AXEL_DB_URL: 'postgresql://prod:pass@db:5432/axel',
				AXEL_DB_MAX_CONNECTIONS: '20',
				AXEL_REDIS_URL: 'redis://redis:6379',
				AXEL_ANTHROPIC_API_KEY: 'sk-prod-key',
				AXEL_GOOGLE_API_KEY: 'google-prod-key',
			};

			const config = loadConfig(env);
			expect(config.env).toBe('production');
			expect(config.port).toBe(3000);
			expect(config.host).toBe('127.0.0.1');
			expect(config.db.url).toBe('postgresql://prod:pass@db:5432/axel');
			expect(config.db.maxConnections).toBe(20);
			expect(config.llm.anthropic.apiKey).toBe('sk-prod-key');
		});

		it('throws on invalid environment variables', () => {
			const env: Record<string, string> = {
				AXEL_DB_URL: 'not-a-url',
				AXEL_REDIS_URL: 'redis://localhost:6379',
				AXEL_ANTHROPIC_API_KEY: 'sk-key',
				AXEL_GOOGLE_API_KEY: 'g-key',
			};

			expect(() => loadConfig(env)).toThrow();
		});

		it('uses defaults when optional env vars are missing', () => {
			const env: Record<string, string> = {
				AXEL_DB_URL: 'postgresql://localhost:5432/axel',
				AXEL_REDIS_URL: 'redis://localhost:6379',
				AXEL_ANTHROPIC_API_KEY: 'sk-key',
				AXEL_GOOGLE_API_KEY: 'g-key',
			};

			const config = loadConfig(env);
			expect(config.env).toBe('development');
			expect(config.port).toBe(8000);
			expect(config.memory.budgets.workingMemory).toBe(40000);
		});

		it('loads discord bot token from env', () => {
			const env: Record<string, string> = {
				AXEL_DB_URL: 'postgresql://localhost:5432/axel',
				AXEL_REDIS_URL: 'redis://localhost:6379',
				AXEL_ANTHROPIC_API_KEY: 'sk-key',
				AXEL_GOOGLE_API_KEY: 'g-key',
				AXEL_DISCORD_BOT_TOKEN: 'discord-token',
			};

			const config = loadConfig(env);
			expect(config.channels.discord?.botToken).toBe('discord-token');
		});

		it('loads telegram bot token from env', () => {
			const env: Record<string, string> = {
				AXEL_DB_URL: 'postgresql://localhost:5432/axel',
				AXEL_REDIS_URL: 'redis://localhost:6379',
				AXEL_ANTHROPIC_API_KEY: 'sk-key',
				AXEL_GOOGLE_API_KEY: 'g-key',
				AXEL_TELEGRAM_BOT_TOKEN: 'tg-token',
			};

			const config = loadConfig(env);
			expect(config.channels.telegram?.botToken).toBe('tg-token');
		});
	});
});
