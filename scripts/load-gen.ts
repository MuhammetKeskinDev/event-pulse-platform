/**
 * Ingestion yük üretici: dökümandaki ~100 event/s hedefini doğrulamak için kullanılır.
 *
 * Ortam değişkenleri:
 * - API_BASE — örn. http://127.0.0.1:3000 (sonunda / olmadan)
 * - TOTAL — gönderilecek toplam istek (varsayılan: 5000)
 * - RATE — saniye başına hedef istek sayısı (varsayılan: 100)
 *
 * Çalıştırma (proje kökü): npm run load-gen
 */

import { randomUUID } from "node:crypto";

import { ingestionEventSchema } from "../src/schemas/ingestion-events";

const API_BASE = (process.env.API_BASE ?? "http://127.0.0.1:3000").replace(
  /\/$/,
  "",
);
const TOTAL = Math.max(1, Number.parseInt(process.env.TOTAL ?? "5000", 10));
const RATE = Math.max(1, Number.parseInt(process.env.RATE ?? "100", 10));

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function isoRecentMs(maxAgeMs: number): string {
  return new Date(Date.now() - Math.floor(Math.random() * maxAgeMs)).toISOString();
}

function buildRandomEvent(): unknown {
  const kind = pick(["page_view", "purchase", "error", "system_health"] as const);

  switch (kind) {
    case "page_view":
      return {
        event_type: "page_view",
        source: "web_app",
        occurred_at: isoRecentMs(3_600_000),
        payload: {
          session_id: `sess_${randomUUID().slice(0, 8)}`,
          page_url: `https://example.com/${pick(["/", "/pricing", "/blog", "/p/", "/cart"])}${randInt(1, 9999)}`,
          ...(Math.random() > 0.55
            ? { referrer: "https://www.google.com/" }
            : {}),
          ...(Math.random() > 0.4 ? { user_id: `u_${randomUUID().slice(0, 8)}` } : {}),
        },
      };
    case "purchase":
      return {
        event_type: "purchase",
        occurred_at: isoRecentMs(86_400_000),
        payload: {
          order_id: `ord_${randomUUID().slice(0, 12)}`,
          amount: Number((Math.random() * 500 + 9.99).toFixed(2)),
          currency: pick(["USD", "EUR", "TRY", "GBP"] as const),
          ...(Math.random() > 0.65
            ? {
                line_items: [
                  {
                    product_id: `sku_${randInt(100, 999)}`,
                    quantity: randInt(1, 5),
                    unit_price: Number((Math.random() * 80 + 5).toFixed(2)),
                  },
                ],
              }
            : {}),
          ...(Math.random() > 0.5 ? { user_id: `u_${randomUUID().slice(0, 8)}` } : {}),
        },
      };
    case "error":
      return {
        event_type: "error",
        source: "payment_service",
        occurred_at: isoRecentMs(1_800_000),
        payload: {
          error_code: pick(["E_TIMEOUT", "E_DB", "E_AUTH", "E_RATE", "E_UNK"] as const),
          message: pick([
            "upstream timeout",
            "connection reset",
            "invalid token",
            "quota exceeded",
          ] as const),
          source_service: pick(["api-gateway", "checkout", "search", "auth"] as const),
          ...(Math.random() > 0.6
            ? { severity: pick(["low", "medium", "high", "critical"] as const) }
            : {}),
          ...(Math.random() > 0.7
            ? { correlation_id: randomUUID() }
            : {}),
        },
      };
    default:
      return {
        event_type: "system_health",
        source: "api_gateway",
        occurred_at: isoRecentMs(600_000),
        payload: {
          component: pick(["redis", "postgres", "worker", "api"] as const),
          status: pick(["ok", "degraded", "down"] as const),
          ...(Math.random() > 0.5 ? { details: "synthetic load-gen probe" } : {}),
          ...(Math.random() > 0.75
            ? {
                metric_snapshot: {
                  latency_ms: randInt(5, 200),
                  queue_depth: randInt(0, 50),
                },
              }
            : {}),
        },
      };
  }
}

async function postOne(): Promise<{ ok: boolean; ms: number; status: number }> {
  const raw = buildRandomEvent();
  const body = ingestionEventSchema.parse(raw);
  const t0 = performance.now();
  const res = await fetch(`${API_BASE}/api/v1/events`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const ms = performance.now() - t0;
  return { ok: res.ok, ms, status: res.status };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main(): Promise<void> {
  console.log(
    `load-gen → ${API_BASE} | total=${TOTAL} | target_rate=${RATE}/s (Appendix A şemaları, Zod doğrulamalı)`,
  );

  let accepted = 0;
  let failed = 0;
  let sumMs = 0;
  let latencySamples = 0;
  const latenciesMs: number[] = [];
  const tStart = Date.now();

  const windows = Math.ceil(TOTAL / RATE);
  let sent = 0;

  for (let w = 0; w < windows; w++) {
    const windowStart = Date.now();
    const n = Math.min(RATE, TOTAL - sent);
    const batch = await Promise.allSettled(Array.from({ length: n }, () => postOne()));
    for (const r of batch) {
      if (r.status === "fulfilled") {
        sumMs += r.value.ms;
        latencySamples += 1;
        latenciesMs.push(r.value.ms);
        if (r.value.ok) {
          accepted += 1;
        } else {
          failed += 1;
        }
      } else {
        failed += 1;
      }
    }
    sent += n;
    const elapsed = Date.now() - windowStart;
    if (elapsed < 1000) {
      await sleep(1000 - elapsed);
    }
  }

  const durationSec = (Date.now() - tStart) / 1000;
  const achieved = TOTAL / durationSec;
  const avgMs = latencySamples > 0 ? sumMs / latencySamples : 0;

  latenciesMs.sort((a, b) => a - b);
  /** PDF §2.3 NFR: p95 latency under load — nearest-rank on sorted samples */
  function percentileP95(sorted: number[]): number {
    const n = sorted.length;
    if (n === 0) {
      return 0;
    }
    const rank = Math.ceil(0.95 * n) - 1;
    return sorted[Math.max(0, Math.min(n - 1, rank))]!;
  }
  const p95Ms = percentileP95(latenciesMs);

  console.log("— özet —");
  console.log(`süre: ${durationSec.toFixed(2)} s | başarılı (202): ${accepted} | başarısız: ${failed}`);
  console.log(
    `gerçekleşen ort. hız: ${achieved.toFixed(1)} evt/s | yanıt süresi ort. ${avgMs.toFixed(1)} ms | p95 ${p95Ms.toFixed(1)} ms (PDF §2.3)`,
  );
  if (failed > 0) {
    process.exitCode = 1;
  }
}

void main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
