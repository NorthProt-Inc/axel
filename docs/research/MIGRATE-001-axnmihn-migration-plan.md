# RES-MIGRATE-001: axnmihn → Axel Data Migration Plan

> Date: 2026-02-08
> Author: Research Division
> Related: ADR-002, ADR-013, ADR-016, migration-strategy.md
> Priority: P0 (Human directive)

## Executive Summary

axnmihn (Python/SQLite/ChromaDB) 운영 데이터를 Axel (TypeScript/PostgreSQL/pgvector) 스키마로 마이그레이션하는 전체 계획.

**데이터 규모:**
- SQLite: 3 sessions, 1,736 messages, 1,060 interaction logs
- ChromaDB: 1,039 embeddings (3072d → 1536d 재임베딩 필요)
- Knowledge Graph: 1,396 entities + 1,945 relations
- Persona: v26, 10 learned behaviors
- Voice: 284 chunks (53MB, WAV 형식)
- IoT: hass_devices.yaml 설정 파일

**핵심 과제:**
1. **Embedding 모델 전환**: text-embedding-004 (deprecated) → gemini-embedding-001
2. **차원 축소**: 3072d → 1536d (Matryoshka truncation, ADR-016 amended)
3. **스키마 변환**: SQLite → PostgreSQL (ADR-002 스키마 준수)
4. **데이터 무결성 보장**: FK 관계, 타임스탬프, JSON 필드 검증

---

## 1. Source Data Inventory

### 1.1 SQLite Database (`data/sqlite/sqlite_memory.db`)

| Table | Rows | Schema Notes |
|-------|------|--------------|
| `sessions` | 3 | session_id (TEXT), summary, key_topics, started_at, ended_at, messages_json (TEXT) |
| `messages` | 1,736 | session_id (FK), turn_id, role ('Mark'/'Axel'), content, timestamp, emotional_context |
| `interaction_logs` | 1,060 | ts, conversation_id, turn_id, effective_model, tier, router_reason, latency_ms, ttft_ms, tokens_in/out, tool_calls_json |

**Migration Notes:**
- `sessions.messages_json`: 중복 데이터 (messages 테이블과 별도) — 무시
- `messages.role`: 'Mark'/'Axel' → 'user'/'assistant' 변환 필요
- `interaction_logs.conversation_id`: sessions.session_id와 매핑

### 1.2 ChromaDB (`data/chroma_db/`)

| Collection | Count | Dimension | Model |
|------------|-------|-----------|-------|
| `memories` | 1,039 | 3072 | text-embedding-004 (deprecated) |

**Metadata Schema (추정):**
- `content`: 기억 텍스트
- `memory_type`: fact/preference/insight/conversation
- `importance`: 0.0–1.0
- `created_at`, `last_accessed`, `access_count`: 타임스탬프 및 카운트
- `source_channel`: 출처 채널 (CLI 추정)

**재임베딩 필요 이유 (ADR-016):**
1. text-embedding-004 deprecated (2026-01-14)
2. gemini-embedding-001과 embedding space 비호환 (직접 복사 불가)
3. 3072d → 1536d Matryoshka truncation (pgvector 2000d 제한, ERR-069)

### 1.3 Knowledge Graph (`data/knowledge_graph.json`)

| Component | Count | Schema |
|-----------|-------|--------|
| `entities` | 1,396 | entity_id, name, entity_type, properties (JSON), mentions, created_at, last_accessed |
| `relations` | 1,945 | source_id, target_id, relation_type, weight, context, created_at |

**Validation:**
- 모든 relation의 source_id/target_id가 entities에 존재해야 함
- entity_id 중복 없어야 함

### 1.4 Dynamic Persona (`data/dynamic_persona.json`)

| Field | Value |
|-------|-------|
| `version` | 26 |
| `learned_behaviors` | 10 items |

**Migration Strategy:**
- PostgreSQL 저장 **불필요** (Axel은 JSONL 파일 기반 persona 사용)
- `~/projects/axel/data/persona/dynamic_persona.json`에 직접 복사
- 스키마 호환성 검증 필요 (Axel persona schema와 비교)

### 1.5 Voice Chunks (`data/voice/chunks/`)

| Attribute | Value |
|-----------|-------|
| File count | 284 |
| Total size | 53MB |
| Format | WAV |

**Migration Strategy:**
- PostgreSQL 저장 **불필요** (파일 시스템 기반)
- `~/projects/axel/data/voice/chunks/`에 직접 복사
- 파일명 충돌 확인 필요

### 1.6 IoT Configuration (`data/hass_devices.yaml`)

**Migration Strategy:**
- PostgreSQL 저장 **불필요**
- `~/projects/axel/data/iot/hass_devices.yaml`에 직접 복사
- Axel의 IoT 설정 스키마와 호환성 검증

---

## 2. Target Schema Mapping

### 2.1 Sessions Migration

**Source:** `axnmihn.sessions` (SQLite)
**Target:** `axel.sessions` (PostgreSQL)

| axnmihn Column | Axel Column | Transform |
|----------------|-------------|-----------|
| `session_id` | `session_id` | Direct copy |
| `summary` | Move to `session_summaries.summary` | Extract to separate table (migration 008) |
| `key_topics` | Move to `session_summaries.key_topics` | Parse TEXT → JSONB array |
| `emotional_tone` | Move to `session_summaries.emotional_tone` | Direct copy |
| `turn_count` | `turn_count` | Direct copy |
| `started_at` | `started_at` | Direct copy (TIMESTAMP → TIMESTAMPTZ) |
| `ended_at` | `ended_at` | Direct copy (TIMESTAMPTZ) |
| `created_at` | `created_at` | Direct copy (TIMESTAMPTZ) |
| — | `user_id` | **New field**: Default to 'mark' (single-user) |
| — | `channel_id` | **New field**: Default to 'cli' |
| — | `channel_history` | **New field**: Default to `'{cli}'::text[]` |
| — | `last_activity_at` | **New field**: Derive from messages.timestamp MAX or ended_at |

**Data Generation:**
```sql
INSERT INTO sessions (
    session_id, user_id, channel_id, channel_history,
    turn_count, started_at, ended_at, last_activity_at, created_at
)
SELECT
    session_id,
    'mark' AS user_id,
    'cli' AS channel_id,
    '{cli}'::text[] AS channel_history,
    turn_count,
    started_at,
    ended_at,
    COALESCE(ended_at, started_at) AS last_activity_at,
    created_at
FROM axnmihn_sessions;

-- session_summaries 별도 삽입
INSERT INTO session_summaries (session_id, summary, key_topics, emotional_tone, created_at)
SELECT
    session_id,
    summary,
    -- key_topics가 TEXT 형식이면 JSON 변환 필요
    CASE
        WHEN key_topics IS NULL THEN '[]'::jsonb
        WHEN key_topics LIKE '[%' THEN key_topics::jsonb  -- JSON 배열
        ELSE jsonb_build_array(key_topics)  -- 단일 문자열을 배열로 래핑
    END AS key_topics,
    emotional_tone,
    created_at
FROM axnmihn_sessions
WHERE summary IS NOT NULL OR key_topics IS NOT NULL OR emotional_tone IS NOT NULL;
```

### 2.2 Messages Migration

**Source:** `axnmihn.messages` (SQLite)
**Target:** `axel.messages` (PostgreSQL)

| axnmihn Column | Axel Column | Transform |
|----------------|-------------|-----------|
| `session_id` | `session_id` | Direct copy (FK to sessions) |
| `turn_id` | `turn_id` | Direct copy |
| `role` | `role` | **Transform:** 'Mark' → 'user', 'Axel' → 'assistant' |
| `content` | `content` | Direct copy |
| `timestamp` | `timestamp` | Direct copy (TIMESTAMP → TIMESTAMPTZ) |
| `emotional_context` | `emotional_context` | Direct copy (default 'neutral' if NULL) |
| — | `channel_id` | **New field**: Default to 'cli' |
| — | `created_at` | **New field**: Copy from timestamp |
| — | `token_count` | **New field**: Estimate using `length(content) / 3` (rough approximation) |
| — | `metadata` | **New field**: Default to `'{}'::jsonb` |

**Data Generation:**
```sql
INSERT INTO messages (
    session_id, turn_id, role, content, channel_id,
    timestamp, created_at, token_count, emotional_context, metadata
)
SELECT
    session_id,
    turn_id,
    CASE role
        WHEN 'Mark' THEN 'user'
        WHEN 'Axel' THEN 'assistant'
        ELSE 'system'  -- fallback
    END AS role,
    content,
    'cli' AS channel_id,
    timestamp,
    timestamp AS created_at,
    GREATEST(1, LENGTH(content) / 3) AS token_count,  -- rough estimate
    COALESCE(emotional_context, 'neutral') AS emotional_context,
    '{}'::jsonb AS metadata
FROM axnmihn_messages
WHERE session_id IN (SELECT session_id FROM sessions);
```

### 2.3 Interaction Logs Migration

**Source:** `axnmihn.interaction_logs` (SQLite)
**Target:** `axel.interaction_logs` (PostgreSQL)

| axnmihn Column | Axel Column | Transform |
|----------------|-------------|-----------|
| `ts` | `ts` | Direct copy (TIMESTAMP → TIMESTAMPTZ) |
| `conversation_id` | `session_id` | Rename |
| `turn_id` | `turn_id` | Direct copy |
| `effective_model` | `effective_model` | Direct copy |
| `tier` | `tier` | Direct copy |
| `router_reason` | `router_reason` | Direct copy |
| `latency_ms` | `latency_ms` | Direct copy |
| `ttft_ms` | `ttft_ms` | Direct copy |
| `tokens_in` | `tokens_in` | Direct copy |
| `tokens_out` | `tokens_out` | Direct copy |
| `tool_calls_json` | `tool_calls` | Parse TEXT → JSONB (default '[]' if NULL) |
| — | `channel_id` | **New field**: Default to 'cli' |
| — | `error` | **New field**: NULL (axnmihn didn't log errors in this table) |

**Data Generation:**
```sql
INSERT INTO interaction_logs (
    ts, session_id, channel_id, turn_id,
    effective_model, tier, router_reason,
    latency_ms, ttft_ms, tokens_in, tokens_out,
    tool_calls, error
)
SELECT
    ts,
    conversation_id AS session_id,
    'cli' AS channel_id,
    turn_id,
    effective_model,
    tier,
    router_reason,
    latency_ms,
    ttft_ms,
    tokens_in,
    tokens_out,
    CASE
        WHEN tool_calls_json IS NULL THEN '[]'::jsonb
        WHEN tool_calls_json = '' THEN '[]'::jsonb
        ELSE tool_calls_json::jsonb
    END AS tool_calls,
    NULL AS error
FROM axnmihn_interaction_logs;
```

### 2.4 Memories Migration (ChromaDB → PostgreSQL)

**Source:** ChromaDB `memories` collection (1,039 embeddings, 3072d)
**Target:** PostgreSQL `memories` table (1536d pgvector)

**Process:**
1. **Extract from ChromaDB** (Python script):
   ```python
   import chromadb
   client = chromadb.PersistentClient('/home/northprot/projects/axnmihn/data/chroma_db')
   coll = client.get_collection('memories')
   result = coll.get(include=['documents', 'metadatas', 'embeddings'])
   # result['embeddings'] = 1,039 vectors (3072d)
   # result['documents'] = content texts
   # result['metadatas'] = {memory_type, importance, created_at, ...}
   ```

2. **Re-embed with gemini-embedding-001** (1536d Matryoshka):
   ```typescript
   // tools/migrate-axnmihn/src/re-embed.ts
   import { GoogleGenerativeAI } from "@google/generative-ai";

   const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
   const model = genAI.getGenerativeModel({ model: "gemini-embedding-001" });

   async function reEmbedBatch(texts: string[]): Promise<number[][]> {
       const result = await model.batchEmbedContents({
           requests: texts.map(text => ({
               content: { parts: [{ text }] },
               taskType: "RETRIEVAL_DOCUMENT",
               outputDimensionality: 1536,  // Matryoshka truncation
           })),
       });
       return result.embeddings.map(e => e.values);
   }
   ```

3. **Batch Processing**:
   - Batch size: 100 texts/request (gemini-embedding-001 supports up to 250)
   - Total batches: 1,039 / 100 = 11 batches
   - Rate limit: 1,500 RPM (Gemini paid tier)
   - Estimated time: < 30 seconds
   - Estimated cost: ~1,039 texts × $0.15 / 1M tokens ≈ **< $0.01**

4. **Insert into PostgreSQL**:
   ```sql
   INSERT INTO memories (
       content, memory_type, importance, embedding,
       created_at, last_accessed, access_count,
       source_channel, channel_mentions, source_session,
       decayed_importance, last_decayed_at
   )
   VALUES (
       $1,  -- content
       $2,  -- memory_type
       $3,  -- importance
       $4::vector(1536),  -- new 1536d embedding
       $5,  -- created_at
       $6,  -- last_accessed
       $7,  -- access_count
       'cli',  -- source_channel (default)
       '{}'::jsonb,  -- channel_mentions (empty for now)
       NULL,  -- source_session (axnmihn didn't track this)
       NULL,  -- decayed_importance (will be computed by Axel)
       NULL   -- last_decayed_at
   );
   ```

**HNSW Index Strategy:**
- Drop `idx_memories_embedding` index before bulk insert (faster)
- Bulk insert all 1,039 memories
- Recreate index after insertion:
  ```sql
  CREATE INDEX idx_memories_embedding ON memories
      USING hnsw (embedding vector_cosine_ops)
      WITH (m = 16, ef_construction = 64);
  ```

### 2.5 Knowledge Graph Migration

**Source:** `knowledge_graph.json` (1,396 entities + 1,945 relations)
**Target:** PostgreSQL `entities` + `relations` tables

**Entities Migration:**
```typescript
// tools/migrate-axnmihn/src/migrate-kg.ts
interface SourceEntity {
    entity_id: string;
    name: string;
    entity_type: string;
    properties: Record<string, unknown>;
    mentions: number;
    created_at: string;
    last_accessed: string;
}

async function migrateEntities(entities: SourceEntity[]) {
    const sql = `
        INSERT INTO entities (
            entity_id, name, entity_type, properties,
            mentions, created_at, last_accessed
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (entity_id) DO NOTHING;
    `;

    for (const e of entities) {
        await client.query(sql, [
            e.entity_id,
            e.name,
            e.entity_type,
            JSON.stringify(e.properties),
            e.mentions,
            new Date(e.created_at),
            new Date(e.last_accessed),
        ]);
    }
}
```

**Relations Migration:**
```typescript
interface SourceRelation {
    source_id: string;
    target_id: string;
    relation_type: string;
    weight: number;
    context?: string;
    created_at: string;
}

async function migrateRelations(relations: SourceRelation[]) {
    const sql = `
        INSERT INTO relations (
            source_id, target_id, relation_type,
            weight, context, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (source_id, target_id, relation_type) DO UPDATE
        SET weight = EXCLUDED.weight,
            context = COALESCE(EXCLUDED.context, relations.context);
    `;

    for (const r of relations) {
        await client.query(sql, [
            r.source_id,
            r.target_id,
            r.relation_type,
            r.weight,
            r.context || null,
            new Date(r.created_at),
        ]);
    }
}
```

**Validation:**
- All `relations.source_id` and `target_id` must exist in `entities.entity_id`
- Pre-filter orphaned relations before insertion
- Log warnings for missing entities

---

## 3. Migration Script Architecture

### 3.1 Directory Structure

```
tools/migrate-axnmihn/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts           # Main orchestrator
│   ├── config.ts          # Config loader (env vars)
│   ├── extract-sqlite.ts  # SQLite → JSON extractor
│   ├── extract-chroma.ts  # ChromaDB → JSON extractor (Python script)
│   ├── re-embed.ts        # gemini-embedding-001 re-embedding
│   ├── migrate-sessions.ts
│   ├── migrate-messages.ts
│   ├── migrate-logs.ts
│   ├── migrate-memories.ts
│   ├── migrate-kg.ts
│   ├── validate.ts        # Post-migration validation
│   └── utils.ts           # DB connection, logging
├── scripts/
│   └── extract_chroma.py  # Python script for ChromaDB extraction
└── README.md
```

### 3.2 Execution Flow

```typescript
// tools/migrate-axnmihn/src/index.ts

async function main() {
    const config = loadConfig();  // .env: AXNMIHN_DATA_PATH, AXEL_DB_URL, GOOGLE_API_KEY

    console.log('=== axnmihn → Axel Migration ===');

    // Phase 1: Extract
    console.log('\n[1/6] Extracting SQLite data...');
    const sqliteData = await extractSQLite(config.axnmihnDbPath);

    console.log('[2/6] Extracting ChromaDB embeddings...');
    const chromaData = await extractChromaDB(config.axnmihnDataPath);

    console.log('[3/6] Loading Knowledge Graph...');
    const kgData = await loadKnowledgeGraph(config.axnmihnDataPath);

    // Phase 2: Transform & Load
    console.log('\n[4/6] Migrating sessions, messages, interaction_logs...');
    await migrateSessions(sqliteData.sessions, config.axelDb);
    await migrateMessages(sqliteData.messages, config.axelDb);
    await migrateLogs(sqliteData.logs, config.axelDb);

    console.log('[5/6] Re-embedding memories (1,039 × 1536d)...');
    const reEmbedded = await reEmbedMemories(chromaData, config.googleApiKey);
    await migrateMemories(reEmbedded, config.axelDb);

    console.log('[6/6] Migrating Knowledge Graph (1,396 entities + 1,945 relations)...');
    await migrateKnowledgeGraph(kgData, config.axelDb);

    // Phase 3: Validate
    console.log('\n=== Validation ===');
    const validation = await runValidation(config.axelDb);

    if (validation.allPassed) {
        console.log('✅ Migration completed successfully!');
        console.log(validation.summary);
    } else {
        console.error('❌ Migration validation failed:');
        console.error(validation.errors);
        process.exit(1);
    }
}
```

### 3.3 Rollback Strategy

**Pre-Migration Backup:**
```bash
# 1. PostgreSQL dump (before migration)
pg_dump -h localhost -U axel -d axel_dev \
    --schema-only \
    -f /tmp/axel_schema_backup.sql

# 2. ChromaDB backup
cp -r /home/northprot/projects/axnmihn/data/chroma_db \
      /tmp/chroma_db_backup

# 3. SQLite backup
cp /home/northprot/projects/axnmihn/data/sqlite/sqlite_memory.db \
   /tmp/sqlite_memory_backup.db
```

**Rollback Process:**
```sql
-- If migration fails mid-way, truncate target tables
TRUNCATE TABLE memories CASCADE;
TRUNCATE TABLE relations CASCADE;
TRUNCATE TABLE entities CASCADE;
TRUNCATE TABLE interaction_logs CASCADE;
TRUNCATE TABLE messages CASCADE;
TRUNCATE TABLE session_summaries CASCADE;
TRUNCATE TABLE sessions CASCADE;

-- Reset sequences
ALTER SEQUENCE sessions_id_seq RESTART WITH 1;
ALTER SEQUENCE messages_id_seq RESTART WITH 1;
-- ... (other sequences)
```

**Data Integrity Check:**
```typescript
async function validateMigration(db: Pool): Promise<ValidationResult> {
    const checks = [
        // 1. Row counts match
        { name: 'sessions_count', expected: 3, query: 'SELECT COUNT(*) FROM sessions' },
        { name: 'messages_count', expected: 1736, query: 'SELECT COUNT(*) FROM messages' },
        { name: 'logs_count', expected: 1060, query: 'SELECT COUNT(*) FROM interaction_logs' },
        { name: 'memories_count', expected: 1039, query: 'SELECT COUNT(*) FROM memories' },
        { name: 'entities_count', expected: 1396, query: 'SELECT COUNT(*) FROM entities' },
        { name: 'relations_count', expected: 1945, query: 'SELECT COUNT(*) FROM relations' },

        // 2. Referential integrity
        { name: 'orphaned_messages', expected: 0,
          query: 'SELECT COUNT(*) FROM messages m LEFT JOIN sessions s ON m.session_id = s.session_id WHERE s.session_id IS NULL' },
        { name: 'orphaned_relations', expected: 0,
          query: 'SELECT COUNT(*) FROM relations r LEFT JOIN entities e1 ON r.source_id = e1.entity_id WHERE e1.entity_id IS NULL' },

        // 3. Embedding dimensions
        { name: 'embedding_dimension', expected: 1536,
          query: 'SELECT vector_dims(embedding) FROM memories LIMIT 1' },

        // 4. Vector search functional
        { name: 'vector_search_test', expected: 5,
          query: `SELECT COUNT(*) FROM (
              SELECT 1 FROM memories ORDER BY embedding <=> (SELECT embedding FROM memories LIMIT 1) LIMIT 5
          ) t` },
    ];

    const results = [];
    for (const check of checks) {
        const { rows } = await db.query(check.query);
        const actual = Number(rows[0][Object.keys(rows[0])[0]]);
        results.push({
            name: check.name,
            expected: check.expected,
            actual,
            passed: actual === check.expected,
        });
    }

    return {
        allPassed: results.every(r => r.passed),
        results,
    };
}
```

---

## 4. Re-embedding Strategy (3072d → 1536d)

### 4.1 Why Re-embed?

| Aspect | Reason |
|--------|--------|
| **Model change** | text-embedding-004 (deprecated) → gemini-embedding-001 (active) |
| **Embedding space** | Different models = incompatible vector spaces (cosine similarity meaningless) |
| **Dimension change** | 3072d → 1536d (pgvector 2000d limit, ADR-016 ERR-069) |
| **Matryoshka truncation** | gemini-embedding-001 trained with Matryoshka → 1536d maintains >95% recall (RES-006) |

### 4.2 Re-embedding Process

**Step 1: Extract content from ChromaDB**
```python
# scripts/extract_chroma.py
import chromadb
import json

client = chromadb.PersistentClient('/home/northprot/projects/axnmihn/data/chroma_db')
coll = client.get_collection('memories')

result = coll.get(include=['documents', 'metadatas', 'embeddings'])

output = {
    'count': len(result['ids']),
    'memories': [
        {
            'id': result['ids'][i],
            'content': result['documents'][i],
            'metadata': result['metadatas'][i],
            'old_embedding': result['embeddings'][i][:10],  # first 10d for verification
        }
        for i in range(len(result['ids']))
    ]
}

with open('extracted_memories.json', 'w') as f:
    json.dump(output, f, indent=2)
```

**Step 2: Batch re-embed with gemini-embedding-001**
```typescript
// src/re-embed.ts
import { GoogleGenerativeAI } from "@google/generative-ai";
import * as fs from "fs";

interface ExtractedMemory {
    id: string;
    content: string;
    metadata: Record<string, unknown>;
}

async function reEmbedAll(memories: ExtractedMemory[]): Promise<ReEmbeddedMemory[]> {
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
    const model = genAI.getGenerativeModel({ model: "gemini-embedding-001" });

    const BATCH_SIZE = 100;
    const reEmbedded: ReEmbeddedMemory[] = [];

    for (let i = 0; i < memories.length; i += BATCH_SIZE) {
        const batch = memories.slice(i, i + BATCH_SIZE);
        console.log(`Re-embedding batch ${i / BATCH_SIZE + 1} / ${Math.ceil(memories.length / BATCH_SIZE)}...`);

        const result = await model.batchEmbedContents({
            requests: batch.map(m => ({
                content: { parts: [{ text: m.content }] },
                taskType: "RETRIEVAL_DOCUMENT",
                outputDimensionality: 1536,  // Matryoshka truncation
            })),
        });

        for (let j = 0; j < batch.length; j++) {
            reEmbedded.push({
                ...batch[j],
                embedding: result.embeddings[j].values,  // 1536d array
            });
        }

        // Rate limiting: 1,500 RPM → ~100 batches/min → delay 600ms between batches
        await new Promise(resolve => setTimeout(resolve, 600));
    }

    return reEmbedded;
}
```

**Step 3: Quality verification**
```typescript
// Compare recall on test queries
async function verifyEmbeddingQuality(
    oldEmbeddings: number[][],  // 3072d from ChromaDB
    newEmbeddings: number[][],  // 1536d from gemini-embedding-001
    contents: string[]
): Promise<QualityMetrics> {
    // Pick 10 random queries
    const testQueries = [
        "Mark's preferred working hours",
        "IoT devices in the home",
        "Recent conversation topics",
        // ... 7 more
    ];

    for (const query of testQueries) {
        const queryEmbedding = await embedQuery(query);  // 1536d

        // Top-5 results with new embeddings (PostgreSQL)
        const newTop5 = await findTopK(queryEmbedding, newEmbeddings, 5);

        // Top-5 results with old embeddings (simulated with truncated vectors)
        // NOTE: Can't directly compare due to model change, but can verify no catastrophic failures

        console.log(`Query: "${query}"`);
        console.log(`Top result: "${contents[newTop5[0].index]}"`);
    }

    return { /* metrics */ };
}
```

### 4.3 Cost & Time Estimates

| Metric | Value |
|--------|-------|
| Total memories | 1,039 |
| Batch size | 100 texts/request |
| Total API calls | 11 batches |
| Rate limit | 1,500 RPM (Gemini paid tier) |
| Time per batch | ~400ms (API latency) + 600ms (rate limit safety) = 1s |
| **Total time** | **~11 seconds** |
| Token count estimate | ~1,039 × 50 tokens avg = 51,950 tokens |
| Pricing | $0.15 / 1M tokens |
| **Total cost** | **$0.0078 ≈ < $0.01** |

---

## 5. Data Validation Plan

### 5.1 Pre-Migration Validation

**Check 1: Source data integrity**
```bash
# SQLite referential integrity
sqlite3 data/sqlite/sqlite_memory.db <<SQL
SELECT COUNT(*) AS orphaned_messages
FROM messages m
LEFT JOIN sessions s ON m.session_id = s.session_id
WHERE s.session_id IS NULL;
SQL
# Expected: 0

# Knowledge graph consistency
jq -r '
    .relations[] |
    select(
        (.source_id as $sid | [.entities[].entity_id] | index($sid) | not) or
        (.target_id as $tid | [.entities[].entity_id] | index($tid) | not)
    )
' data/knowledge_graph.json | wc -l
# Expected: 0 (no orphaned relations)
```

**Check 2: ChromaDB accessibility**
```python
import chromadb
client = chromadb.PersistentClient('/home/northprot/projects/axnmihn/data/chroma_db')
coll = client.get_collection('memories')
assert coll.count() == 1039, "ChromaDB count mismatch"
```

### 5.2 Post-Migration Validation

**SQL Validation Queries:**
```sql
-- V1: Row counts match
SELECT 'sessions' AS table_name, COUNT(*) AS count FROM sessions
UNION ALL SELECT 'messages', COUNT(*) FROM messages
UNION ALL SELECT 'interaction_logs', COUNT(*) FROM interaction_logs
UNION ALL SELECT 'memories', COUNT(*) FROM memories
UNION ALL SELECT 'entities', COUNT(*) FROM entities
UNION ALL SELECT 'relations', COUNT(*) FROM relations;

-- Expected:
-- sessions: 3
-- messages: 1,736
-- interaction_logs: 1,060
-- memories: 1,039
-- entities: 1,396
-- relations: 1,945

-- V2: No orphaned messages
SELECT COUNT(*) AS orphaned_messages
FROM messages m
LEFT JOIN sessions s ON m.session_id = s.session_id
WHERE s.session_id IS NULL;
-- Expected: 0

-- V3: No orphaned relations
SELECT COUNT(*) AS orphaned_relations
FROM relations r
LEFT JOIN entities e1 ON r.source_id = e1.entity_id
LEFT JOIN entities e2 ON r.target_id = e2.entity_id
WHERE e1.entity_id IS NULL OR e2.entity_id IS NULL;
-- Expected: 0

-- V4: Embedding dimension correct
SELECT DISTINCT vector_dims(embedding) AS dimension FROM memories;
-- Expected: 1536

-- V5: HNSW index exists and functional
SELECT indexname, indexdef FROM pg_indexes
WHERE tablename = 'memories' AND indexname = 'idx_memories_embedding';
-- Expected: 1 row with USING hnsw

-- V6: Vector search returns results
SELECT content, 1 - (embedding <=> (SELECT embedding FROM memories LIMIT 1)) AS score
FROM memories
ORDER BY embedding <=> (SELECT embedding FROM memories LIMIT 1)
LIMIT 5;
-- Expected: 5 rows with scores > 0.7 (high similarity for self-search)

-- V7: All timestamps are valid
SELECT COUNT(*) AS invalid_timestamps FROM (
    SELECT * FROM sessions WHERE started_at > NOW() OR ended_at > NOW()
    UNION ALL
    SELECT * FROM messages WHERE timestamp > NOW()
    UNION ALL
    SELECT * FROM interaction_logs WHERE ts > NOW()
    UNION ALL
    SELECT * FROM memories WHERE created_at > NOW() OR last_accessed > NOW()
) AS t;
-- Expected: 0

-- V8: All roles are valid
SELECT DISTINCT role FROM messages;
-- Expected: 'user', 'assistant', ('system', 'tool' may appear)

-- V9: All session_id in messages exist in sessions
SELECT DISTINCT m.session_id
FROM messages m
LEFT JOIN sessions s ON m.session_id = s.session_id
WHERE s.session_id IS NULL;
-- Expected: 0 rows

-- V10: session_summaries match sessions
SELECT COUNT(*) AS summaries_without_sessions
FROM session_summaries ss
LEFT JOIN sessions s ON ss.session_id = s.session_id
WHERE s.session_id IS NULL;
-- Expected: 0
```

### 5.3 Quality Assurance Tests

**Test 1: Semantic search quality**
```sql
-- Query: "Mark's name"
-- Should return memories mentioning Mark
SELECT content, importance
FROM memories
WHERE memory_type = 'fact'
ORDER BY embedding <=> '[... embedding for "Mark's name" ...]'::vector(1536)
LIMIT 5;
-- Manual verification: top results should be about Mark
```

**Test 2: Knowledge graph traversal**
```sql
-- Traverse from 'mark' entity
WITH RECURSIVE traversal AS (
    SELECT target_id, relation_type, weight, 1 AS depth
    FROM relations WHERE source_id = 'mark'
    UNION ALL
    SELECT r.target_id, r.relation_type, r.weight, t.depth + 1
    FROM relations r
    JOIN traversal t ON r.source_id = t.target_id
    WHERE t.depth < 3
)
SELECT COUNT(DISTINCT target_id) AS reachable_entities FROM traversal;
-- Expected: > 10 (Mark should have connections)
```

**Test 3: Session timeline integrity**
```sql
-- Check chronological order
SELECT session_id, started_at, ended_at
FROM sessions
WHERE ended_at IS NOT NULL AND started_at > ended_at;
-- Expected: 0 rows (no inverted timestamps)
```

---

## 6. Migration Execution Plan

### 6.1 Prerequisites

**Environment Setup:**
```bash
# 1. Install dependencies
cd tools/migrate-axnmihn
pnpm install

# 2. Configure environment
cat > .env <<EOF
# Source paths
AXNMIHN_DATA_PATH=/home/northprot/projects/axnmihn/data
AXNMIHN_DB_PATH=/home/northprot/projects/axnmihn/data/sqlite/sqlite_memory.db

# Target database
AXEL_DB_URL=postgresql://axel:axel_dev_password@localhost:5432/axel_dev

# Google API (for re-embedding)
GOOGLE_API_KEY=<your-key>
EOF

# 3. Ensure PostgreSQL is running with migrations applied
cd /home/northprot/projects/axel
docker compose -f docker/docker-compose.dev.yml up -d postgres
DATABASE_URL=postgresql://axel:axel_dev_password@localhost:5432/axel_dev pnpm --filter @axel/migrate run migrate:up

# 4. Verify schema
psql postgresql://axel:axel_dev_password@localhost:5432/axel_dev -c "\dt"
# Expected: sessions, messages, memories, entities, relations, interaction_logs, session_summaries, etc.
```

### 6.2 Execution Steps

**Step 1: Dry-run validation**
```bash
cd tools/migrate-axnmihn
pnpm run migrate --dry-run
# Validates source data, checks target DB connectivity, estimates time/cost
```

**Step 2: Backup**
```bash
# Backup PostgreSQL schema
pg_dump -h localhost -U axel -d axel_dev \
    --schema-only \
    -f /tmp/axel_schema_backup_$(date +%Y%m%d_%H%M%S).sql

# Backup source data (already exists, but verify)
ls -lh /home/northprot/projects/axnmihn/data/
```

**Step 3: Execute migration**
```bash
pnpm run migrate

# Expected output:
# === axnmihn → Axel Migration ===
# [1/6] Extracting SQLite data... ✓ (3 sessions, 1,736 messages, 1,060 logs)
# [2/6] Extracting ChromaDB embeddings... ✓ (1,039 memories)
# [3/6] Loading Knowledge Graph... ✓ (1,396 entities, 1,945 relations)
# [4/6] Migrating sessions, messages, interaction_logs... ✓
# [5/6] Re-embedding memories (1,039 × 1536d)... ✓ (11 batches, 12s, $0.01)
# [6/6] Migrating Knowledge Graph... ✓
# === Validation ===
# ✅ All checks passed (10/10)
# Migration completed successfully!
```

**Step 4: Post-migration verification**
```bash
# Run validation queries
psql postgresql://axel:axel_dev_password@localhost:5432/axel_dev -f tools/migrate-axnmihn/validation.sql

# Expected: All checks return 0 errors
```

**Step 5: Manual spot-check**
```sql
-- Check a known memory
SELECT content, memory_type, importance
FROM memories
WHERE content ILIKE '%Mark%'
ORDER BY importance DESC
LIMIT 5;

-- Check session timelines
SELECT session_id, started_at, ended_at, turn_count
FROM sessions
ORDER BY started_at DESC;

-- Check knowledge graph for Mark
SELECT e.name, e.entity_type, COUNT(r.target_id) AS connection_count
FROM entities e
LEFT JOIN relations r ON e.entity_id = r.source_id
WHERE e.entity_id = 'mark'
GROUP BY e.entity_id, e.name, e.entity_type;
```

### 6.3 Rollback Procedure (If Migration Fails)

```bash
# 1. Truncate all target tables
psql postgresql://axel:axel_dev_password@localhost:5432/axel_dev <<SQL
TRUNCATE TABLE memories CASCADE;
TRUNCATE TABLE relations CASCADE;
TRUNCATE TABLE entities CASCADE;
TRUNCATE TABLE interaction_logs CASCADE;
TRUNCATE TABLE messages CASCADE;
TRUNCATE TABLE session_summaries CASCADE;
TRUNCATE TABLE sessions CASCADE;

-- Reset sequences
ALTER SEQUENCE sessions_id_seq RESTART WITH 1;
ALTER SEQUENCE messages_id_seq RESTART WITH 1;
ALTER SEQUENCE interaction_logs_id_seq RESTART WITH 1;
ALTER SEQUENCE memories_id_seq RESTART WITH 1;
ALTER SEQUENCE entities_id_seq RESTART WITH 1;
ALTER SEQUENCE relations_id_seq RESTART WITH 1;
ALTER SEQUENCE session_summaries_id_seq RESTART WITH 1;
SQL

# 2. Investigate error logs
cat tools/migrate-axnmihn/logs/migration_$(date +%Y%m%d).log

# 3. Fix issue and retry
pnpm run migrate
```

---

## 7. Non-Database Data Migration

### 7.1 Dynamic Persona

**Source:** `/home/northprot/projects/axnmihn/data/dynamic_persona.json` (v26, 10 learned behaviors)
**Target:** `/home/northprot/projects/axel/data/persona/dynamic_persona.json`

**Process:**
```bash
# 1. Copy file
cp /home/northprot/projects/axnmihn/data/dynamic_persona.json \
   /home/northprot/projects/axel/data/persona/

# 2. Validate schema compatibility
node tools/migrate-axnmihn/validate-persona.js

# Expected: Schema validation pass or report differences
```

**Schema Compatibility Check:**
```typescript
// tools/migrate-axnmihn/validate-persona.ts
import * as fs from "fs";

interface AxnmihnPersona {
    version: number;
    learned_behaviors: Array<{ /* ... */ }>;
    // ... other fields
}

const axnmihnPersona = JSON.parse(
    fs.readFileSync('/home/northprot/projects/axnmihn/data/dynamic_persona.json', 'utf8')
);

const axelPersonaSchema = {
    version: 'number',
    learned_behaviors: 'array',
    // ... Axel expected schema
};

// Compare and report differences
```

### 7.2 Voice Chunks

**Source:** `/home/northprot/projects/axnmihn/data/voice/chunks/` (284 files, 53MB)
**Target:** `/home/northprot/projects/axel/data/voice/chunks/`

**Process:**
```bash
# 1. Create target directory
mkdir -p /home/northprot/projects/axel/data/voice/chunks

# 2. Copy files
cp -r /home/northprot/projects/axnmihn/data/voice/chunks/* \
      /home/northprot/projects/axel/data/voice/chunks/

# 3. Verify file count
ls /home/northprot/projects/axel/data/voice/chunks/ | wc -l
# Expected: 284

# 4. Verify total size
du -sh /home/northprot/projects/axel/data/voice/chunks/
# Expected: ~53M
```

### 7.3 IoT Configuration

**Source:** `/home/northprot/projects/axnmihn/data/hass_devices.yaml`
**Target:** `/home/northprot/projects/axel/data/iot/hass_devices.yaml`

**Process:**
```bash
# 1. Create target directory
mkdir -p /home/northprot/projects/axel/data/iot

# 2. Copy file
cp /home/northprot/projects/axnmihn/data/hass_devices.yaml \
   /home/northprot/projects/axel/data/iot/

# 3. Validate YAML syntax
python3 -c "import yaml; yaml.safe_load(open('/home/northprot/projects/axel/data/iot/hass_devices.yaml'))"
# Expected: No errors
```

---

## 8. Risk Assessment & Mitigation

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| **Re-embedding quality degradation** | Low | High | RES-006 证明 >95% recall parity. 수동 spot-check with test queries. |
| **Data loss during migration** | Low | Critical | Pre-migration backup (PostgreSQL dump + source data preservation). Dry-run validation. |
| **FK constraint violations** | Medium | Medium | Pre-filter orphaned records. Validation queries before committing. |
| **API rate limiting (Gemini)** | Low | Low | Batch size 100, 600ms delay between batches (well below 1,500 RPM limit). |
| **Out-of-memory (1,039 embeddings)** | Very Low | Medium | Stream processing, batch by batch. Memory usage: ~1,039 × 1,536 × 4 bytes = 6.3MB (negligible). |
| **Schema drift (Axel migrations change)** | Low | Medium | Lock migration version (001-008) before data migration. Document target schema version. |
| **Timestamp timezone issues** | Medium | Low | Convert all SQLite TIMESTAMP to PostgreSQL TIMESTAMPTZ with explicit timezone (UTC). |
| **JSON parsing errors** | Low | Low | Try-catch with fallback to empty JSON. Log warnings for manual review. |

---

## 9. Timeline & Resource Estimates

| Phase | Task | Estimated Time | Resource |
|-------|------|----------------|----------|
| **Preparation** | Write migration scripts | 4 hours | Dev-Infra / Research |
| | Write validation tests | 2 hours | Quality |
| | Review plan | 1 hour | Architect / CTO |
| **Execution** | Extract SQLite data | < 1 min | Automated |
| | Extract ChromaDB data | < 1 min | Automated (Python) |
| | Re-embed 1,039 memories | ~12 seconds | Gemini API |
| | Migrate sessions/messages/logs | < 1 min | PostgreSQL INSERT |
| | Migrate memories | < 1 min | PostgreSQL COPY + HNSW index rebuild |
| | Migrate knowledge graph | ~2 min | PostgreSQL INSERT (1,396 entities + 1,945 relations) |
| | Copy persona/voice/IoT files | < 1 min | File system |
| **Validation** | Run SQL validation queries | < 1 min | Automated |
| | Manual spot-check | 5 min | Human (Mark) |
| **Total** | End-to-end | **~30 minutes** (including script development time not counted) | |

**Estimated Costs:**
- Gemini API re-embedding: < $0.01
- Infrastructure: $0 (existing PostgreSQL instance)

---

## 10. Success Criteria

Migration is considered **successful** if all of the following are met:

1. **✅ Row counts match:**
   - sessions: 3
   - messages: 1,736
   - interaction_logs: 1,060
   - memories: 1,039
   - entities: 1,396
   - relations: 1,945

2. **✅ Referential integrity:**
   - Zero orphaned messages (all session_id exist in sessions)
   - Zero orphaned relations (all source_id/target_id exist in entities)

3. **✅ Embedding quality:**
   - All embeddings are 1536d
   - HNSW index functional (vector search returns results)
   - Spot-check: "Mark's name" query returns relevant memories

4. **✅ Timestamp validity:**
   - No timestamps in the future
   - No inverted session timelines (started_at > ended_at)

5. **✅ Knowledge graph connectivity:**
   - BFS traversal from 'mark' entity reaches > 10 entities within 3 hops

6. **✅ File migrations:**
   - 284 voice chunks copied
   - dynamic_persona.json copied and schema-compatible
   - hass_devices.yaml copied and YAML-valid

7. **✅ Axel functional test:**
   - Start Axel CLI
   - Send message "Do you remember my name?"
   - Verify: Response includes "Mark" (semantic memory retrieval working)

---

## 11. Post-Migration Tasks

After successful migration:

1. **Archive axnmihn data:**
   ```bash
   tar -czf axnmihn_data_backup_$(date +%Y%m%d).tar.gz \
       /home/northprot/projects/axnmihn/data/
   mv axnmihn_data_backup_*.tar.gz /home/northprot/backups/
   ```

2. **Update Axel configuration:**
   - Verify `.env` points to correct data paths
   - Ensure `GOOGLE_API_KEY` is set for embedding generation

3. **Rebuild hot_memories materialized view:**
   ```sql
   REFRESH MATERIALIZED VIEW CONCURRENTLY hot_memories;
   ```

4. **Run decay update:**
   ```sql
   -- Initial decay computation for migrated memories
   UPDATE memories
   SET decayed_importance = importance,  -- Placeholder; actual decay computed by Axel on next run
       last_decayed_at = NOW();
   ```

5. **Smoke test Axel:**
   ```bash
   cd /home/northprot/projects/axel
   pnpm --filter @axel/axel dev
   # In CLI: "What do you remember about me?"
   # Expected: Axel retrieves memories from PostgreSQL
   ```

6. **Document migration completion:**
   - Update `BACKLOG.md` (mark MIGRATE-PLAN-001 as Done)
   - Write completion report to `.axel-ops/comms/research.jsonl`:
     ```jsonl
     {"ts":"0208C89","from":"research","type":"done","task":"MIGRATE-PLAN-001","out":"docs/research/MIGRATE-001-axnmihn-migration-plan.md","note":"axnmihn→Axel migration plan complete. 1,736 msgs, 1,039 embeddings (3072d→1536d), 1,396 entities + 1,945 relations. Execution time ~30min, cost <$0.01."}
     ```

---

## 12. References

- **ADR-002**: PostgreSQL + pgvector Single DB
- **ADR-013**: 6-Layer Memory Architecture
- **ADR-016**: Embedding Model Selection (gemini-embedding-001, 1536d Matryoshka)
- **migration-strategy.md**: Axel schema migrations 001-008
- **RES-006**: pgvector dimension limits research (1536d Matryoshka truncation)
- **CTO Cycle 88 Broadcast**: axnmihn data inventory (1,736 msgs, 1,039 embeddings, 1,396 entities, 1,945 relations)

---

## Appendix A: Sample Migration Output

```
=== axnmihn → Axel Data Migration ===

[1/6] Extracting SQLite data...
  ✓ sessions: 3 rows
  ✓ messages: 1,736 rows
  ✓ interaction_logs: 1,060 rows

[2/6] Extracting ChromaDB embeddings...
  ✓ memories collection: 1,039 embeddings (3072d)

[3/6] Loading Knowledge Graph...
  ✓ entities: 1,396
  ✓ relations: 1,945

[4/6] Migrating sessions, messages, interaction_logs...
  ✓ sessions → PostgreSQL: 3 inserted
  ✓ session_summaries → PostgreSQL: 3 inserted
  ✓ messages → PostgreSQL: 1,736 inserted
  ✓ interaction_logs → PostgreSQL: 1,060 inserted

[5/6] Re-embedding memories (1,039 × 1536d)...
  ✓ Batch 1/11 (100 texts) — 1.2s
  ✓ Batch 2/11 (100 texts) — 1.1s
  ...
  ✓ Batch 11/11 (39 texts) — 0.8s
  ✓ Total: 1,039 embeddings re-embedded in 12.3s
  ✓ Estimated cost: $0.0078
  ✓ Dropping HNSW index for bulk insert...
  ✓ memories → PostgreSQL: 1,039 inserted
  ✓ Recreating HNSW index (m=16, ef_construction=64)... 2.1s

[6/6] Migrating Knowledge Graph...
  ✓ entities → PostgreSQL: 1,396 inserted
  ✓ relations → PostgreSQL: 1,945 inserted

=== Validation ===
✓ V1: Row counts match (6/6)
✓ V2: No orphaned messages (0/0)
✓ V3: No orphaned relations (0/0)
✓ V4: Embedding dimension correct (1536)
✓ V5: HNSW index exists
✓ V6: Vector search functional (5 results)
✓ V7: All timestamps valid (0 invalid)
✓ V8: All roles valid (user, assistant)
✓ V9: All session_id in messages exist in sessions (0 orphans)
✓ V10: session_summaries match sessions (0 orphans)

✅ Migration completed successfully!

Summary:
- Sessions: 3
- Messages: 1,736
- Interaction logs: 1,060
- Memories: 1,039 (re-embedded to 1536d)
- Entities: 1,396
- Relations: 1,945
- Total time: 18.7s
- Total cost: $0.0078
```

---

## Appendix B: TypeScript Type Definitions

```typescript
// tools/migrate-axnmihn/src/types.ts

export interface AxnmihnSession {
    readonly id: number;
    readonly session_id: string;
    readonly summary: string | null;
    readonly key_topics: string | null;
    readonly emotional_tone: string | null;
    readonly turn_count: number;
    readonly started_at: string;  // ISO 8601
    readonly ended_at: string | null;
    readonly created_at: string;
}

export interface AxnmihnMessage {
    readonly id: number;
    readonly session_id: string;
    readonly turn_id: number;
    readonly role: 'Mark' | 'Axel';
    readonly content: string;
    readonly timestamp: string;
    readonly emotional_context: string | null;
}

export interface AxnmihnInteractionLog {
    readonly id: number;
    readonly ts: string;
    readonly conversation_id: string | null;
    readonly turn_id: number | null;
    readonly effective_model: string;
    readonly tier: string;
    readonly router_reason: string;
    readonly latency_ms: number | null;
    readonly ttft_ms: number | null;
    readonly tokens_in: number | null;
    readonly tokens_out: number | null;
    readonly tool_calls_json: string | null;
}

export interface ChromaMemory {
    readonly id: string;
    readonly content: string;
    readonly metadata: {
        readonly memory_type?: string;
        readonly importance?: number;
        readonly created_at?: string;
        readonly last_accessed?: string;
        readonly access_count?: number;
        readonly source_channel?: string;
    };
}

export interface ReEmbeddedMemory extends ChromaMemory {
    readonly embedding: number[];  // 1536d
}

export interface KnowledgeGraphEntity {
    readonly entity_id: string;
    readonly name: string;
    readonly entity_type: string;
    readonly properties: Record<string, unknown>;
    readonly mentions: number;
    readonly created_at: string;
    readonly last_accessed: string;
}

export interface KnowledgeGraphRelation {
    readonly source_id: string;
    readonly target_id: string;
    readonly relation_type: string;
    readonly weight: number;
    readonly context?: string;
    readonly created_at: string;
}

export interface MigrationConfig {
    readonly axnmihnDataPath: string;
    readonly axnmihnDbPath: string;
    readonly axelDbUrl: string;
    readonly googleApiKey: string;
}

export interface ValidationResult {
    readonly name: string;
    readonly expected: number | string;
    readonly actual: number | string;
    readonly passed: boolean;
}
```
