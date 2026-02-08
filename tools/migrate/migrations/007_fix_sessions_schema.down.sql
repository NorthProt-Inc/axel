-- Rollback 007: Revert sessions schema fix
DROP INDEX IF EXISTS idx_sessions_user;
CREATE INDEX idx_sessions_user ON sessions (user_id, ended_at NULLS FIRST, started_at DESC);

-- Revert channel_history: TEXT[] → JSONB (only if column type is TEXT[])
DO $$
BEGIN
  -- Check if channel_history column exists and is of type ARRAY
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'sessions'
      AND column_name = 'channel_history'
      AND data_type = 'ARRAY'
  ) THEN
    -- Step 1: Add new column with JSONB type
    ALTER TABLE sessions
      ADD COLUMN channel_history_old JSONB NOT NULL DEFAULT '[]'::jsonb;

    -- Step 2: Migrate data from TEXT[] to JSONB
    UPDATE sessions
      SET channel_history_old = to_jsonb(channel_history);

    -- Step 3: Drop TEXT[] column
    ALTER TABLE sessions DROP COLUMN channel_history;

    -- Step 4: Rename JSONB column to original name
    ALTER TABLE sessions RENAME COLUMN channel_history_old TO channel_history;
  END IF;
END $$;

ALTER TABLE sessions DROP COLUMN IF EXISTS last_activity_at;
