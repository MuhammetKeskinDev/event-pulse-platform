/**
 * TimescaleDB `events` (ve isteğe bağlı `anomalies`) için örnek satırlar ekler.
 *
 * Ortam: DATABASE_URL (varsayılan docker-compose ile uyumlu local DSN)
 * - SEED_TRUNCATE_EVENTS=1 — events tablosunu temizler (dashboard sıfırdan dolar)
 * - SEED_EVENT_COUNT — eklenen event sayısı (varsayılan: 150)
 *
 * Zaman dağılımı: çoğu kayıt son ~90 dk içinde (15m/1h dashboard penceresi dolu kalsın);
 * kalanı son 48 saate yayılır (24h filtresi testi).
 *
 * Çalıştırma (proje kökü): npm run seed-db
 */

import { randomUUID } from "node:crypto";

import pg from "pg";

const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://eventpulse:eventpulse_dev@127.0.0.1:5432/eventpulse";

const EVENT_COUNT = Math.max(
  1,
  Number.parseInt(process.env.SEED_EVENT_COUNT ?? "150", 10),
);
const truncateFirst = process.env.SEED_TRUNCATE_EVENTS === "1";

const pool = new pg.Pool({ connectionString, max: 4 });

type EventRow = {
  id: string;
  event_type: string;
  occurred_at: Date;
  payload: object;
};

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

function buildPayload(eventType: string): object {
  switch (eventType) {
    case "page_view":
      return {
        session_id: `seed_${randomUUID().slice(0, 8)}`,
        page_url: "https://example.com/seed",
      };
    case "purchase":
      return {
        order_id: `seed_ord_${randomUUID().slice(0, 8)}`,
        amount: 49.99,
        currency: "USD",
      };
    case "error":
      return {
        error_code: "SEED_ERR",
        message: "seeded sample error",
        source_service: "seed-script",
      };
    default:
      return {
        component: "api",
        status: "ok",
      };
  }
}

function randomEventAt(when: Date): EventRow {
  const event_type = pick([
    "page_view",
    "page_view",
    "page_view",
    "purchase",
    "error",
    "system_health",
  ] as const);
  return {
    id: randomUUID(),
    event_type,
    occurred_at: when,
    payload: buildPayload(event_type),
  };
}

async function main(): Promise<void> {
  const client = await pool.connect();
  try {
    if (truncateFirst) {
      await client.query("TRUNCATE TABLE events");
      console.log("events tablosu TRUNCATE edildi.");
    }

    const now = Date.now();
    const rows: EventRow[] = [];
    for (let i = 0; i < EVENT_COUNT; i++) {
      const offsetMs =
        Math.random() < 0.7
          ? Math.floor(Math.random() * 90 * 60 * 1000)
          : Math.floor(Math.random() * 48 * 60 * 60 * 1000);
      rows.push(randomEventAt(new Date(now - offsetMs)));
    }
    rows.sort((a, b) => a.occurred_at.getTime() - b.occurred_at.getTime());

    const insertSql = `
      INSERT INTO events (id, event_type, occurred_at, payload, source, metadata)
      VALUES ($1, $2, $3, $4::jsonb, $5, $6::jsonb)
    `;

    for (const row of rows) {
      await client.query(insertSql, [
        row.id,
        row.event_type,
        row.occurred_at,
        JSON.stringify(row.payload),
        "seed_script",
        JSON.stringify({ seeded: true }),
      ]);
    }

    console.log(`${rows.length} event eklendi.`);

    await client.query(
      `
        INSERT INTO anomalies (event_type, severity, description)
        VALUES ($1, 'medium', $2)
      `,
      [
        "*",
        JSON.stringify({
          rule: "seed_demo",
          note: "Örnek anomali satırı — load-gen / gerçek job ile karıştırmamak için severity medium.",
        }),
      ],
    );
    console.log("1 örnek anomalies satırı eklendi (event_type='*').");
  } finally {
    client.release();
    await pool.end();
  }
}

void main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
