-- Migration 006: Interaction logs (telemetry)
-- Tracks LLM usage, latency, and tool calls per turn

CREATE TABLE interaction_logs (
	id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
	ts              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	session_id      TEXT,
	channel_id      TEXT,
	turn_id         INTEGER,
	effective_model TEXT NOT NULL,
	tier            TEXT NOT NULL,
	router_reason   TEXT NOT NULL,
	latency_ms      INTEGER CHECK (latency_ms IS NULL OR latency_ms >= 0),
	ttft_ms         INTEGER CHECK (ttft_ms IS NULL OR ttft_ms >= 0),
	tokens_in       INTEGER CHECK (tokens_in IS NULL OR tokens_in >= 0),
	tokens_out      INTEGER CHECK (tokens_out IS NULL OR tokens_out >= 0),
	tool_calls      JSONB NOT NULL DEFAULT '[]'::jsonb,
	error           TEXT
);

CREATE INDEX idx_interaction_logs_ts ON interaction_logs (ts DESC);
CREATE INDEX idx_interaction_logs_model ON interaction_logs (effective_model, ts DESC);
CREATE INDEX idx_interaction_logs_session ON interaction_logs (session_id, turn_id)
	WHERE session_id IS NOT NULL;

-- Partition by month for efficient archival (optional, enable when data grows)
-- Future: convert to partitioned table with monthly partitions
