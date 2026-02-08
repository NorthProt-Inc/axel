-- Rollback 001: Remove extensions
-- WARNING: Dropping extensions will cascade to dependent objects.
-- Only safe on empty database or during initial setup.

DROP EXTENSION IF EXISTS pgcrypto;
DROP EXTENSION IF EXISTS pg_trgm;
DROP EXTENSION IF EXISTS vector;
