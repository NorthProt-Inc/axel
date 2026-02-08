-- Migration 007: Fix sessions schema drift
-- Adds missing last_activity_at column, fixes channel_history type if needed

-- Add missing column
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Fix channel_history: JSONB → TEXT[] (only if column type is JSONB)
-- Check if column exists and is JSONB type before converting
DO $$
BEGIN
  -- Check if channel_history column exists and is of type jsonb
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'sessions'
      AND column_name = 'channel_history'
      AND data_type = 'jsonb'
  ) THEN
    -- Step 1: Add new column with TEXT[] type
    ALTER TABLE sessions
      ADD COLUMN channel_history_new TEXT[] NOT NULL DEFAULT '{}'::text[];

    -- Step 2: Migrate data from JSONB to TEXT[]
    UPDATE sessions
      SET channel_history_new = CASE
        WHEN jsonb_typeof(channel_history) = 'array' THEN
          ARRAY(SELECT jsonb_array_elements_text(channel_history))
        ELSE
          '{}'::text[]
      END;

    -- Step 3: Drop old JSONB column
    ALTER TABLE sessions DROP COLUMN channel_history;

    -- Step 4: Rename new column to original name
    ALTER TABLE sessions RENAME COLUMN channel_history_new TO channel_history;
  END IF;
END $$;

-- Recreate index to include last_activity_at
DROP INDEX IF EXISTS idx_sessions_user;
CREATE INDEX idx_sessions_user ON sessions (user_id, ended_at NULLS FIRST, last_activity_at DESC);
