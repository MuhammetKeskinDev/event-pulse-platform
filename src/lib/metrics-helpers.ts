export const METRICS_CACHE_MAX_AGE_SEC = 10;

export function toBigIntString(value: unknown): bigint {
  if (typeof value === "bigint") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return BigInt(Math.trunc(value));
  }
  if (typeof value === "string" && value.length > 0) {
    return BigInt(value);
  }
  return 0n;
}

export function errorRatePercent(errors: bigint, total: bigint): number {
  if (total === 0n) {
    return 0;
  }
  const pct = (Number(errors) / Number(total)) * 100;
  return Math.round(pct * 100) / 100;
}

export function parseIsoOr(raw: string | undefined, fallback: Date): Date {
  if (raw === undefined || raw.length === 0) {
    return fallback;
  }
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? fallback : d;
}

/**
 * Tüm kova aralıklarını doldurur (0 sayım). Anahtarlar SQL ile aynı: epoch saniye (bigint),
 * float/Date yuvarlama kayması yüzünden gerçek sayımlar kaybolmasın.
 */
export function denseThroughputBuckets(
  sparse: Map<number, { counts: Record<string, number> }>,
  windowStartSec: number,
  windowEndSec: number,
  bucketWidthSec: number,
  eventTypeFilter: string | null,
): Array<{ bucket_start: string; counts: Record<string, number> }> {
  const firstBucket =
    Math.floor(windowStartSec / bucketWidthSec) * bucketWidthSec;
  const lastBucket =
    Math.floor(windowEndSec / bucketWidthSec) * bucketWidthSec;

  const allTypes = new Set<string>();
  if (eventTypeFilter !== null && eventTypeFilter.length > 0) {
    allTypes.add(eventTypeFilter);
  } else {
    for (const b of sparse.values()) {
      for (const k of Object.keys(b.counts)) {
        allTypes.add(k);
      }
    }
  }

  for (let t = firstBucket; t <= lastBucket; t += bucketWidthSec) {
    if (!sparse.has(t)) {
      sparse.set(t, { counts: {} });
    }
  }

  const out: Array<{ bucket_start: string; counts: Record<string, number> }> =
    [];
  for (let t = firstBucket; t <= lastBucket; t += bucketWidthSec) {
    const b = sparse.get(t);
    if (b === undefined) {
      continue;
    }
    const counts: Record<string, number> = { ...b.counts };
    for (const typ of allTypes) {
      if (counts[typ] === undefined) {
        counts[typ] = 0;
      }
    }
    out.push({
      bucket_start: new Date(t * 1000).toISOString(),
      counts,
    });
  }
  return out;
}
