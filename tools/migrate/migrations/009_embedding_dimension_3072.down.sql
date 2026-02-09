-- Revert to 1536d with standard HNSW
DROP INDEX IF EXISTS idx_memories_embedding;

ALTER TABLE memories
    ALTER COLUMN embedding TYPE vector(1536);

CREATE INDEX idx_memories_embedding
    ON memories
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);
