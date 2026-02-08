-- Migration 001: Enable required PostgreSQL extensions
-- Requires: PostgreSQL 17+, pgvector extension installed

CREATE EXTENSION IF NOT EXISTS vector;          -- pgvector for vector similarity search
CREATE EXTENSION IF NOT EXISTS pg_trgm;         -- Trigram for text similarity
CREATE EXTENSION IF NOT EXISTS pgcrypto;        -- gen_random_uuid()
