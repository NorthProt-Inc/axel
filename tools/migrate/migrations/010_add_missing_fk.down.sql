-- Rollback 010: Remove foreign key constraints

ALTER TABLE interaction_logs DROP CONSTRAINT IF EXISTS fk_interaction_logs_session;
ALTER TABLE memories DROP CONSTRAINT IF EXISTS fk_memories_source_session;
