-- Migration 002: Episodic Memory tables (ADR-013 Layer 2)
-- Sessions and messages for conversation history

CREATE TABLE sessions (
	id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
	session_id      TEXT UNIQUE NOT NULL,
	user_id         TEXT NOT NULL,
	channel_id      TEXT,
	channel_history TEXT[] NOT NULL DEFAULT '{}'::text[],
	summary         TEXT,
	key_topics      JSONB NOT NULL DEFAULT '[]'::jsonb,
	emotional_tone  TEXT,
	turn_count      INTEGER NOT NULL DEFAULT 0,
	started_at      TIMESTAMPTZ NOT NULL,
	ended_at        TIMESTAMPTZ,
	last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

	CONSTRAINT sessions_started_at_check
		CHECK (started_at <= COALESCE(ended_at, NOW()))
);

CREATE INDEX idx_sessions_started ON sessions (started_at DESC);
CREATE INDEX idx_sessions_user ON sessions (user_id, ended_at NULLS FIRST, last_activity_at DESC);
CREATE INDEX idx_sessions_channel ON sessions (channel_id, started_at DESC);
CREATE INDEX idx_sessions_topics ON sessions USING gin (key_topics);

CREATE TABLE messages (
	id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
	session_id        TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
	turn_id           INTEGER NOT NULL,
	role              TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
	content           TEXT NOT NULL,
	channel_id        TEXT,
	timestamp         TIMESTAMPTZ NOT NULL,
	created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	token_count       INTEGER NOT NULL DEFAULT 0,
	emotional_context TEXT NOT NULL DEFAULT 'neutral',
	metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,

	UNIQUE (session_id, turn_id, role)
);

CREATE INDEX idx_messages_session ON messages (session_id, turn_id);
CREATE INDEX idx_messages_timestamp ON messages (timestamp DESC);
CREATE INDEX idx_messages_content_trgm ON messages USING gin (content gin_trgm_ops);
