-- TimescaleDB: events hypertable (P0 persistence)
-- Çalıştırma (Docker örneği, proje kökünden):
--   Get-Content src/db/migrations/01_init_schema.sql -Raw | docker exec -i eventpulse-timescaledb psql -U eventpulse -d eventpulse -v ON_ERROR_STOP=1

CREATE EXTENSION IF NOT EXISTS timescaledb;

-- TimescaleDB: partition sütunu (occurred_at) PK / unique index'te bulunmalıdır.
CREATE TABLE IF NOT EXISTS events (
  id UUID NOT NULL,
  event_type TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL,
  PRIMARY KEY (id, occurred_at)
);

SELECT create_hypertable('events', 'occurred_at', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS idx_events_event_type ON events (event_type);
CREATE INDEX IF NOT EXISTS idx_events_occurred_at ON events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_type_time ON events (event_type, occurred_at DESC);
