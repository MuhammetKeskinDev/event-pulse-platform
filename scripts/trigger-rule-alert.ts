/**
 * Active Alerts panelini doldurmak için: özel bir `event_match` kuralı ekler (API) ve
 * bu kurala uyan bir `system_health` olayı ingestion’a gönderir. Worker kuralı değerlendirir,
 * Redis → WebSocket → `rule_triggered` mesajı dashboard’a düşer.
 *
 * Önkoşullar: API (3000) + Redis + TimescaleDB + **worker** çalışıyor olmalı.
 *
 * Ortam:
 * - API_BASE (varsayılan http://127.0.0.1:3000)
 * - RULE_CACHE_WAIT_MS — kural oluşturduktan sonra bekleme (worker önbelleği; varsayılan 3500).
 *   Yerel worker’da ALERT_RULES_CACHE_TTL_MS ayarlı değilse 32000 verin.
 *
 * Çalıştırma (proje kökü): npm run trigger-rule-alert
 */

const API_BASE = (process.env.API_BASE ?? "http://127.0.0.1:3000").replace(
  /\/$/,
  "",
);

const RULE_NAME = "Active panel demo (system_health probe)";
const DEMO_COMPONENT = "active_alert_demo";

const RULE_CACHE_WAIT_MS = Math.max(
  0,
  Number.parseInt(process.env.RULE_CACHE_WAIT_MS ?? "3500", 10) || 3500,
);

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main(): Promise<void> {
  const listRes = await fetch(`${API_BASE}/api/v1/rules`);
  if (listRes.ok) {
    const data = (await listRes.json()) as { items?: { name: string }[] };
    const exists = data.items?.some((i) => i.name === RULE_NAME);
    if (exists) {
      console.log("Demo kuralı zaten var; yalnızca olay gönderiliyor.");
    } else {
      const ruleBody = {
        name: RULE_NAME,
        enabled: true,
        definition: {
          condition: {
            kind: "event_match",
            event_types: ["system_health"],
            payload_match: { component: DEMO_COMPONENT },
          },
          cooldown_seconds: 0,
          severity: "warning",
        },
        channel_hint: "email_stub",
      };

      console.log(`→ POST ${API_BASE}/api/v1/rules (demo kuralı)`);
      const ruleRes = await fetch(`${API_BASE}/api/v1/rules`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(ruleBody),
      });
      if (!ruleRes.ok) {
        const t = await ruleRes.text();
        console.error(`Kural oluşturulamadı: HTTP ${ruleRes.status}`, t);
        process.exitCode = 1;
        return;
      }
      console.log("  Kural kaydedildi.");
      if (RULE_CACHE_WAIT_MS > 0) {
        console.log(
          `  Worker kural önbelleği için ${RULE_CACHE_WAIT_MS} ms bekleniyor (RULE_CACHE_WAIT_MS).`,
        );
        await sleep(RULE_CACHE_WAIT_MS);
      }
    }
  } else {
    console.error("Kural listesi alınamadı; API ayakta mı?");
    process.exitCode = 1;
    return;
  }

  const occurred = new Date().toISOString();
  const eventBody = {
    event_type: "system_health" as const,
    source: "seed_script",
    timestamp: occurred,
    payload: {
      component: DEMO_COMPONENT,
      status: "degraded" as const,
      details: "trigger-rule-alert.ts — Active Alerts paneli için örnek tetikleme",
    },
  };

  console.log(`→ POST ${API_BASE}/api/v1/events`);
  const evRes = await fetch(`${API_BASE}/api/v1/events`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(eventBody),
  });
  const evText = await evRes.text();
  if (!evRes.ok) {
    console.error(`Olay gönderilemedi: HTTP ${evRes.status}`, evText);
    process.exitCode = 1;
    return;
  }
  console.log("  202 Accepted:", evText);
  console.log("");
  console.log(
    "Dashboard’da WebSocket açıksa birkaç saniye içinde Active alerts + toast görünmeli.",
  );
}

void main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
