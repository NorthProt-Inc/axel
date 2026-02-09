import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { GoogleGenerativeAI, TaskType } from '@google/generative-ai';
import Database from 'better-sqlite3';
import pg from 'pg';
import { loadConfig } from './config.js';
import { createMigrator } from './migrate.js';
import type { MigratorDeps } from './migrate.js';
import type {
	AxelEntity,
	AxelInteractionLog,
	AxelMemory,
	AxelMessage,
	AxelRelation,
	AxelSession,
	AxelSessionSummary,
	AxnmihnInteractionLog,
	AxnmihnMessage,
	AxnmihnSession,
	ChromaMemory,
	KnowledgeGraphData,
	KnowledgeGraphEntity,
	KnowledgeGraphRelation,
	MigrationConfig,
} from './types.js';
import {
	validateChromaMemories,
	validateKnowledgeGraph,
	validateSourceMessages,
	validateSourceSessions,
} from './validate.js';

// ---------------------------------------------------------------------------
// 1a. SQLite Extractors
// ---------------------------------------------------------------------------

function extractSessions(db: Database.Database): readonly AxnmihnSession[] {
	return db.prepare('SELECT * FROM sessions').all() as AxnmihnSession[];
}

function extractMessages(db: Database.Database): readonly AxnmihnMessage[] {
	return db
		.prepare('SELECT * FROM messages ORDER BY session_id, turn_id')
		.all() as AxnmihnMessage[];
}

function extractInteractionLogs(db: Database.Database): readonly AxnmihnInteractionLog[] {
	return db.prepare('SELECT * FROM interaction_logs ORDER BY ts').all() as AxnmihnInteractionLog[];
}

// ---------------------------------------------------------------------------
// 1b. ChromaDB Extractor
// ---------------------------------------------------------------------------

interface ChromaRow {
	readonly embedding_id: string;
	readonly key: string;
	readonly string_value: string | null;
	readonly int_value: number | null;
	readonly float_value: number | null;
}

function extractChromaMemories(chromaDbPath: string): readonly ChromaMemory[] {
	const db = new Database(chromaDbPath, { readonly: true });

	const rows = db
		.prepare(`
		SELECT e.embedding_id, em.key, em.string_value, em.int_value, em.float_value
		FROM embeddings e
		JOIN embedding_metadata em ON e.id = em.id
	`)
		.all() as readonly ChromaRow[];

	db.close();

	// Group by embedding_id
	const grouped = new Map<string, Map<string, string | number | null>>();
	for (const row of rows) {
		let meta = grouped.get(row.embedding_id);
		if (!meta) {
			meta = new Map();
			grouped.set(row.embedding_id, meta);
		}
		const value = row.string_value ?? row.float_value ?? row.int_value;
		meta.set(row.key, value);
	}

	const memories: ChromaMemory[] = [];
	for (const [id, meta] of grouped) {
		const content = meta.get('chroma:document');
		if (typeof content !== 'string' || content === '') continue;

		const importance = meta.get('importance');
		const repetitions = meta.get('repetitions');
		const createdAt = meta.get('created_at');
		const lastAccessed = meta.get('last_accessed');
		const memoryType = meta.get('type');

		memories.push({
			id,
			content,
			metadata: {
				...(typeof memoryType === 'string' ? { memory_type: memoryType } : {}),
				...(typeof importance === 'number' ? { importance } : {}),
				...(typeof createdAt === 'string' ? { created_at: createdAt } : {}),
				...(typeof lastAccessed === 'string' ? { last_accessed: lastAccessed } : {}),
				...(typeof repetitions === 'number' ? { access_count: repetitions } : {}),
			},
		});
	}

	return memories;
}

// ---------------------------------------------------------------------------
// 1c. Knowledge Graph Loader
// ---------------------------------------------------------------------------

interface RawKGEntity {
	readonly id: string;
	readonly name: string;
	readonly entity_type: string;
	readonly properties: Record<string, unknown>;
	readonly mentions: number;
	readonly created_at: string;
	readonly last_accessed: string;
}

interface RawKGRelation {
	readonly source_id: string;
	readonly target_id: string;
	readonly relation_type: string;
	readonly weight: number;
	readonly context?: string;
	readonly created_at: string;
}

function loadKnowledgeGraph(filePath: string): KnowledgeGraphData {
	const raw = readFileSync(filePath, 'utf-8');
	const data = JSON.parse(raw) as {
		entities: Record<string, RawKGEntity>;
		relations: Record<string, RawKGRelation>;
	};

	const entities: KnowledgeGraphEntity[] = Object.values(data.entities).map((e) => ({
		entity_id: e.id,
		name: e.name,
		entity_type: e.entity_type,
		properties: e.properties,
		mentions: e.mentions,
		created_at: e.created_at,
		last_accessed: e.last_accessed,
	}));

	const relations: KnowledgeGraphRelation[] = Object.values(data.relations).map((r) => {
		const rel: KnowledgeGraphRelation = {
			source_id: r.source_id,
			target_id: r.target_id,
			relation_type: r.relation_type,
			weight: r.weight,
			created_at: r.created_at,
		};
		if (r.context !== undefined) {
			return { ...rel, context: r.context };
		}
		return rel;
	});

	return { entities, relations };
}

// ---------------------------------------------------------------------------
// 1d. Gemini Embedding Batch
// ---------------------------------------------------------------------------

const EMBED_MODEL = 'gemini-embedding-001';
const EMBED_DIMENSION = 3072;
const BATCH_SIZE = 100;
const BATCH_DELAY_MS = 2000;
const EMBED_CACHE_PATH = join(import.meta.dirname ?? '.', '..', '.embed-cache.json');

function loadEmbedCache(): Map<string, number[]> {
	if (!existsSync(EMBED_CACHE_PATH)) return new Map();
	try {
		const raw = JSON.parse(readFileSync(EMBED_CACHE_PATH, 'utf-8')) as Record<string, number[]>;
		return new Map(Object.entries(raw));
	} catch {
		return new Map();
	}
}

function saveEmbedCache(cache: Map<string, number[]>): void {
	writeFileSync(EMBED_CACHE_PATH, JSON.stringify(Object.fromEntries(cache)));
}

function createEmbedBatch(
	apiKey: string,
): (texts: readonly string[], taskType: string) => Promise<readonly Float32Array[]> {
	const genAI = new GoogleGenerativeAI(apiKey);
	const model = genAI.getGenerativeModel({ model: EMBED_MODEL });
	const cache = loadEmbedCache();

	return async (texts: readonly string[], _taskType: string): Promise<readonly Float32Array[]> => {
		const results: (Float32Array | null)[] = new Array(texts.length).fill(null);
		const uncachedIndices: number[] = [];

		for (let i = 0; i < texts.length; i++) {
			const cached = cache.get(texts[i]!);
			if (cached) {
				results[i] = new Float32Array(cached);
			} else {
				uncachedIndices.push(i);
			}
		}

		if (uncachedIndices.length === 0) {
			console.log(`  All ${texts.length} embeddings loaded from cache.`);
			return results as Float32Array[];
		}

		console.log(
			`  Cache hit: ${texts.length - uncachedIndices.length}, need to embed: ${uncachedIndices.length}`,
		);

		for (let i = 0; i < uncachedIndices.length; i += BATCH_SIZE) {
			if (i > 0) {
				await sleep(BATCH_DELAY_MS);
			}
			const batchIndices = uncachedIndices.slice(i, i + BATCH_SIZE);
			const batchNum = Math.floor(i / BATCH_SIZE) + 1;
			const totalBatches = Math.ceil(uncachedIndices.length / BATCH_SIZE);
			process.stdout.write(
				`  Embedding batch ${batchNum}/${totalBatches} (${batchIndices.length} texts)...\r`,
			);

			const batchResults = await Promise.all(
				batchIndices.map(async (idx) => {
					const text = texts[idx]!;
					const response = await model.embedContent({
						content: { parts: [{ text }], role: 'user' },
						taskType: TaskType.RETRIEVAL_DOCUMENT,
					});
					const values = response.embedding.values.slice(0, EMBED_DIMENSION);
					const arr = new Float32Array(values);
					cache.set(text, Array.from(arr));
					return { idx, arr };
				}),
			);

			for (const { idx, arr } of batchResults) {
				results[idx] = arr;
			}

			// Save cache after each batch in case of interruption
			saveEmbedCache(cache);
		}

		process.stdout.write('\n');
		return results as Float32Array[];
	};
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// 1e. PostgreSQL Inserters
// ---------------------------------------------------------------------------

function createPgInserters(pool: pg.Pool) {
	return {
		async insertSessions(sessions: readonly AxelSession[]): Promise<number> {
			if (sessions.length === 0) return 0;
			const client = await pool.connect();
			try {
				await client.query('BEGIN');
				for (const s of sessions) {
					await client.query(
						`INSERT INTO sessions (session_id, user_id, channel_id, channel_history, turn_count, started_at, ended_at, last_activity_at, created_at)
						 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
						 ON CONFLICT (session_id) DO NOTHING`,
						[
							s.session_id,
							s.user_id,
							s.channel_id,
							s.channel_history,
							s.turn_count,
							s.started_at,
							s.ended_at,
							s.last_activity_at,
							s.created_at,
						],
					);
				}
				await client.query('COMMIT');
				return sessions.length;
			} catch (err) {
				await client.query('ROLLBACK');
				throw err;
			} finally {
				client.release();
			}
		},

		async insertSessionSummaries(summaries: readonly AxelSessionSummary[]): Promise<number> {
			if (summaries.length === 0) return 0;
			const client = await pool.connect();
			try {
				await client.query('BEGIN');
				for (const s of summaries) {
					// summary column is NOT NULL — skip if no summary text
					if (s.summary === null) continue;
					const existing = await client.query(
						`SELECT 1 FROM session_summaries WHERE session_id = $1 LIMIT 1`,
						[s.session_id],
					);
					if (existing.rowCount === 0) {
						await client.query(
							`INSERT INTO session_summaries (session_id, summary, created_at)
							 VALUES ($1, $2, $3)`,
							[s.session_id, s.summary, s.created_at],
						);
					}
					// key_topics and emotional_tone live on sessions table
					await client.query(
						`UPDATE sessions SET key_topics = $1, emotional_tone = $2 WHERE session_id = $3`,
						[JSON.stringify(s.key_topics), s.emotional_tone, s.session_id],
					);
				}
				await client.query('COMMIT');
				return summaries.length;
			} catch (err) {
				await client.query('ROLLBACK');
				throw err;
			} finally {
				client.release();
			}
		},

		async insertMessages(messages: readonly AxelMessage[]): Promise<number> {
			if (messages.length === 0) return 0;
			const client = await pool.connect();
			try {
				await client.query('BEGIN');
				for (const m of messages) {
					await client.query(
						`INSERT INTO messages (session_id, turn_id, role, content, channel_id, timestamp, created_at, token_count, emotional_context, metadata)
						 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
						 ON CONFLICT (session_id, turn_id, role) DO NOTHING`,
						[
							m.session_id,
							m.turn_id,
							m.role,
							m.content,
							m.channel_id,
							m.timestamp,
							m.created_at,
							m.token_count,
							m.emotional_context,
							JSON.stringify(m.metadata),
						],
					);
				}
				await client.query('COMMIT');
				return messages.length;
			} catch (err) {
				await client.query('ROLLBACK');
				throw err;
			} finally {
				client.release();
			}
		},

		async insertInteractionLogs(logs: readonly AxelInteractionLog[]): Promise<number> {
			if (logs.length === 0) return 0;
			const client = await pool.connect();
			try {
				await client.query('BEGIN');
				for (const l of logs) {
					await client.query(
						`INSERT INTO interaction_logs (ts, session_id, channel_id, turn_id, effective_model, tier, router_reason, latency_ms, ttft_ms, tokens_in, tokens_out, tool_calls, error)
						 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
						[
							l.ts,
							l.session_id,
							l.channel_id,
							l.turn_id,
							l.effective_model,
							l.tier,
							l.router_reason,
							l.latency_ms,
							l.ttft_ms,
							l.tokens_in,
							l.tokens_out,
							JSON.stringify(l.tool_calls),
							l.error,
						],
					);
				}
				await client.query('COMMIT');
				return logs.length;
			} catch (err) {
				await client.query('ROLLBACK');
				throw err;
			} finally {
				client.release();
			}
		},

		async insertMemories(memories: readonly AxelMemory[]): Promise<number> {
			if (memories.length === 0) return 0;
			const client = await pool.connect();
			try {
				await client.query('BEGIN');
				for (const m of memories) {
					const embeddingStr = `[${Array.from(m.embedding).join(',')}]`;
					await client.query(
						`INSERT INTO memories (content, memory_type, importance, embedding, created_at, last_accessed, access_count, source_channel, channel_mentions, source_session)
						 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
						[
							m.content,
							m.memory_type,
							m.importance,
							embeddingStr,
							m.created_at,
							m.last_accessed,
							m.access_count,
							m.source_channel,
							JSON.stringify(m.channel_mentions),
							m.source_session,
						],
					);
				}
				await client.query('COMMIT');
				return memories.length;
			} catch (err) {
				await client.query('ROLLBACK');
				throw err;
			} finally {
				client.release();
			}
		},

		async insertEntities(entities: readonly AxelEntity[]): Promise<number> {
			if (entities.length === 0) return 0;
			const client = await pool.connect();
			try {
				await client.query('BEGIN');
				for (const e of entities) {
					await client.query(
						`INSERT INTO entities (entity_id, name, entity_type, properties, mentions, created_at, last_accessed)
						 VALUES ($1, $2, $3, $4, $5, $6, $7)
						 ON CONFLICT (entity_id) DO NOTHING`,
						[
							e.entity_id,
							e.name,
							e.entity_type,
							JSON.stringify(e.properties),
							e.mentions,
							e.created_at,
							e.last_accessed,
						],
					);
				}
				await client.query('COMMIT');
				return entities.length;
			} catch (err) {
				await client.query('ROLLBACK');
				throw err;
			} finally {
				client.release();
			}
		},

		async insertRelations(relations: readonly AxelRelation[]): Promise<number> {
			if (relations.length === 0) return 0;
			const client = await pool.connect();
			try {
				await client.query('BEGIN');
				for (const r of relations) {
					await client.query(
						`INSERT INTO relations (source_id, target_id, relation_type, weight, context, created_at)
						 VALUES ($1, $2, $3, $4, $5, $6)
						 ON CONFLICT (source_id, target_id, relation_type) DO NOTHING`,
						[r.source_id, r.target_id, r.relation_type, r.weight, r.context, r.created_at],
					);
				}
				await client.query('COMMIT');
				return relations.length;
			} catch (err) {
				await client.query('ROLLBACK');
				throw err;
			} finally {
				client.release();
			}
		},
	};
}

// ---------------------------------------------------------------------------
// 1f. CLI Command Handler
// ---------------------------------------------------------------------------

function printUsage(): void {
	console.log(`Usage: tsx src/cli.ts <command>

Commands:
  migrate    Run full migration (extract → transform → embed → insert)
  dry-run    Extract + transform only (no DB writes, no embedding)
  validate   Validate source data integrity only`);
}

async function runValidate(config: MigrationConfig): Promise<void> {
	console.log('=== Source Data Validation ===\n');

	const sqliteDb = new Database(config.axnmihnDbPath, { readonly: true });
	const sessions = extractSessions(sqliteDb);
	const messages = extractMessages(sqliteDb);
	sqliteDb.close();

	const chromaDbPath = `${config.axnmihnDataPath}/chroma_db/chroma.sqlite3`;
	const chromaMemories = extractChromaMemories(chromaDbPath);

	const kgPath = `${config.axnmihnDataPath}/knowledge_graph.json`;
	const kg = loadKnowledgeGraph(kgPath);

	// Validate sessions
	const sessionResult = validateSourceSessions(sessions);
	console.log(`Sessions: ${sessions.length} (valid: ${sessionResult.valid})`);
	for (const err of sessionResult.errors) {
		console.log(`  [${err.type}] ${err.message}`);
	}

	// Validate messages
	const sessionIds = new Set(sessions.map((s) => s.session_id));
	const messageResult = validateSourceMessages(messages, sessionIds);
	console.log(`Messages: ${messages.length} (valid: ${messageResult.valid})`);
	for (const err of messageResult.errors) {
		console.log(`  [${err.type}] ${err.message}`);
	}

	// Validate ChromaDB
	const chromaResult = validateChromaMemories(chromaMemories);
	console.log(`ChromaDB Memories: ${chromaMemories.length} (valid: ${chromaResult.valid})`);
	if (chromaResult.emptyContent > 0) console.log(`  Empty content: ${chromaResult.emptyContent}`);
	if (chromaResult.invalidImportance > 0)
		console.log(`  Invalid importance: ${chromaResult.invalidImportance}`);
	if (chromaResult.invalidType > 0) console.log(`  Invalid type: ${chromaResult.invalidType}`);

	// Validate Knowledge Graph
	const kgResult = validateKnowledgeGraph(kg.entities, kg.relations);
	console.log(`KG Entities: ${kg.entities.length} (duplicates: ${kgResult.duplicateEntities})`);
	console.log(`KG Relations: ${kg.relations.length} (orphaned: ${kgResult.orphanedRelations})`);

	const allValid =
		sessionResult.valid && messageResult.valid && chromaResult.valid && kgResult.valid;
	console.log(`\nOverall: ${allValid ? 'VALID' : 'HAS ISSUES'}`);

	if (!allValid) process.exitCode = 1;
}

async function runDryRun(config: MigrationConfig): Promise<void> {
	console.log('=== Dry Run (no DB writes, no embedding) ===\n');

	const sqliteDb = new Database(config.axnmihnDbPath, { readonly: true });
	const chromaDbPath = `${config.axnmihnDataPath}/chroma_db/chroma.sqlite3`;
	const kgPath = `${config.axnmihnDataPath}/knowledge_graph.json`;

	const deps: MigratorDeps = {
		extractSessions: async () => extractSessions(sqliteDb),
		extractMessages: async () => extractMessages(sqliteDb),
		extractInteractionLogs: async () => extractInteractionLogs(sqliteDb),
		extractChromaMemories: async () => extractChromaMemories(chromaDbPath),
		loadKnowledgeGraph: async () => loadKnowledgeGraph(kgPath),
		embedBatch: async () => [],
		insertSessions: async () => 0,
		insertSessionSummaries: async () => 0,
		insertMessages: async () => 0,
		insertInteractionLogs: async () => 0,
		insertMemories: async () => 0,
		insertEntities: async () => 0,
		insertRelations: async () => 0,
		log: (msg) => console.log(msg),
	};

	const migrator = createMigrator(deps);
	const result = await migrator.dryRun();
	sqliteDb.close();

	console.log('\n=== Dry Run Results ===');
	console.log(`  Sessions:         ${result.sessions}`);
	console.log(`  Messages:         ${result.messages}`);
	console.log(`  Interaction Logs: ${result.interactionLogs}`);
	console.log(`  Memories:         ${result.memories}`);
	console.log(`  Entities:         ${result.entities}`);
	console.log(`  Relations:        ${result.relations}`);
}

async function runMigrate(config: MigrationConfig): Promise<void> {
	console.log('=== Full Migration ===\n');

	const sqliteDb = new Database(config.axnmihnDbPath, { readonly: true });
	const pool = new pg.Pool({ connectionString: config.axelDbUrl });
	const chromaDbPath = `${config.axnmihnDataPath}/chroma_db/chroma.sqlite3`;
	const kgPath = `${config.axnmihnDataPath}/knowledge_graph.json`;
	const embedBatch = createEmbedBatch(config.googleApiKey);
	const pgInserters = createPgInserters(pool);

	const deps: MigratorDeps = {
		extractSessions: async () => extractSessions(sqliteDb),
		extractMessages: async () => extractMessages(sqliteDb),
		extractInteractionLogs: async () => extractInteractionLogs(sqliteDb),
		extractChromaMemories: async () => extractChromaMemories(chromaDbPath),
		loadKnowledgeGraph: async () => loadKnowledgeGraph(kgPath),
		embedBatch,
		...pgInserters,
		log: (msg) => console.log(msg),
	};

	try {
		const migrator = createMigrator(deps);
		const result = await migrator.run();

		console.log('\n=== Migration Results ===');
		console.log(`  Success:          ${result.success}`);
		console.log(`  Sessions:         ${result.sessions}`);
		console.log(`  Session Summaries:${result.sessionSummaries}`);
		console.log(`  Messages:         ${result.messages}`);
		console.log(`  Interaction Logs: ${result.interactionLogs}`);
		console.log(`  Memories:         ${result.memories}`);
		console.log(`  Entities:         ${result.entities}`);
		console.log(`  Relations:        ${result.relations}`);
		console.log(`  Orphaned (skipped): ${result.orphanedRelations}`);
	} finally {
		sqliteDb.close();
		await pool.end();
	}
}

async function main(): Promise<void> {
	const command = process.argv[2];

	if (!command || command === '--help' || command === '-h') {
		printUsage();
		return;
	}

	const config = loadConfig();

	switch (command) {
		case 'validate':
			await runValidate(config);
			break;
		case 'dry-run':
			await runDryRun(config);
			break;
		case 'migrate':
			await runMigrate(config);
			break;
		default:
			console.error(`Unknown command: ${command}`);
			printUsage();
			process.exitCode = 1;
	}
}

main().catch((err: unknown) => {
	console.error('Fatal error:', err instanceof Error ? err.message : err);
	process.exitCode = 1;
});
