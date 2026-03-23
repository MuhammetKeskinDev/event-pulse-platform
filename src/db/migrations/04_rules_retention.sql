-- FR-04: kural motoru için kural tanımları (JSON; değerlendirme worker’da genişletilebilir)
-- FR-03 notu: TimescaleDB retention için üretimde örnek:
--   SELECT add_retention_policy('events', INTERVAL '365 days', if_not_exists => TRUE);

CREATE TABLE IF NOT EXISTS alert_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  definition JSONB NOT NULL DEFAULT '{}'::jsonb,
  enabled BOOLEAN NOT NULL DEFAULT true,
  channel_hint TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alert_rules_enabled ON alert_rules (enabled);

COMMENT ON TABLE alert_rules IS 'PDF rule engine stub: condition/window/action JSON.';
