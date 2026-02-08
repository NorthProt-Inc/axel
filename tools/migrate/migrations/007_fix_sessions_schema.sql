-- Migration 007: Fix sessions schema drift
-- Adds missing last_activity_at column, fixes channel_history type

-- Add missing column
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Fix channel_history: JSONB → TEXT[]
ALTER TABLE sessions
  ALTER COLUMN channel_history DROP DEFAULT,
  ALTER COLUMN channel_history TYPE TEXT[] USING
    CASE
      WHEN channel_history IS NULL THEN '{}'::text[]
      ELSE (SELECT array_agg(elem::text) FROM jsonb_array_elements_text(channel_history) AS elem)
    END,
  ALTER COLUMN channel_history SET DEFAULT '{}'::text[];

-- Recreate index to include last_activity_at
DROP INDEX IF EXISTS idx_sessions_user;
CREATE INDEX idx_sessions_user ON sessions (user_id, ended_at NULLS FIRST, last_activity_at DESC);
