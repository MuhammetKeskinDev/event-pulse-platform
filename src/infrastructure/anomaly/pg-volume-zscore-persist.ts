import type { Pool } from "pg";

import {
  ANOMALY_EVENT_TYPE_AGGREGATE,
  BASELINE_MINUTES,
  computeVolumeZScoreDecision,
} from "../../domain/anomaly/zscore-math";
import type { AnomalyDetectionResult } from "./types";

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

/**
 * P1 FR-09: dakika bazlı toplam hacim Z-skoru; anomali satırına örnek `exemplar_event_id` eklenir (PDF §3.3 drill-down).
 */
export async function detectAndPersistVolumeAnomaly(
  pool: Pool,
): Promise<AnomalyDetectionResult> {
  const client = await pool.connect();
  try {
    const meta = await client.query<{ eval_start: Date }>(
      `SELECT date_trunc('minute', NOW()) - INTERVAL '1 minute' AS eval_start`,
    );
    const evalStart = meta.rows[0]?.eval_start;
    if (!evalStart) {
      throw new Error("eval_start_missing");
    }

    const baseline = await client.query<{ m: Date; c: string }>(
      `
        WITH eval AS (
          SELECT date_trunc('minute', NOW()) - INTERVAL '1 minute' AS eval_start
        ),
        bounds AS (
          SELECT
            eval_start - INTERVAL '${BASELINE_MINUTES} minutes' AS b_start,
            eval_start - INTERVAL '1 minute' AS b_end
          FROM eval
        ),
        series AS (
          SELECT generate_series(b_start, b_end, INTERVAL '1 minute') AS m
          FROM bounds
        ),
        counts AS (
          SELECT date_trunc('minute', e.occurred_at) AS m, COUNT(*)::bigint AS c
          FROM events e
          CROSS JOIN eval
          CROSS JOIN bounds b
          WHERE e.occurred_at >= b.b_start
            AND e.occurred_at < eval.eval_start
          GROUP BY 1
        )
        SELECT s.m, COALESCE(c.c, 0)::text AS c
        FROM series s
        LEFT JOIN counts c ON c.m = s.m
        ORDER BY s.m ASC
      `,
    );

    const baselineCounts = baseline.rows.map((row) => Number(row.c));

    const evalCountRes = await client.query<{ c: string }>(
      `
        SELECT COUNT(*)::bigint AS c
        FROM events
        WHERE occurred_at >= $1::timestamptz
          AND occurred_at < $1::timestamptz + INTERVAL '1 minute'
      `,
      [evalStart],
    );
    const evalCount = Number(evalCountRes.rows[0]?.c ?? 0);

    const { anomaly, mean, stdDev, sigmaDistance } =
      computeVolumeZScoreDecision(evalCount, baselineCounts);

    let persisted = false;
    if (anomaly) {
      const ex = await client.query<{ id: string }>(
        `
        SELECT id::text AS id
        FROM events
        WHERE occurred_at >= $1::timestamptz
          AND occurred_at < $1::timestamptz + INTERVAL '1 minute'
        ORDER BY occurred_at DESC
        LIMIT 1
      `,
        [evalStart],
      );
      const exemplarEventId = ex.rows[0]?.id ?? null;

      const description = JSON.stringify({
        rule: "zscore_3sigma_minute_volume",
        eval_minute_start: evalStart.toISOString(),
        eval_count: evalCount,
        baseline_minutes: BASELINE_MINUTES,
        baseline_mean: round4(mean),
        baseline_stddev_sample: round4(stdDev),
        z_score_sigma: Number.isFinite(sigmaDistance)
          ? round4(sigmaDistance)
          : "inf",
        exemplar_event_id: exemplarEventId,
      });

      await client.query(
        `
          INSERT INTO anomalies (event_type, severity, detected_at, description)
          VALUES ($1, 'critical', NOW(), $2)
        `,
        [ANOMALY_EVENT_TYPE_AGGREGATE, description],
      );
      persisted = true;
    }

    return {
      anomaly,
      evalMinuteStart: evalStart.toISOString(),
      evalCount,
      baselineMean: round4(mean),
      baselineStdDev: round4(stdDev),
      sigmaDistance: Number.isFinite(sigmaDistance)
        ? round4(sigmaDistance)
        : sigmaDistance,
      persisted,
    };
  } finally {
    client.release();
  }
}
