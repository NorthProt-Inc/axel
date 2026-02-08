-- Migration 008: Session Summaries table
-- Stores AI-generated session summaries for quick context retrieval

CREATE TABLE session_summaries (
	id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
	session_id     TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
	summary        TEXT,
	key_topics     JSONB NOT NULL DEFAULT '[]'::jsonb,
	emotional_tone TEXT,
	created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

	UNIQUE (session_id)
);

CREATE INDEX idx_session_summaries_session ON session_summaries (session_id);
CREATE INDEX idx_session_summaries_topics ON session_summaries USING gin (key_topics);
CREATE INDEX idx_session_summaries_created ON session_summaries (created_at DESC);
