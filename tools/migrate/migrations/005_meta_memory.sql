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
