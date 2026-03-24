import type pg from "pg";

import type {
  AlertRuleRepository,
  AlertRuleRow,
} from "../../application/ports/alert-rules";

const cache: { rows: AlertRuleRow[]; at: number } = { rows: [], at: 0 };
const TTL_MS = 30_000;

export class PgCachedAlertRuleRepository implements AlertRuleRepository {
  constructor(private readonly pool: pg.Pool) {}

  async loadEnabledRules(): Promise<AlertRuleRow[]> {
    const now = Date.now();
    if (cache.at > 0 && now - cache.at < TTL_MS) {
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
