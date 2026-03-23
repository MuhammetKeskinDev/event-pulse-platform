-- PDF Appendix A: source + metadata on events; backward-compatible defaults.

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'unknown';

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_events_source ON events (source, occurred_at DESC);

COMMENT ON COLUMN events.source IS 'Originating system (e.g. web_app, payment_service).';
COMMENT ON COLUMN events.metadata IS 'Optional envelope metadata (user_id, session_id, geo, etc.).';
