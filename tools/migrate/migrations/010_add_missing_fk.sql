-- Migration 010: Add missing foreign key constraints
-- Prevents orphaned session references in interaction_logs and memories

ALTER TABLE interaction_logs
  ADD CONSTRAINT fk_interaction_logs_session
  FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE SET NULL;

ALTER TABLE memories
  ADD CONSTRAINT fk_memories_source_session
  FOREIGN KEY (source_session) REFERENCES sessions(session_id) ON DELETE SET NULL;
