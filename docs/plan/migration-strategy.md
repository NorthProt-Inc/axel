# PostgreSQL Migration Strategy

> PLAN-003 deliverable
> Date: 2026-02-07
> References: v2.0 Plan Section 4.2.1, ADR-002, ADR-013

## Overview

Axel uses PostgreSQL 17 + pgvector 0.8 as the single persistent store.
This document defines the migration framework and the initial schema migrations.

### Principles

1. **Every migration is reversible** — every `up` has a corresponding `down`
2. **Migrations are numbered sequentially** — `001`, `002`, ... (no timestamps in names, simple ordering)
3. **Migrations are idempotent** — `IF NOT EXISTS` / `IF EXISTS` guards where possible
4. **One concern per migration** — don't mix unrelated schema changes
5. **Data migrations are separate** — schema changes and data transforms are in separate files
6. **Test with rollback** — CI runs `up → seed → down → up` to verify reversibility

### Directory Structure

```
tools/migrate/migrations/
├── 001_extensions.sql
├── 001_extensions.down.sql
├── 002_episodic_memory.sql
├── 002_episodic_memory.down.sql
├── 003_semantic_memory.sql
├── 003_semantic_memory.down.sql
├── 004_conceptual_memory.sql
├── 004_conceptual_memory.down.sql
├── 005_meta_memory.sql
├── 005_meta_memory.down.sql
├── 006_interaction_logs.sql
├── 006_interaction_logs.down.sql
├── 007_fix_sessions_schema.sql
├── 007_fix_sessions_schema.down.sql
├── 008_session_summaries.sql
├── 008_session_summaries.down.sql
├── 009_embedding_dimension_3072.sql        ⚠ DEPRECATED — see note below
├── 009_embedding_dimension_3072.down.sql
├── 010_add_missing_fk.sql
├── 010_add_missing_fk.down.sql
├── 011_consolidation_tracking.sql
├── 011_consolidation_tracking.down.sql
└── README.md
```

### Migration Runner

A lightweight runner (no ORM). Tracks applied migrations in a `schema_migrations` table:

```sql
CREATE TABLE IF NOT EXISTS schema_migrations (
    version     INTEGER PRIMARY KEY,
    name        TEXT NOT NULL,
    applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

The runner:
1. Reads all `*.sql` (up) files sorted by version number
2. Compares against `schema_migrations` to find unapplied migrations
3. Executes each pending migration in a transaction
4. Records the version in `schema_migrations`
5. For rollback: reads `*.down.sql` and removes from `schema_migrations`

No external dependencies (e.g., Prisma, Knex) — just `pg` client + raw SQL files.

---

## Migration Files

### 001: Extensions

**`001_extensions.sql` (up)**
```sql
-- Migration 001: Enable required PostgreSQL extensions
-- Requires: PostgreSQL 17+, pgvector extension installed

CREATE EXTENSION IF NOT EXISTS vector;          -- pgvector for vector similarity search
CREATE EXTENSION IF NOT EXISTS pg_trgm;         -- Trigram for text similarity
CREATE EXTENSION IF NOT EXISTS pgcrypto;        -- gen_random_uuid()

-- schema_migrations tracking table
CREATE TABLE IF NOT EXISTS schema_migrations (
    version     INTEGER PRIMARY KEY,
    name        TEXT NOT NULL,
    applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**`001_extensions.down.sql`**
```sql
-- Rollback 001: Remove extensions
-- WARNING: Dropping extensions will cascade to dependent objects.
-- Only safe on empty database or during initial setup.

DROP TABLE IF EXISTS schema_migrations;
DROP EXTENSION IF EXISTS pgcrypto;
DROP EXTENSION IF EXISTS pg_trgm;
DROP EXTENSION IF EXISTS vector;
```

### 002: Episodic Memory

**`002_episodic_memory.sql` (up)**
```sql
-- Migration 002: Episodic Memory tables (ADR-013 Layer 2)
-- Sessions and messages for conversation history

CREATE TABLE sessions (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    session_id      TEXT UNIQUE NOT NULL,
    user_id         TEXT NOT NULL,
    channel_id      TEXT,
    channel_history TEXT[] NOT NULL DEFAULT '{}'::text[],
    summary         TEXT,
    key_topics      JSONB NOT NULL DEFAULT '[]'::jsonb,
    emotional_tone  TEXT,
    turn_count      INTEGER NOT NULL DEFAULT 0,
    started_at      TIMESTAMPTZ NOT NULL,
    ended_at        TIMESTAMPTZ,
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT sessions_started_at_check
        CHECK (started_at <= COALESCE(ended_at, NOW()))
);

CREATE INDEX idx_sessions_started ON sessions (started_at DESC);
CREATE INDEX idx_sessions_user ON sessions (user_id, ended_at NULLS FIRST, last_activity_at DESC);
CREATE INDEX idx_sessions_channel ON sessions (channel_id, started_at DESC);
CREATE INDEX idx_sessions_topics ON sessions USING gin (key_topics);

CREATE TABLE messages (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    session_id        TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
    turn_id           INTEGER NOT NULL,
    role              TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
    content           TEXT NOT NULL,
    channel_id        TEXT,
    timestamp         TIMESTAMPTZ NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    token_count       INTEGER NOT NULL DEFAULT 0,
    emotional_context TEXT NOT NULL DEFAULT 'neutral',
    metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,

    UNIQUE (session_id, turn_id, role)
);

CREATE INDEX idx_messages_session ON messages (session_id, turn_id);
CREATE INDEX idx_messages_timestamp ON messages (timestamp DESC);
CREATE INDEX idx_messages_content_trgm ON messages USING gin (content gin_trgm_ops);
```

**`002_episodic_memory.down.sql`**
```sql
-- Rollback 002: Remove Episodic Memory tables

DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS sessions;
```

### 003: Semantic Memory

**`003_semantic_memory.sql` (up)**
```sql
-- Migration 003: Semantic Memory table (ADR-013 Layer 3)
-- Vector-indexed long-term memories with pgvector

CREATE TABLE memories (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    uuid                TEXT UNIQUE NOT NULL DEFAULT gen_random_uuid()::text,
    content             TEXT NOT NULL,
    memory_type         TEXT NOT NULL CHECK (memory_type IN ('fact', 'preference', 'insight', 'conversation')),
    importance          REAL NOT NULL DEFAULT 0.5 CHECK (importance >= 0 AND importance <= 1),
    embedding           vector(1536) NOT NULL,

    -- Decay metadata
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_accessed       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    access_count        INTEGER NOT NULL DEFAULT 1 CHECK (access_count >= 1),

    -- Cross-channel metadata
    source_channel      TEXT,
    channel_mentions    JSONB NOT NULL DEFAULT '{}'::jsonb,
    source_session      TEXT,

    -- Decay state
    decayed_importance  REAL CHECK (decayed_importance IS NULL OR (decayed_importance >= 0 AND decayed_importance <= 1)),
    last_decayed_at     TIMESTAMPTZ
);

-- HNSW index for vector search (consistent with plan body Section 4 Layer 3).
-- RES-001: HNSW recommended (7.4x faster queries, better recall than IVFFlat).
-- m=16, ef_construction=64 suitable for 1536d vectors at 1K-10K scale.
-- Memory: (1536 × 4) + (16 × 2 × 4) = 6,272 bytes/vector. 1K vectors ≈ 6MB, 10K ≈ 61MB.
-- Phase 0 VPS (8GB RAM) can accommodate this comfortably.
CREATE INDEX idx_memories_embedding ON memories
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

CREATE INDEX idx_memories_importance ON memories (importance DESC);
CREATE INDEX idx_memories_type ON memories (memory_type, importance DESC);
CREATE INDEX idx_memories_accessed ON memories (last_accessed DESC);
CREATE INDEX idx_memories_source_channel ON memories (source_channel)
    WHERE source_channel IS NOT NULL;
```

**`003_semantic_memory.down.sql`**
```sql
-- Rollback 003: Remove Semantic Memory table

DROP TABLE IF EXISTS memories;
```

### 004: Conceptual Memory

**`004_conceptual_memory.sql` (up)**
```sql
-- Migration 004: Conceptual Memory tables (ADR-013 Layer 4)
-- Knowledge graph: entities and relations

CREATE TABLE entities (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    entity_id       TEXT UNIQUE NOT NULL,
    name            TEXT NOT NULL,
    entity_type     TEXT NOT NULL,
    properties      JSONB NOT NULL DEFAULT '{}'::jsonb,
    mentions        INTEGER NOT NULL DEFAULT 1 CHECK (mentions >= 1),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_accessed   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_entities_name ON entities USING gin (name gin_trgm_ops);
CREATE INDEX idx_entities_type ON entities (entity_type);
CREATE INDEX idx_entities_mentions ON entities (mentions DESC);

CREATE TABLE relations (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    source_id       TEXT NOT NULL REFERENCES entities(entity_id) ON DELETE CASCADE,
    target_id       TEXT NOT NULL REFERENCES entities(entity_id) ON DELETE CASCADE,
    relation_type   TEXT NOT NULL,
    weight          REAL NOT NULL DEFAULT 1.0 CHECK (weight >= 0),
    context         TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (source_id, target_id, relation_type)
);

CREATE INDEX idx_relations_source ON relations (source_id);
CREATE INDEX idx_relations_target ON relations (target_id);
CREATE INDEX idx_relations_type ON relations (relation_type);
```

**`004_conceptual_memory.down.sql`**
```sql
-- Rollback 004: Remove Conceptual Memory tables

DROP TABLE IF EXISTS relations;
DROP TABLE IF EXISTS entities;
```

### 005: Meta Memory

**`005_meta_memory.sql` (up)**
```sql
-- Migration 005: Meta Memory (ADR-013 Layer 5)
-- Search pattern tracking and hot memory materialized view

CREATE TABLE memory_access_patterns (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    query_text          TEXT NOT NULL,
    matched_memory_ids  BIGINT[] NOT NULL,
    relevance_scores    REAL[] NOT NULL,
    channel_id          TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Ensure arrays have same length
    CONSTRAINT scores_match_ids
        CHECK (array_length(matched_memory_ids, 1) = array_length(relevance_scores, 1))
);

CREATE INDEX idx_access_patterns_time ON memory_access_patterns (created_at DESC);
CREATE INDEX idx_access_patterns_channel ON memory_access_patterns (channel_id, created_at DESC)
    WHERE channel_id IS NOT NULL;

-- Materialized view: frequently accessed memories in the last 7 days
-- Corrected from v2.0 plan (fixed LATERAL jsonb_object_keys aggregation issue)
--
-- Logic:
-- 1. Filter memories accessed in last 7 days
-- 2. Count how many distinct channels mention each memory
-- 3. Rank by access_count * channel_diversity
--
-- NOTE: jsonb_object_keys returns nothing for empty '{}' objects,
-- so memories with no channel_mentions are excluded from channel_diversity.
-- This is intentional: cross-channel memories are more valuable for prefetch.
CREATE MATERIALIZED VIEW hot_memories AS
SELECT
    m.id,
    m.uuid,
    m.content,
    m.memory_type,
    m.importance,
    m.access_count,
    m.last_accessed,
    COALESCE(cd.channel_count, 0) AS channel_diversity
FROM memories m
LEFT JOIN LATERAL (
    SELECT COUNT(*) AS channel_count
    FROM jsonb_object_keys(m.channel_mentions)
) cd ON true
WHERE m.last_accessed > NOW() - INTERVAL '7 days'
ORDER BY m.access_count DESC, cd.channel_count DESC NULLS LAST
LIMIT 100;

-- Unique index required for REFRESH MATERIALIZED VIEW CONCURRENTLY
CREATE UNIQUE INDEX idx_hot_memories_id ON hot_memories (id);
```

**`005_meta_memory.down.sql`**
```sql
-- Rollback 005: Remove Meta Memory

DROP MATERIALIZED VIEW IF EXISTS hot_memories;
DROP TABLE IF EXISTS memory_access_patterns;
```

### 006: Interaction Logs

**`006_interaction_logs.sql` (up)**
```sql
-- Migration 006: Interaction logs (telemetry)
-- Tracks LLM usage, latency, and tool calls per turn

CREATE TABLE interaction_logs (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ts              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    session_id      TEXT,
    channel_id      TEXT,
    turn_id         INTEGER,
    effective_model TEXT NOT NULL,
    tier            TEXT NOT NULL,
    router_reason   TEXT NOT NULL,
    latency_ms      INTEGER CHECK (latency_ms IS NULL OR latency_ms >= 0),
    ttft_ms         INTEGER CHECK (ttft_ms IS NULL OR ttft_ms >= 0),
    tokens_in       INTEGER CHECK (tokens_in IS NULL OR tokens_in >= 0),
    tokens_out      INTEGER CHECK (tokens_out IS NULL OR tokens_out >= 0),
    tool_calls      JSONB NOT NULL DEFAULT '[]'::jsonb,
    error           TEXT
);

CREATE INDEX idx_interaction_logs_ts ON interaction_logs (ts DESC);
CREATE INDEX idx_interaction_logs_model ON interaction_logs (effective_model, ts DESC);
CREATE INDEX idx_interaction_logs_session ON interaction_logs (session_id, turn_id)
    WHERE session_id IS NOT NULL;

-- Partition by month for efficient archival (optional, enable when data grows)
-- Future: convert to partitioned table with monthly partitions
```

**`006_interaction_logs.down.sql`**
```sql
-- Rollback 006: Remove interaction logs

DROP TABLE IF EXISTS interaction_logs;
```

### 007: Fix Sessions Schema

**`007_fix_sessions_schema.sql` (up)**
```sql
-- Migration 007: Fix sessions schema drift
-- Adds missing last_activity_at column, fixes channel_history type if needed
-- Applied conditionally: safe to run on fresh or existing databases

-- Add missing column
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Fix channel_history: JSONB → TEXT[] (only if column type is JSONB)
-- Uses DO $$ block to conditionally convert, avoiding errors on already-correct schemas
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'sessions'
      AND column_name = 'channel_history'
      AND data_type = 'jsonb'
  ) THEN
    ALTER TABLE sessions ADD COLUMN channel_history_new TEXT[] NOT NULL DEFAULT '{}'::text[];
    UPDATE sessions SET channel_history_new = CASE
      WHEN jsonb_typeof(channel_history) = 'array' THEN
        ARRAY(SELECT jsonb_array_elements_text(channel_history))
      ELSE '{}'::text[] END;
    ALTER TABLE sessions DROP COLUMN channel_history;
    ALTER TABLE sessions RENAME COLUMN channel_history_new TO channel_history;
  END IF;
END $$;

-- Recreate index to include last_activity_at
DROP INDEX IF EXISTS idx_sessions_user;
CREATE INDEX idx_sessions_user ON sessions (user_id, ended_at NULLS FIRST, last_activity_at DESC);
```

**`007_fix_sessions_schema.down.sql`**
```sql
-- Rollback 007: Revert sessions schema fix
DROP INDEX IF EXISTS idx_sessions_user;
CREATE INDEX idx_sessions_user ON sessions (user_id, ended_at NULLS FIRST, started_at DESC);

-- Revert channel_history: TEXT[] → JSONB (only if column type is ARRAY)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sessions'
      AND column_name = 'channel_history'
      AND data_type = 'ARRAY'
  ) THEN
    ALTER TABLE sessions ADD COLUMN channel_history_old JSONB NOT NULL DEFAULT '[]'::jsonb;
    UPDATE sessions SET channel_history_old = to_jsonb(channel_history);
    ALTER TABLE sessions DROP COLUMN channel_history;
    ALTER TABLE sessions RENAME COLUMN channel_history_old TO channel_history;
  END IF;
END $$;

ALTER TABLE sessions DROP COLUMN IF EXISTS last_activity_at;
```

> **Note**: Migration 007 exists because the original 002 migration was initially deployed
> without `last_activity_at` and with `channel_history JSONB`. FIX-SCHEMA-001 (C62) updated
> the 002 source to include these columns for fresh installs, but existing databases need
> 007 to patch the running schema. The DO $$ conditional block ensures idempotency.

### 008: Session Summaries

**`008_session_summaries.sql` (up)**
```sql
-- Migration 008: Session Summaries table
-- Stores AI-generated session summaries for quick context retrieval

CREATE TABLE session_summaries (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    session_id     TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
    summary        TEXT,
    key_topics     JSONB NOT NULL DEFAULT '[]'::jsonb,
    emotional_tone TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (session_id)
);

CREATE INDEX idx_session_summaries_session ON session_summaries (session_id);
CREATE INDEX idx_session_summaries_topics ON session_summaries USING gin (key_topics);
CREATE INDEX idx_session_summaries_created ON session_summaries (created_at DESC);
```

**`008_session_summaries.down.sql`**
```sql
-- Rollback 008: Drop session_summaries table
DROP TABLE IF EXISTS session_summaries;
```

> **Note**: Session summaries were previously stored inline in the `sessions` table
> (summary, key_topics, emotional_tone columns). Migration 008 extracts these into a
> dedicated table with a 1:1 FK relationship, enabling independent lifecycle management
> and efficient retrieval without loading full session data.

### 009: Embedding Dimension 3072 — ⚠ DEPRECATED

> **⚠ WARNING**: This migration is **DEPRECATED and MUST NOT be executed** on production databases.
> It conflicts with ADR-016 (1536d Matryoshka truncation, Mark approved ERR-069) and
> container.ts (`embeddingDimension: 1536`). See DRIFT-009 below for details.

**`009_embedding_dimension_3072.sql` (up)** — DEPRECATED
```sql
-- ⚠ DEPRECATED: DO NOT EXECUTE. Conflicts with ADR-016 (1536d decision).
-- Was created before FIX-DIMENSION-001 (Mark human direct, C68) finalized 1536d.
-- Kept for migration version continuity (version 009 is reserved).

-- Alters memories.embedding from vector(1536) to vector(3072)
-- and rebuilds HNSW index using halfvec(3072) cast.
```

**`009_embedding_dimension_3072.down.sql`** — Reverts to 1536d with standard HNSW.

**DRIFT-009 Resolution**: Migration 009 was authored when 3072d native + halfvec HNSW
indexing was being explored. Subsequently, Mark(Human) approved and directly applied
the 1536d Matryoshka truncation approach in FIX-DIMENSION-001 (C68), which updated
migration 003 to `vector(1536)` with standard HNSW index. ADR-016 was amended to
confirm 1536d. Migration 009 is now obsolete.

**Action Required (DevOps)**: Replace migration 009 content with a no-op migration
(comment-only SQL) to preserve version sequence. Example:
```sql
-- Migration 009: Reserved (originally embedding dimension change, now superseded)
-- ADR-016 confirmed 1536d Matryoshka truncation (FIX-DIMENSION-001, C68).
-- Migration 003 already defines vector(1536). No schema change needed.
SELECT 1; -- no-op
```

### 010: Add Missing Foreign Keys

**`010_add_missing_fk.sql` (up)**
```sql
-- Migration 010: Add missing foreign key constraints
-- Prevents orphaned session references in interaction_logs and memories

ALTER TABLE interaction_logs
  ADD CONSTRAINT fk_interaction_logs_session
  FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE SET NULL;

ALTER TABLE memories
  ADD CONSTRAINT fk_memories_source_session
  FOREIGN KEY (source_session) REFERENCES sessions(session_id) ON DELETE SET NULL;
```

**`010_add_missing_fk.down.sql`**
```sql
-- Rollback 010: Remove foreign key constraints
ALTER TABLE interaction_logs DROP CONSTRAINT IF EXISTS fk_interaction_logs_session;
ALTER TABLE memories DROP CONSTRAINT IF EXISTS fk_memories_source_session;
```

> **Note**: FK constraints use ON DELETE SET NULL to prevent cascade deletion of
> interaction logs and memories when sessions are removed. This preserves historical
> data while maintaining referential integrity.

### 011: Consolidation Tracking

**`011_consolidation_tracking.sql` (up)**
```sql
-- Migration 011: Add consolidation tracking to sessions
-- Tracks which sessions have been consolidated (L2→L3 memory extraction)

ALTER TABLE sessions ADD COLUMN consolidated_at TIMESTAMPTZ;

CREATE INDEX idx_sessions_unconsolidated
  ON sessions (ended_at)
  WHERE ended_at IS NOT NULL AND consolidated_at IS NULL;
```

**`011_consolidation_tracking.down.sql`**
```sql
DROP INDEX IF EXISTS idx_sessions_unconsolidated;
ALTER TABLE sessions DROP COLUMN IF EXISTS consolidated_at;
```

> **Note**: The partial index `idx_sessions_unconsolidated` efficiently identifies
> ended sessions that have not yet been processed by the L2→L3 consolidation service
> (MARK-CONSOLIDATION). The consolidation scheduler queries this index periodically
> to find sessions with `minTurns >= 3` for LLM-based memory extraction.

---

## Data Migration: axnmihn → Axel

Data migration is handled by `tools/migrate/` (separate from schema migrations).
See v2.0 Plan Section 5 for full details.

### Execution Order

```
1. Run schema migrations (001-008, skip 009, then 010-011)
   NOTE: Migration 009 is DEPRECATED (see above). For fresh installs,
   migration 003 already defines vector(1536). For existing databases,
   009 must be replaced with a no-op before execution.
2. Run data migration tool:
   a. SQLite sessions/messages → PostgreSQL sessions, messages
   b. ChromaDB vectors → PostgreSQL memories (re-embed with gemini-embedding-001)
   c. knowledge_graph.json → PostgreSQL entities, relations
   d. dynamic_persona.json → file copy (no DB)
3. Rebuild HNSW index (REINDEX) after bulk data load
4. REFRESH MATERIALIZED VIEW hot_memories
5. Run validation checks (see below)
```

### HNSW Index Note

HNSW indexes are built incrementally and do not depend on existing data distribution
(unlike IVFFlat which builds clusters at creation time). This means HNSW works
correctly even when created on an empty table.

**However**, for large bulk imports, it is more efficient to:
```sql
-- 1. Create table WITHOUT HNSW index (faster bulk INSERT)
-- 2. Bulk insert migrated vectors
-- 3. Then create the index:
CREATE INDEX idx_memories_embedding ON memories
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- Or if index already exists from migration:
REINDEX INDEX idx_memories_embedding;
```

The migration file (003) includes the HNSW index for simplicity (works for new installs).
For data migration from axnmihn, the data migration tool should drop the index before
bulk import, then recreate it afterward for optimal build performance.

### Validation Checks

After migration, run these verification queries:

```sql
-- 1. Session count matches
SELECT COUNT(*) FROM sessions;
-- Expected: >= 1,600 (from axnmihn SQLite)

-- 2. Message count matches
SELECT COUNT(*) FROM messages;
-- Expected: >= 3,200 (user+assistant pairs)

-- 3. Memory count matches
SELECT COUNT(*) FROM memories;
-- Expected: >= 1,000 (from axnmihn ChromaDB)

-- 4. Entity count matches
SELECT COUNT(*) FROM entities;
-- Expected: 1,396 (from knowledge_graph.json)

-- 5. Relation count matches
SELECT COUNT(*) FROM relations;
-- Expected: 1,945 (from knowledge_graph.json)

-- 6. Vector search works (sanity check)
-- Requires a known embedding vector for "Mark"
SELECT content, 1 - (embedding <=> '[...]') AS score
FROM memories
ORDER BY embedding <=> '[...]'
LIMIT 5;

-- 7. Graph traversal works
WITH RECURSIVE traversal AS (
    SELECT target_id, relation_type, weight, 1 AS depth
    FROM relations WHERE source_id = 'mark'
    UNION ALL
    SELECT r.target_id, r.relation_type, r.weight, t.depth + 1
    FROM relations r JOIN traversal t ON r.source_id = t.target_id
    WHERE t.depth < 2
)
SELECT COUNT(DISTINCT target_id) FROM traversal;
-- Expected: > 0

-- 8. No orphaned messages (referential integrity)
SELECT COUNT(*) FROM messages m
LEFT JOIN sessions s ON m.session_id = s.session_id
WHERE s.session_id IS NULL;
-- Expected: 0

-- 9. No orphaned relations
SELECT COUNT(*) FROM relations r
LEFT JOIN entities e1 ON r.source_id = e1.entity_id
LEFT JOIN entities e2 ON r.target_id = e2.entity_id
WHERE e1.entity_id IS NULL OR e2.entity_id IS NULL;
-- Expected: 0
```

---

## Vector Re-embedding Strategy

### Why Re-embed?

axnmihn used `text-embedding-004` (deprecated 2026-01-14).
Axel uses `gemini-embedding-001` (1536d Matryoshka truncation, ADR-016).

These are **different embedding models** — vectors from text-embedding-004
are NOT compatible with gemini-embedding-001 embeddings.
Direct vector copy would produce meaningless similarity scores.

### Re-embedding Process

```
1. Extract content + metadata from ChromaDB (Python script)
2. For each memory's content text:
   a. Call Gemini gemini-embedding-001 API (1536d output, Matryoshka truncation)
   b. Batch: 100 texts per API call
   c. Rate limit: ~1,500 RPM (Gemini free tier)
3. INSERT into PostgreSQL memories table with new embedding
4. Total: ~1,000 memories × 1 API call per 100 = ~10 API calls
5. Estimated time: < 30 seconds
6. Estimated cost: < $0.01 (Gemini embedding pricing)
```

### Rollback Plan

If re-embedding produces poor quality results:
1. Keep original ChromaDB as backup (do not delete)
2. Re-run with different embedding model parameters
3. Compare top-5 recall between old and new embeddings for test queries

---

## CI Migration Test

GitHub Actions workflow step:

```yaml
migration-test:
  services:
    postgres:
      image: pgvector/pgvector:pg17
      env:
        POSTGRES_DB: axel_test
        POSTGRES_PASSWORD: test
      ports:
        - 5432:5432
  steps:
    - name: Run migrations up
      run: pnpm --filter @axel/infra migrate:up
    - name: Seed test data
      run: pnpm --filter @axel/infra migrate:seed
    - name: Run migrations down (full rollback)
      run: pnpm --filter @axel/infra migrate:down --all
    - name: Run migrations up again (verify re-apply)
      run: pnpm --filter @axel/infra migrate:up
    - name: Verify schema
      run: pnpm --filter @axel/infra migrate:verify
```

This ensures all migrations are reversible and re-applicable.
