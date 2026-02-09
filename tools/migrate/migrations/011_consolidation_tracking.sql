-- Migration 011: Add consolidation tracking to sessions
-- Tracks which sessions have been consolidated (L2→L3 memory extraction)

ALTER TABLE sessions ADD COLUMN consolidated_at TIMESTAMPTZ;

CREATE INDEX idx_sessions_unconsolidated
  ON sessions (ended_at)
  WHERE ended_at IS NOT NULL AND consolidated_at IS NULL;
