-- P1 FR-09: anomalies tablosuna event_type (toplam hacim anomalisi için '*' kullanılır)
-- Çalıştırma (proje kökünden):
--   Get-Content src/db/migrations/03_anomalies_p1_columns.sql -Raw | docker exec -i eventpulse-timescaledb psql -U eventpulse -d eventpulse -v ON_ERROR_STOP=1

ALTER TABLE anomalies
  ADD COLUMN IF NOT EXISTS event_type TEXT NOT NULL DEFAULT '*';
