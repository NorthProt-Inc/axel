-- Rollback 007: Revert sessions schema fix
DROP INDEX IF EXISTS idx_sessions_user;
CREATE INDEX idx_sessions_user ON sessions (user_id, ended_at NULLS FIRST, started_at DESC);

ALTER TABLE sessions
  ALTER COLUMN channel_history DROP DEFAULT,
  ALTER COLUMN channel_history TYPE JSONB USING to_jsonb(channel_history),
  ALTER COLUMN channel_history SET DEFAULT '[]'::jsonb;

ALTER TABLE sessions DROP COLUMN IF EXISTS last_activity_at;
