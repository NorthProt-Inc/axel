import Redis from 'ioredis';
/**
 * INTEG-006: PG + Redis Integration Test
 *
 * Tests the full memory pipeline with real PostgreSQL (pgvector) and Redis containers.
 * Connects to testcontainers (env vars from setup.ts) or docker-compose dev containers.
 *
 * Covers:
 * 1. PgSemanticMemory store/search/decay with real pgvector (16d for test speed)
 * 2. RedisWorkingMemory cache-aside read pattern with real Redis + PG
 * 3. PgSessionStore full session lifecycle
 * 4. PgEpisodicMemory session + message lifecycle
 * 5. PgConceptualMemory entity/relation graph with real CTE traversal
 * 6. PgMetaMemory access pattern recording + hot_memories MV refresh
 * 7. Cross-layer E2E pipeline
 */
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RedisWorkingMemory } from '../../src/cache/redis-working-memory.js';
import { PgConceptualMemory } from '../../src/db/pg-conceptual-memory.js';
import { PgEpisodicMemory } from '../../src/db/pg-episodic-memory.js';
import { PgMetaMemory } from '../../src/db/pg-meta-memory.js';
import { PgSemanticMemory } from '../../src/db/pg-semantic-memory.js';
import { PgSessionStore } from '../../src/db/pg-session-store.js';

const { Pool } = pg;

// ── Helpers ──

function makeEmbedding(dim: number, seed: number): Float32Array {
	const arr = new Float32Array(dim);
	for (let i = 0; i < dim; i++) {
		arr[i] = Math.sin(seed * (i + 1)) * 0.5;
	}
	return arr;
}

// ── Connection config (credentials from env vars — no hardcoded secrets) ──
// Env vars are provided by testcontainers (setup.ts) or must be set manually
// for docker-compose dev environments. Tests skip if PG credentials are missing.

const MISSING_CREDENTIALS =
	!process.env.PGDATABASE || !process.env.PGUSER || !process.env.PGPASSWORD;

function requireEnv(name: string): string {
	const value = process.env[name];
	if (!value) {
		throw new Error(
			`Required environment variable ${name} is not set. Testcontainers setup.ts or docker-compose must provide it.`,
		);
	}
	return value;
}

function pgAdminConfig(): pg.PoolConfig {
	return {
		host: process.env.PGHOST ?? 'localhost',
		port: Number(process.env.PGPORT ?? '5432'),
		database: requireEnv('PGDATABASE'),
		user: requireEnv('PGUSER'),
		password: requireEnv('PGPASSWORD'),
		max: 2,
	};
}

function redisConfig(): { host: string; port: number } {
	return {
		host: process.env.REDIS_HOST ?? 'localhost',
		port: Number(process.env.REDIS_PORT ?? '6379'),
	};
}

// ── Container connections ──

let pool: pg.Pool;
let adminPool: pg.Pool;
let redis: Redis;
const TEST_DB = 'axel_integ_test';

async function applyMigrations(p: pg.Pool): Promise<void> {
	const client = await p.connect();
	try {
		// 001: Extensions
		await client.query('CREATE EXTENSION IF NOT EXISTS vector');
		await client.query('CREATE EXTENSION IF NOT EXISTS pg_trgm');
		await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');

		// 002: sessions + messages
		// Schema includes both migration-strategy columns AND PgSessionStore-specific columns
		// (last_activity_at, TEXT[] channel_history for PgSessionStore.resolve ARRAY[$3])
		await client.query(`
			CREATE TABLE IF NOT EXISTS sessions (
				id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
				session_id        TEXT UNIQUE NOT NULL,
				user_id           TEXT NOT NULL,
				channel_id        TEXT,
				channel_history   TEXT[] NOT NULL DEFAULT '{}',
				summary           TEXT,
				key_topics        JSONB NOT NULL DEFAULT '[]'::jsonb,
				emotional_tone    TEXT,
				turn_count        INTEGER NOT NULL DEFAULT 0,
				started_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
				last_activity_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
				ended_at          TIMESTAMPTZ,
				created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
				metadata          JSONB NOT NULL DEFAULT '{}'::jsonb
			)
		`);
		await client.query(
			'CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id, ended_at NULLS FIRST, started_at DESC)',
		);

		await client.query(`
			CREATE TABLE IF NOT EXISTS messages (
				id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
				session_id        TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
				turn_id           INTEGER NOT NULL DEFAULT 0,
				role              TEXT NOT NULL,
				content           TEXT NOT NULL,
				channel_id        TEXT,
				timestamp         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
				emotional_context TEXT NOT NULL DEFAULT 'neutral',
				metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
				token_count       INTEGER NOT NULL DEFAULT 0,
				created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
			)
		`);
		await client.query(
			'CREATE INDEX IF NOT EXISTS idx_messages_session ON messages (session_id, turn_id)',
		);
		await client.query(
			'CREATE INDEX IF NOT EXISTS idx_messages_content_trgm ON messages USING gin (content gin_trgm_ops)',
		);

		// 003: memories (16d for test speed — production ≤2000d per ERR-069)
		await client.query(`
			CREATE TABLE IF NOT EXISTS memories (
				id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
				uuid                TEXT UNIQUE NOT NULL DEFAULT gen_random_uuid()::text,
				content             TEXT NOT NULL,
				memory_type         TEXT NOT NULL,
				importance          REAL NOT NULL DEFAULT 0.5,
				embedding           vector(16) NOT NULL,
				created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
				last_accessed       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
				access_count        INTEGER NOT NULL DEFAULT 1,
				source_channel      TEXT,
				channel_mentions    JSONB NOT NULL DEFAULT '{}'::jsonb,
				source_session      TEXT,
				decayed_importance  REAL,
				last_decayed_at     TIMESTAMPTZ
			)
		`);

		// 004: entities + relations
		await client.query(`
			CREATE TABLE IF NOT EXISTS entities (
				id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
				entity_id       TEXT UNIQUE NOT NULL,
				name            TEXT NOT NULL,
				entity_type     TEXT NOT NULL,
				properties      JSONB NOT NULL DEFAULT '{}'::jsonb,
				mentions        INTEGER NOT NULL DEFAULT 1,
				created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
				last_accessed   TIMESTAMPTZ NOT NULL DEFAULT NOW()
			)
		`);
		await client.query(
			'CREATE INDEX IF NOT EXISTS idx_entities_name ON entities USING gin (name gin_trgm_ops)',
		);

		await client.query(`
			CREATE TABLE IF NOT EXISTS relations (
				id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
				source_id       TEXT NOT NULL REFERENCES entities(entity_id) ON DELETE CASCADE,
				target_id       TEXT NOT NULL REFERENCES entities(entity_id) ON DELETE CASCADE,
				relation_type   TEXT NOT NULL,
				weight          REAL NOT NULL DEFAULT 1.0,
				context         TEXT,
				created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
				UNIQUE (source_id, target_id, relation_type)
			)
		`);
		await client.query('CREATE INDEX IF NOT EXISTS idx_relations_source ON relations (source_id)');

		// 005: access patterns + hot_memories MV
		await client.query(`
			CREATE TABLE IF NOT EXISTS memory_access_patterns (
				id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
				query_text          TEXT NOT NULL,
				matched_memory_ids  BIGINT[] NOT NULL,
				relevance_scores    REAL[] NOT NULL,
				channel_id          TEXT,
				created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
			)
		`);

		await client.query(`
			CREATE MATERIALIZED VIEW IF NOT EXISTS hot_memories AS
			SELECT
				m.id, m.uuid, m.content, m.memory_type, m.importance,
				m.access_count, m.last_accessed,
				COALESCE(cd.channel_count, 0) AS channel_diversity
			FROM memories m
			LEFT JOIN LATERAL (
				SELECT COUNT(*) AS channel_count
				FROM jsonb_object_keys(m.channel_mentions)
			) cd ON true
			WHERE m.last_accessed > NOW() - INTERVAL '7 days'
			ORDER BY m.access_count DESC, cd.channel_count DESC NULLS LAST
			LIMIT 100
		`);
		await client.query(
			'CREATE UNIQUE INDEX IF NOT EXISTS idx_hot_memories_id ON hot_memories (id)',
		);

		// session_summaries for RedisWorkingMemory.getSummary PG fallback
		await client.query(`
			CREATE TABLE IF NOT EXISTS session_summaries (
				id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
				session_id  TEXT NOT NULL,
				summary     TEXT NOT NULL,
				created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
			)
		`);
	} finally {
		client.release();
	}
}

// ── Setup / Teardown ──

beforeAll(async () => {
	const adminCfg = pgAdminConfig();
	adminPool = new Pool(adminCfg);

	// Create isolated test database
	try {
		await adminPool.query(`CREATE DATABASE ${TEST_DB}`);
	} catch (err: unknown) {
		if (err instanceof Error && !err.message.includes('already exists')) {
			throw err;
		}
	}

	pool = new Pool({ ...adminCfg, database: TEST_DB, max: 5 });

	const rCfg = redisConfig();
	redis = new Redis({ host: rCfg.host, port: rCfg.port, lazyConnect: true });
	await redis.connect();

	await applyMigrations(pool);
}, 30_000);

afterAll(async () => {
	if (!pool) return;

	// Clean Redis test keys
	const keys = await redis.keys('axel:*');
	if (keys.length > 0) {
		await redis.del(...keys);
	}
	await redis.quit();

	// Drop test database
	await pool.end();
	try {
		await adminPool.query(`DROP DATABASE IF EXISTS ${TEST_DB}`);
	} catch {
		// Ignore cleanup errors
	}
	await adminPool.end();
}, 15_000);

// ── Constants ──
const TEST_DIM = 16;

// ═══════════════════════════════════════════
// 1. PgSemanticMemory: store / search / decay
// ═══════════════════════════════════════════
describe.skipIf(MISSING_CREDENTIALS)('PgSemanticMemory (real PG + pgvector)', () => {
	let semantic: PgSemanticMemory;

	beforeAll(() => {
		semantic = new PgSemanticMemory(pool);
	});

	it('should store a memory and retrieve it by UUID', async () => {
		const embedding = makeEmbedding(TEST_DIM, 1);
		const uuid = await semantic.store({
			content: 'Integration test fact: the sky is blue',
			memoryType: 'fact',
			importance: 0.8,
			embedding,
			sourceChannel: 'cli',
			sourceSession: null,
		});

		expect(uuid).toBeTruthy();

		const retrieved = await semantic.getByUuid(uuid);
		expect(retrieved).not.toBeNull();
		expect(retrieved?.content).toBe('Integration test fact: the sky is blue');
		expect(retrieved?.memoryType).toBe('fact');
		expect(retrieved?.importance).toBeCloseTo(0.8, 1);
		expect(retrieved?.sourceChannel).toBe('cli');
		expect(retrieved?.embedding.length).toBe(TEST_DIM);
	});

	it('should search memories by cosine similarity', async () => {
		const e1 = makeEmbedding(TEST_DIM, 10);
		const e2 = makeEmbedding(TEST_DIM, 20);
		const e3 = makeEmbedding(TEST_DIM, 10.01);

		await semantic.store({
			content: 'Axel likes TypeScript',
			memoryType: 'preference',
			importance: 0.9,
			embedding: e1,
			sourceChannel: 'discord',
		});
		await semantic.store({
			content: 'Weather is warm today',
			memoryType: 'conversation',
			importance: 0.3,
			embedding: e2,
			sourceChannel: 'telegram',
		});
		await semantic.store({
			content: 'Axel prefers TypeScript over Python',
			memoryType: 'preference',
			importance: 0.85,
			embedding: e3,
			sourceChannel: 'discord',
		});

		const queryEmbedding = makeEmbedding(TEST_DIM, 10);
		const results = await semantic.search({
			text: 'TypeScript',
			embedding: queryEmbedding,
			limit: 5,
		});

		expect(results.length).toBeGreaterThanOrEqual(2);
		expect(results[0]?.memory.content).toContain('TypeScript');
		expect(results[0]?.vectorScore).toBeGreaterThan(0);
		expect(results[0]?.finalScore).toBeGreaterThan(0);
	});

	it('should search with filters (memoryTypes, minImportance)', async () => {
		const queryEmbedding = makeEmbedding(TEST_DIM, 10);
		const filtered = await semantic.search({
			text: 'TypeScript',
			embedding: queryEmbedding,
			limit: 10,
			memoryTypes: ['preference'],
			minImportance: 0.5,
		});

		for (const r of filtered) {
			expect(r.memory.memoryType).toBe('preference');
			expect(r.memory.importance).toBeGreaterThanOrEqual(0.5);
		}
	});

	it('should decay memories below threshold', async () => {
		const lowEmbed = makeEmbedding(TEST_DIM, 99);
		await semantic.store({
			content: 'Ephemeral thought',
			memoryType: 'conversation',
			importance: 0.05,
			embedding: lowEmbed,
			sourceChannel: null,
		});

		const result = await semantic.decay({ threshold: 0.1 });
		expect(result.processed).toBeGreaterThan(0);
		expect(result.deleted).toBeGreaterThanOrEqual(1);
	});

	it('should update access count', async () => {
		const embed = makeEmbedding(TEST_DIM, 50);
		const uuid = await semantic.store({
			content: 'Access count test',
			memoryType: 'fact',
			importance: 0.7,
			embedding: embed,
			sourceChannel: 'cli',
		});

		await semantic.updateAccess(uuid);
		await semantic.updateAccess(uuid);

		const mem = await semantic.getByUuid(uuid);
		expect(mem).not.toBeNull();
		expect(mem?.accessCount).toBeGreaterThanOrEqual(3);
	});

	it('should delete a memory', async () => {
		const embed = makeEmbedding(TEST_DIM, 77);
		const uuid = await semantic.store({
			content: 'To be deleted',
			memoryType: 'fact',
			importance: 0.5,
			embedding: embed,
			sourceChannel: null,
		});

		await semantic.delete(uuid);
		const result = await semantic.getByUuid(uuid);
		expect(result).toBeNull();
	});

	it('should report healthy status', async () => {
		const health = await semantic.healthCheck();
		expect(health.state).toBe('healthy');
		expect(health.latencyMs).toBeGreaterThanOrEqual(0);
	});
});

// ═══════════════════════════════════════════
// 2. RedisWorkingMemory: cache-aside pattern
// ═══════════════════════════════════════════
describe.skipIf(MISSING_CREDENTIALS)('RedisWorkingMemory (real Redis + PG)', () => {
	let working: RedisWorkingMemory;
	const userId = 'integ-wm-user';

	beforeAll(async () => {
		// messages FK requires a session row
		await pool.query(
			`INSERT INTO sessions (session_id, user_id, channel_id, started_at)
			 VALUES ($1, $1, 'cli', NOW())
			 ON CONFLICT (session_id) DO NOTHING`,
			[userId],
		);

		working = new RedisWorkingMemory(redis as never, pool);
		await redis.del(`axel:working:${userId}:turns`);
		await redis.del(`axel:working:${userId}:summary`);
	});

	it('should pushTurn and write to both PG and Redis', async () => {
		await working.pushTurn(userId, {
			turnId: 1,
			role: 'user',
			content: 'Hello Axel!',
			channelId: 'cli',
			timestamp: new Date(),
			tokenCount: 5,
		});

		const cached = await redis.lrange(`axel:working:${userId}:turns`, 0, -1);
		expect(cached.length).toBe(1);
		const parsed = JSON.parse(cached[0]!);
		expect(parsed.content).toBe('Hello Axel!');

		const pgResult = await pool.query('SELECT content FROM messages WHERE session_id = $1', [
			userId,
		]);
		expect(pgResult.rows.length).toBeGreaterThanOrEqual(1);
	});

	it('should getTurns from Redis cache (cache hit)', async () => {
		const turns = await working.getTurns(userId, 10);
		expect(turns.length).toBeGreaterThanOrEqual(1);
		expect(turns[0]?.content).toBe('Hello Axel!');
	});

	it('should fall back to PG when Redis cache is empty', async () => {
		await redis.del(`axel:working:${userId}:turns`);

		const turns = await working.getTurns(userId, 10);
		expect(turns.length).toBeGreaterThanOrEqual(1);
		expect(turns.some((t) => t.content === 'Hello Axel!')).toBe(true);
	});

	it('should compress turns into a summary', async () => {
		await working.pushTurn(userId, {
			turnId: 2,
			role: 'assistant',
			content: 'Hi! How can I help?',
			channelId: 'cli',
			timestamp: new Date(),
			tokenCount: 8,
		});

		await working.compress(userId);

		const summary = await redis.get(`axel:working:${userId}:summary`);
		expect(summary).toBeTruthy();
		// Summary contains whatever turns are currently in Redis
		expect(summary).toContain('How can I help?');
	});

	it('should flush turns (ensure PG has all, Redis cleared)', async () => {
		await working.flush(userId);

		const turnsKey = await redis.lrange(`axel:working:${userId}:turns`, 0, -1);
		expect(turnsKey.length).toBe(0);
	});

	it('should clear Redis cache', async () => {
		await working.pushTurn(userId, {
			turnId: 3,
			role: 'user',
			content: 'Clear test',
			channelId: 'cli',
			timestamp: new Date(),
			tokenCount: 3,
		});

		await working.clear(userId);

		const turns = await redis.lrange(`axel:working:${userId}:turns`, 0, -1);
		expect(turns.length).toBe(0);
	});

	it('should report healthy when Redis is up', async () => {
		const health = await working.healthCheck();
		expect(health.state).toBe('healthy');
	});
});

// ═══════════════════════════════════════════
// 3. PgSessionStore: full session lifecycle
// ═══════════════════════════════════════════
describe.skipIf(MISSING_CREDENTIALS)('PgSessionStore (real PG)', () => {
	let sessions: PgSessionStore;
	const testUserId = 'session-test-user';

	beforeAll(() => {
		sessions = new PgSessionStore(pool);
	});

	it('should create a new session on first resolve', async () => {
		const resolved = await sessions.resolve(testUserId, 'discord');

		expect(resolved.isNew).toBe(true);
		expect(resolved.channelSwitched).toBe(false);
		expect(resolved.session.userId).toBe(testUserId);
		expect(resolved.session.activeChannelId).toBe('discord');
		expect(resolved.session.turnCount).toBe(0);
	});

	it('should return existing session on same channel', async () => {
		const resolved = await sessions.resolve(testUserId, 'discord');

		expect(resolved.isNew).toBe(false);
		expect(resolved.channelSwitched).toBe(false);
		expect(resolved.session.activeChannelId).toBe('discord');
	});

	it('should detect channel switch', async () => {
		const resolved = await sessions.resolve(testUserId, 'telegram');

		expect(resolved.isNew).toBe(false);
		expect(resolved.channelSwitched).toBe(true);
		expect(resolved.session.activeChannelId).toBe('telegram');
	});

	it('should update activity and increment turn count', async () => {
		const { session } = await sessions.resolve(testUserId, 'telegram');
		await sessions.updateActivity(session.sessionId);

		const active = await sessions.getActive(testUserId);
		expect(active).not.toBeNull();
		expect(active?.turnCount).toBeGreaterThan(0);
	});

	it('should end a session', async () => {
		const { session } = await sessions.resolve(testUserId, 'telegram');
		const summary = await sessions.end(session.sessionId);
		expect(summary.sessionId).toBe(session.sessionId);
		expect(summary.endedAt).toBeInstanceOf(Date);
	});

	it('should create new session after previous ended', async () => {
		const resolved = await sessions.resolve(testUserId, 'cli');
		expect(resolved.isNew).toBe(true);
		expect(resolved.session.activeChannelId).toBe('cli');
	});
});

// ═══════════════════════════════════════════
// 4. PgEpisodicMemory: session + message
// ═══════════════════════════════════════════
describe.skipIf(MISSING_CREDENTIALS)('PgEpisodicMemory (real PG)', () => {
	let episodic: PgEpisodicMemory;
	let sessionId: string;
	const testUserId = 'episodic-test-user';

	beforeAll(() => {
		episodic = new PgEpisodicMemory(pool);
	});

	it('should create a session', async () => {
		sessionId = await episodic.createSession({
			userId: testUserId,
			channelId: 'cli',
		});
		expect(sessionId).toBeTruthy();
		expect(typeof sessionId).toBe('string');
	});

	it('should add messages to a session', async () => {
		await episodic.addMessage(sessionId, {
			role: 'user',
			content: 'What is pgvector?',
			channelId: 'cli',
			timestamp: new Date(),
			tokenCount: 10,
		});
		await episodic.addMessage(sessionId, {
			role: 'assistant',
			content: 'pgvector is a PostgreSQL extension for vector similarity search.',
			channelId: 'cli',
			timestamp: new Date(),
			tokenCount: 25,
		});
	});

	it('should search messages by content', async () => {
		const results = await episodic.searchByContent('pgvector', 5);
		expect(results.length).toBeGreaterThanOrEqual(1);
		expect(results.some((m) => m.content.includes('pgvector'))).toBe(true);
	});

	it('should end session and retrieve recent sessions', async () => {
		await episodic.endSession(sessionId, 'Discussed pgvector extension capabilities');
		const recent = await episodic.getRecentSessions(testUserId, 5);
		expect(recent.length).toBeGreaterThanOrEqual(1);
		expect(recent[0]?.summary).toContain('pgvector');
	});

	it('should report healthy status', async () => {
		const health = await episodic.healthCheck();
		expect(health.state).toBe('healthy');
	});
});

// ═══════════════════════════════════════════
// 5. PgConceptualMemory: graph traversal
// ═══════════════════════════════════════════
describe.skipIf(MISSING_CREDENTIALS)('PgConceptualMemory (real PG)', () => {
	let conceptual: PgConceptualMemory;

	beforeAll(() => {
		conceptual = new PgConceptualMemory(pool);
	});

	it('should add entities and traverse the knowledge graph', async () => {
		const markId = await conceptual.addEntity({
			name: 'Mark',
			entityType: 'person',
			metadata: { role: 'operator' },
		});
		const axelId = await conceptual.addEntity({
			name: 'Axel',
			entityType: 'agent',
		});
		const tsId = await conceptual.addEntity({
			name: 'TypeScript',
			entityType: 'technology',
		});

		await conceptual.addRelation({
			sourceId: markId,
			targetId: axelId,
			relationType: 'created',
			weight: 1.0,
		});
		await conceptual.addRelation({
			sourceId: axelId,
			targetId: tsId,
			relationType: 'built_with',
			weight: 0.9,
		});

		const graph = await conceptual.traverse(markId, 2);
		expect(graph.length).toBeGreaterThanOrEqual(2);

		const names = graph.map((n) => n.entity.name);
		expect(names).toContain('Axel');
		expect(names).toContain('TypeScript');
	});

	it('should find entity by name', async () => {
		const entity = await conceptual.findEntity('Axel');
		expect(entity).not.toBeNull();
		expect(entity?.entityType).toBe('agent');
	});

	it('should get related entities', async () => {
		const mark = await conceptual.findEntity('Mark');
		expect(mark).not.toBeNull();
		const related = await conceptual.getRelated(mark?.entityId, 'created');
		expect(related.length).toBe(1);
		expect(related[0]?.name).toBe('Axel');
	});

	it('should increment mention count', async () => {
		const axel = await conceptual.findEntity('Axel');
		expect(axel).not.toBeNull();
		await conceptual.incrementMentions(axel?.entityId);
		const updated = await conceptual.findEntity('Axel');
		expect(updated?.mentionCount).toBe(2);
	});

	it('should report healthy status', async () => {
		const health = await conceptual.healthCheck();
		expect(health.state).toBe('healthy');
	});
});

// ═══════════════════════════════════════════
// 6. PgMetaMemory: access patterns + MV
// ═══════════════════════════════════════════
describe.skipIf(MISSING_CREDENTIALS)('PgMetaMemory (real PG)', () => {
	let meta: PgMetaMemory;

	beforeAll(() => {
		meta = new PgMetaMemory(pool);
	});

	it('should record access patterns', async () => {
		const memResult = await pool.query('SELECT id FROM memories LIMIT 2');
		const memIds = memResult.rows.map((r: { id: number }) => r.id);

		if (memIds.length >= 2) {
			await meta.recordAccess({
				queryText: 'TypeScript preferences',
				matchedMemoryIds: memIds,
				relevanceScores: memIds.map(() => 0.85),
				channelId: 'discord',
			});
		}

		const result = await pool.query('SELECT COUNT(*) AS cnt FROM memory_access_patterns');
		expect(Number((result.rows[0] as { cnt: string }).cnt)).toBeGreaterThanOrEqual(
			memIds.length >= 2 ? 1 : 0,
		);
	});

	it('should refresh hot_memories materialized view', async () => {
		await meta.refreshView();
		const result = await pool.query('SELECT COUNT(*) AS cnt FROM hot_memories');
		expect(Number((result.rows[0] as { cnt: string }).cnt)).toBeGreaterThanOrEqual(0);
	});

	it('should get hot memories after refresh', async () => {
		const hot = await meta.getHotMemories(10);
		expect(Array.isArray(hot)).toBe(true);
	});

	it('should prune old patterns', async () => {
		await pool.query(
			`INSERT INTO memory_access_patterns (query_text, matched_memory_ids, relevance_scores, channel_id, created_at)
			 VALUES ('old query', '{1}', '{0.5}', 'cli', NOW() - INTERVAL '100 days')`,
		);
		const pruned = await meta.pruneOldPatterns(90);
		expect(pruned).toBeGreaterThanOrEqual(1);
	});

	it('should report healthy status', async () => {
		const health = await meta.healthCheck();
		expect(health.state).toBe('healthy');
	});
});

// ═══════════════════════════════════════════
// 7. Cross-layer: end-to-end memory pipeline
// ═══════════════════════════════════════════
describe.skipIf(MISSING_CREDENTIALS)('Cross-layer E2E: memory pipeline', () => {
	it('should store → access → record pattern → refresh MV → find in hot memories', async () => {
		const semantic = new PgSemanticMemory(pool);
		const meta = new PgMetaMemory(pool);

		const embed = makeEmbedding(TEST_DIM, 42);
		const uuid = await semantic.store({
			content: 'Mark prefers dark mode in all applications',
			memoryType: 'preference',
			importance: 0.95,
			embedding: embed,
			sourceChannel: 'discord',
		});

		await semantic.updateAccess(uuid);
		await semantic.updateAccess(uuid);
		await semantic.updateAccess(uuid);

		const memRow = await pool.query('SELECT id FROM memories WHERE uuid = $1', [uuid]);
		const memId = (memRow.rows[0] as { id: number }).id;

		await meta.recordAccess({
			queryText: 'dark mode preferences',
			matchedMemoryIds: [memId],
			relevanceScores: [0.95],
			channelId: 'discord',
		});

		await meta.refreshView();

		const hot = await meta.getHotMemories(100);
		const found = hot.find((h) => h.uuid === uuid);
		expect(found).toBeDefined();
		expect(found?.accessCount).toBeGreaterThanOrEqual(4);
	});
});
