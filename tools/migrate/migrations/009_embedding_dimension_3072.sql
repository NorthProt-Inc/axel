-- 009: Align embedding column to native gemini-embedding-001 output (3072d).
-- Reverts Matryoshka truncation decision from ERR-069; uses full 3072d vectors
-- for maximum recall quality.
-- pgvector 0.8.1 HNSW limit is 2000d for vector type, but halfvec supports
-- up to 4000d. Store as vector(3072), index via halfvec cast for HNSW.

-- Drop old HNSW index (dimension mismatch would block alter)
DROP INDEX IF EXISTS idx_memories_embedding;

-- Alter column from vector(1536) to vector(3072)
ALTER TABLE memories
    ALTER COLUMN embedding TYPE vector(3072);

-- Rebuild HNSW index using halfvec cast (float16, 3072d supported)
-- Data stays float32 in column; index uses float16 for ANN search.
CREATE INDEX idx_memories_embedding
    ON memories
    USING hnsw ((embedding::halfvec(3072)) halfvec_cosine_ops)
    WITH (m = 16, ef_construction = 64);
