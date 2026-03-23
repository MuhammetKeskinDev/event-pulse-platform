-- FR-03: drop chunks older than 7 days (TimescaleDB retention policy on hypertable).

SELECT public.add_retention_policy(
  'events',
  INTERVAL '7 days',
  if_not_exists => TRUE
);
