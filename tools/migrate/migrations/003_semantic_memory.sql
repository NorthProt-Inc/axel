-- Migration 003: Semantic Memory table (ADR-013 Layer 3)
-- Vector-indexed long-term memories with pgvector

CREATE TABLE memories (
	id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
	uuid                TEXT UNIQUE NOT NULL DEFAULT gen_random_uuid()::text,
	content             TEXT NOT NULL,
	memory_type         TEXT NOT NULL CHECK (memory_type IN ('fact', 'preference', 'insight', 'conversation')),
	importance          REAL NOT NULL DEFAULT 0.5 CHECK (importance >= 0 AND importance <= 1),
	embedding           vector(3072) NOT NULL,

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

-- CRITICAL BLOCKER (ERR-069): pgvector 0.8.1 has a HARD LIMIT of 2000 dimensions for ALL index types.
-- Plan specifies 3072d embeddings (ADR-016), which is INCOMPATIBLE with pgvector indexing.
--
-- Options:
-- 1. Downgrade to 1536d or 2000d embeddings (requires ADR-016 amendment)
-- 2. Wait for pgvector 0.9+ with higher dimension support
-- 3. Use unindexed vector search (sequential scan — unacceptable for production)
-- 4. Use alternative vector DB (Qdrant, Weaviate, etc.) — violates ADR-002 (single PG DB)
--
-- TEMPORARY SOLUTION: Create table WITHOUT vector index. Vector search will use sequential scan.
-- This is a P0 BLOCKER for production deployment. Escalate to Coordinator immediately.
--
-- Commented out index creation:
-- CREATE INDEX idx_memories_embedding ON memories
--     USING hnsw (embedding vector_cosine_ops)
--     WITH (m = 16, ef_construction = 64);  -- FAILS: >2000d not supported

CREATE INDEX idx_memories_importance ON memories (importance DESC);
CREATE INDEX idx_memories_type ON memories (memory_type, importance DESC);
CREATE INDEX idx_memories_accessed ON memories (last_accessed DESC);
CREATE INDEX idx_memories_source_channel ON memories (source_channel)
	WHERE source_channel IS NOT NULL;
