-- Rollback 005: Remove Meta Memory

DROP MATERIALIZED VIEW IF EXISTS hot_memories;
DROP TABLE IF EXISTS memory_access_patterns;
