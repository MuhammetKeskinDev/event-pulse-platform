import type { Pool } from "pg";

const BASELINE_MINUTES = 15;
const SIGMA_THRESHOLD = 3;

export interface AnomalyDetectionResult {
  readonly anomaly: boolean;
  readonly evalMinuteStart: string;
  readonly evalCount: number;
  readonly baselineMean: number;
  readonly baselineStdDev: number;
  readonly sigmaDistance: number;
  readonly persisted: boolean;
}

function sampleStdDev(values: readonly number[]): number {
  const n = values.length;
  if (n < 2) {
    return 0;
  }
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance =
    values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (n - 1);
  return Math.sqrt(variance);
}

function isAnomaly(
  evalCount: number,
  mean: number,
  stdDev: number,
): { anomaly: boolean; sigmaDistance: number } {
  if (stdDev === 0) {
    return {
      anomaly: evalCount !== mean,
      sigmaDistance: mean === 0 && evalCount === 0 ? 0 : Number.POSITIVE_INFINITY,
    };
  }
  const sigmaDistance = Math.abs(evalCount - mean) / stdDev;
  return {
    anomaly: sigmaDistance > SIGMA_THRESHOLD,
    sigmaDistance,
  };
}

/**
 * FR-09: Son 15 dakikanın dakika bazlı sayımları üzerinden ortalama ve örneklem
 * standart sapması; son tamamlanmış 1 dakikanın hacmi 3σ dışındaysa anomali kaydı.
 * Periyodik olarak (cron / worker) çağrılmak üzere tasarlandı.
 */
export async function detectAndPersistAnomaly(
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
    const mean =
      baselineCounts.length > 0
        ? baselineCounts.reduce((a, b) => a + b, 0) / baselineCounts.length
        : 0;
    const stdDev = sampleStdDev(baselineCounts);

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

    const { anomaly, sigmaDistance } = isAnomaly(evalCount, mean, stdDev);

    let persisted = false;
    if (anomaly) {
      const description = JSON.stringify({
        rule: "3sigma_minute_volume",
        eval_minute_start: evalStart.toISOString(),
        eval_count: evalCount,
        baseline_minutes: BASELINE_MINUTES,
        baseline_mean: round4(mean),
        baseline_stddev_sample: round4(stdDev),
        sigma_distance: Number.isFinite(sigmaDistance)
          ? round4(sigmaDistance)
          : "inf",
      });

      await client.query(
        `
          INSERT INTO anomalies (detected_at, severity, description)
          VALUES (NOW(), $1, $2)
        `,
        ["high", description],
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

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}
