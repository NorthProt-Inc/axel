DROP INDEX IF EXISTS idx_sessions_unconsolidated;
ALTER TABLE sessions DROP COLUMN IF EXISTS consolidated_at;
