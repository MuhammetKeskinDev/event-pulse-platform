import type pg from "pg";

import type {
  EventWindowCounter,
  WindowCountParams,
} from "../../application/ports/alert-rules";

export class PgEventWindowCounter implements EventWindowCounter {
  constructor(private readonly pool: pg.Pool) {}

  async countInWindow(params: WindowCountParams): Promise<number> {
    const payloadJson =
      params.payloadMatch && Object.keys(params.payloadMatch).length > 0
        ? JSON.stringify(params.payloadMatch)
        : null;
    const r = await this.pool.query<{ c: string }>(
      `
      SELECT COUNT(*)::text AS c
      FROM events
      WHERE occurred_at >= NOW() - ($1::int * INTERVAL '1 minute')
        AND ($2::text IS NULL OR event_type = $2)
        AND ($3::text IS NULL OR source = $3)
        AND ($4::text IS NULL OR payload @> $4::jsonb)
    `,
      [
        params.windowMinutes,
        params.eventType,
        params.source,
        payloadJson,
      ],
    );
    const row = r.rows[0];
    if (!row) {
      return 0;
    }
    return Number.parseInt(row.c, 10) || 0;
  }
}
