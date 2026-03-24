import type pg from "pg";

import type {
  AlertRuleRepository,
  AlertRuleRow,
} from "../../application/ports/alert-rules";

const cache: { rows: AlertRuleRow[]; at: number } = { rows: [], at: 0 };

function cacheTtlMs(): number {
  const raw = process.env.ALERT_RULES_CACHE_TTL_MS;
  if (raw === undefined || raw === "") {
    return 30_000;
  }
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : 30_000;
}

/** Aynı Node sürecinde (ör. test) kural listesini sıfırlamak için. */
export function invalidateAlertRulesCache(): void {
  cache.at = 0;
}

export class PgCachedAlertRuleRepository implements AlertRuleRepository {
  constructor(private readonly pool: pg.Pool) {}

  async loadEnabledRules(): Promise<AlertRuleRow[]> {
    const now = Date.now();
    if (cache.at > 0 && now - cache.at < cacheTtlMs()) {
      return cache.rows;
    }
    const r = await this.pool.query<AlertRuleRow>(
      `
      SELECT id::text AS id, name, definition, channel_hint
      FROM alert_rules
      WHERE enabled = true
      ORDER BY created_at ASC
    `,
    );
    cache.rows = r.rows;
    cache.at = now;
    return r.rows;
  }
}
