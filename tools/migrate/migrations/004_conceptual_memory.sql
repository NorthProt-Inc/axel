-- Migration 004: Conceptual Memory tables (ADR-013 Layer 4)
-- Knowledge graph: entities and relations

CREATE TABLE entities (
	id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
	entity_id       TEXT UNIQUE NOT NULL,
	name            TEXT NOT NULL,
	entity_type     TEXT NOT NULL,
	properties      JSONB NOT NULL DEFAULT '{}'::jsonb,
	mentions        INTEGER NOT NULL DEFAULT 1 CHECK (mentions >= 1),
	created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	last_accessed   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_entities_name ON entities USING gin (name gin_trgm_ops);
CREATE INDEX idx_entities_type ON entities (entity_type);
CREATE INDEX idx_entities_mentions ON entities (mentions DESC);

CREATE TABLE relations (
	id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
	source_id       TEXT NOT NULL REFERENCES entities(entity_id) ON DELETE CASCADE,
	target_id       TEXT NOT NULL REFERENCES entities(entity_id) ON DELETE CASCADE,
	relation_type   TEXT NOT NULL,
	weight          REAL NOT NULL DEFAULT 1.0 CHECK (weight >= 0),
	context         TEXT,
	created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

	UNIQUE (source_id, target_id, relation_type)
);

CREATE INDEX idx_relations_source ON relations (source_id);
CREATE INDEX idx_relations_target ON relations (target_id);
CREATE INDEX idx_relations_type ON relations (relation_type);
