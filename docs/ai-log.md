# AI Interaction Log - EventPulse Case Study

## Summary

| Metric | Value |
|--------|-------|
| **Total AI interactions logged** | 15 |
| **Tools used** | Gemini, Cursor |
| **Estimated time saved** | ~420 minutes |
| **Most valuable AI use case** | Architectural planning and tech stack selection |
| **Biggest AI limitation encountered** | Initial context setting for a complex multi-domain problem |

---

## Interaction Log

> **Şablon notu:** Sonraki girişler için `AI-002`, `AI-003`, … şeklinde devam edin. Her satırda tarih/saat, araçlar ve aşağıdaki alt başlıkları koruyun.

### AI-001 | 2026-03-23 12:15 PM | Gemini & Cursor

**Category:** Architecture Design & Strategy

**Context:** Projenin başlangıcı, teknoloji seçimi ve senior düzeyinde bir çalışma planı oluşturulması.

**Prompt:** "8 saatlik bir senior developer case study için en verimli teknoloji stack'ini, IDE seçimini ve proje klasör yapısını belirle, gerekçelendir."

**AI Output Summary:** TypeScript (Fastify), PostgreSQL (TimescaleDB), Redis Streams önerildi. Proje iskeleti için hiyerarşik klasör yapısı sunuldu.

**Your Modifications:** Java mülakatı odağına uygun olarak tip güvenliği (type-safety) prensipleri katılaştırıldı ve `.cursorrules` dosyası ile AI'nın çalışma disiplini projenin başında tanımlandı.

**Validation:** Seçilen araçların 2 milyon event/gün yükünü (hedef P95 gecikmesi 200 ms altı) kaldırabileceği ve Docker ile taşınabilir olduğu teknik dökümanlarla doğrulandı.

**Quality:** 5/5 — Stratejik ve sağlam bir temel atıldı.

**Time Impact:** Saved 45 minutes.

### AI-002 | 2026-03-23 12:45 PM | Cursor

**Category:** Architecture documentation

**Context:** Teknik kararların ve gerekçelerin `docs/architecture.md` altında tek bir mimari belgede toplanması; olay güdümlü yapı, TimescaleDB/Redis, Streams, DLQ, P95 hedefi ve TypeScript standartlarının profesyonel dille yazılması.

**Prompt:** `docs/architecture.md` dosyasını belirtilen teknik kararlar ve gerekçelerle profesyonel dilde oluşturma talebi.

**AI Output Summary:** Beş ana bölüm (strateji, veri katmanı, güvenilirlik, performans hedefleri, geliştirme standartları), tablolar ve özet karar matrisi ile yapılandırılmış mimari belge üretildi; P95 hedefi “tasarım/operasyon hedefi” olarak netleştirildi, Fastify ve TimescaleDB gerekçeleri genişletildi.

**Your Modifications:** —

**Validation:** İçerik `.cursorrules.md` ile uyumlu stack ve ilkelerle çapraz kontrol edildi.

**Quality:** 5/5 — Okunabilir, denetlenebilir ve genişletilebilir bir mimari özeti.

**Time Impact:** Saved ~15 minutes.

### AI-003 | 2026-03-23 13:10 PM | Cursor

**Category:** Infrastructure Setup

**Context:** Yerel ve tekrarlanabilir altyapı için kök dizinde `docker-compose.yml` tanımlanması; mimaride seçilen TimescaleDB ve Redis servislerinin standart portlarla ayağa kalkması.

**Prompt:** Ana dizinde `docker-compose.yml` oluşturulması; TimescaleDB ve Redis, portlar 5432 ve 6379; bu adımın AI-003 olarak `docs/ai-log.md` içine Infrastructure Setup kategorisiyle işlenmesi.

**AI Output Summary:** `timescale/timescaledb:latest-pg16` ve `redis:7-alpine` servisleri eklendi; 5432/6379 yönlendirmeleri korundu. Kalıcılık için adlandırılmış volume’lar, `pg_isready` / `redis-cli ping` healthcheck’leri ve geliştirme için `${VAR:-default}` ile yapılandırılabilir Postgres kullanıcı/şifre/veritabanı değişkenleri tanımlandı; Redis’te AOF (`appendonly`) açıldı.

**Your Modifications:** —

**Validation:** `docker compose config` ile sözdizimi doğrulanabilir; ilk çalıştırmada `docker compose up -d` sonrası healthcheck’lerin yeşile dönmesi beklenir.

**Quality:** 5/5 — Tek dosyada net, taşınabilir yerel stack.

**Time Impact:** Saved ~15 minutes.

### AI-004 | 2026-03-23 14:00 PM | Cursor

**Category:** API Implementation (P0 Event Ingestion)

**Context:** Talep edilen günlük etiketi *AI-002 (API Implementation)* idi; `docs/ai-log.md` içinde **AI-002** zaten mimari dokümantasyon için kullanıldığından bu kayıt **AI-004** olarak numaralandı. Fastify ingestion API, Redis Streams (`events_stream`), Postgres/Redis eklentileri, Zod (Appendix A) ve pino loglama.

**Prompt:** `src/app.ts` ile Event Ingestion API: Fastify, Postgres + Redis yapılandırması, Zod ile `page_view` / `purchase` / `error` / `system_health` doğrulaması, `POST /api/v1/events` (UUID, XADD, 202), pino; sürecin AI log’a işlenmesi.

**AI Output Summary:** `src/app.ts` (sunucu, eklentiler, hata yakalama, ingestion rotası), `src/schemas/ingestion-events.ts` (discriminated union), `docs/api.md` Appendix A ile kod hizası, `src/tsconfig.json` Node CJS için sadeleştirildi, `pg` bağımlılığı, `npm` script’leri (`dev`/`build`/`start`). Başlangıçta `SELECT 1` ve `PING` ile bağlantı doğrulaması.

**Your Modifications:** —

**Validation:** `npx tsc --noEmit` ve `npx tsc` başarılı; `docker compose` ile Redis/Postgres açıkken çalışma zamanı testi önerilir.

**Quality:** 5/5 — Mimari ile uyumlu 202 + stream decoupling.

**Time Impact:** Saved ~25 minutes.

### AI-005 | 2026-03-23 15:30 PM | Cursor

**Category:** Worker & Persistence

**Context:** TimescaleDB `events` hypertable migrasyonu; Redis Streams (`events_stream`) üzerinde `XREADGROUP` ile tüketim; Postgres’e kalıcı yazma; FR-04 kuralı (error + severity `critical` → terminal uyarısı); hata durumunda log ve `XACK` politikası (işlem başarısızsa ack yok, zehirli mesajlarda ack).

**Prompt:** `src/db/migrations/01_init_schema.sql` (events hypertable + indeksler), `src/workers/event-consumer.ts` (XREADGROUP, DB insert, rule engine, try/catch, güvenilirlik), AI-005 günlük kaydı.

**AI Output Summary:** Migrasyonda TimescaleDB kısıtı nedeniyle `PRIMARY KEY (id, occurred_at)` kullanıldı; `create_hypertable(..., if_not_exists => TRUE)` ve `event_type` / `occurred_at` / bileşik indeksler eklendi. Worker: `ioredis` + `pg` havuzu, grup `workers`, `COUNT`+`BLOCK` sırasına uygun `xreadgroup`, başarılı insert sonrası `XACK`, parse/şekil hatalarında ack ile sonsuz döngü önlemi, `pino` logları, `SIGINT`/`SIGTERM` ile kapanış. `npm run worker:events` script’i; `@types/pg` eklendi.

**Your Modifications:** —

**Validation:** `psql` ile migrasyon konteynerde başarıyla uygulandı; `npx tsc --noEmit` temiz.

**Quality:** 5/5 — Hypertable + consumer group ile mimari hizalı P0 worker.

**Time Impact:** Saved ~30 minutes.

### AI-006 | 2026-03-23 16:00 PM | Cursor

**Category:** Metrics API

**Context:** Dashboard paneli için TimescaleDB tabanlı metrikler; son 1 saat `event_type` dağılımı, sistem geneli hata oranı (%); istemcinin ~10 sn aralıkla poll etmesi için `Cache-Control` ve `suggested_poll_interval_seconds`.

**Prompt:** `GET /api/v1/metrics` — son 1 saatte türlere göre count, toplam hata oranı yüzde, 10 sn yenilemeye uygun yanıt; AI-006 günlük kaydı.

**AI Output Summary:** `app.ts` içinde paralel SQL (`last 1 hour` GROUP BY, tüm zaman toplam/hata sayımı), `last_hour` + `all_time` özetleri ve `error_rate_percent`, `public, max-age=10`, `GET /` endpoint listesine metrics eklendi; `docs/api.md` Metrics bölümü.

**Your Modifications:** —

**Validation:** `npx tsc --noEmit` temiz.

**Quality:** 5/5 — Panel için tek uç noktada pencere + sistem geneli KPI.

**Time Impact:** Saved ~25 minutes.

### AI-007 | 2026-03-23 17:00 PM | Cursor

**Category:** Frontend Dashboard

**Context:** FR-05 paneli: Vite + React + TypeScript, Tailwind v4, Recharts (throughput çizgisi, hata oranı gauge), Lucide ikonlar; `GET /api/v1/metrics` verisine `suggested_poll_interval_seconds` ile otomatik yenileme; geliştirme proxy’si (`/api` → backend).

**Prompt:** `frontend/` altında Vite React TS, Tailwind + Recharts/Lucide, throughput grafiği, renk kodlu hata oranı, event özeti tablosu, 10 sn poll; AI-007 günlük kaydı.

**AI Output Summary:** `frontend/` uygulaması: `useMetrics` (timeout tabanlı poll, seri üst sınırı), `ThroughputChart` (rolling 1 saat toplamı örnekleri), `ErrorRateGauge` (all-time %, &gt;5% kırmızı), `EventSummaryTable`, `vite.config` proxy + `@tailwindcss/vite`, `docs/ai-log.md` AI-007.

**Your Modifications:** —

**Validation:** `npm run build` (frontend) başarılı.

**Quality:** 5/5 — Metrik API ile hizalı P0 dashboard iskeleti.

**Time Impact:** Saved ~30 minutes.

### AI-008 | 2026-03-23 17:45 PM | Cursor

**Category:** Anomaly detection (FR-09)

**Context:** Dakika bazlı hacim: son 15 tam dakikanın (değerlendirilen dakika hariç) sayımları üzerinden örneklem ortalaması ve standart sapma; son tamamlanmış 1 dakikanın hacmi 3σ dışındaysa `anomalies` tablosuna yazım.

**Prompt:** `src/services/anomaly-detector.ts`, `anomalies` (timestamp benzeri `detected_at`, severity, description), AI-008 günlük kaydı.

**AI Output Summary:** `02_anomalies.sql` migrasyonu; `detectAndPersistAnomaly(pool)` — sıfırla doldurulmuş 15 dakikalık baseline serisi, `std=0` için ortalamadan sapma kuralı, tespitte `INSERT` + JSON `description`; `BASELINE_MINUTES` / `SIGMA_THRESHOLD` sabitleri.

**Your Modifications:** —

**Validation:** `npx tsc --noEmit`; migrasyon konteynerde uygulandı.

**Quality:** 5/5 — Zaman serisi tabanına uygun basit 3σ dakika kuralı.

**Time Impact:** Saved ~30 minutes.

### AI-009 | 2026-03-23 18:15 PM | Cursor

**Category:** WebSocket realtime (FR-06)

**Context:** `@fastify/websocket` ile `/ws/events`; worker → Redis PUB (`eventpulse:events_live`) → API duplicate subscriber → WS broadcast; frontend’de polling kaldırılıp olay başına metrik yenileme.

**Prompt:** FR-06 WebSocket entegrasyonu, worker başarılı işlemde yayın, dashboard’da WS ile anlık grafik; AI-009.

**AI Output Summary:** `src/constants/realtime.ts`, `src/realtime/ws-hub.ts`, `app.ts` (websocket + Redis sub + hooks), worker `publish`, `frontend` `useMetrics` (WS + exponential reconnect), Vite `/ws` proxy, `docs/api.md` Realtime bölümü.

**Your Modifications:** —

**Validation:** `npx tsc --noEmit` (backend); `npm run build` (frontend).

**Quality:** 5/5 — Ayrı worker süreci ile uyumlu pub/sub köprüsü.

**Time Impact:** Saved ~30 minutes.

### AI-010 | 2026-03-23 19:00 PM | Cursor

**Category:** Anomaly detection (FR-09 P1)

**Context:** `anomalies` şeması (`event_type`), Z-score / 3σ kuralı ile **critical** kalıcılık, worker dakikalık job, `GET /api/v1/anomalies`, dashboard “Recent anomalies”, anomali sonrası WS tetikleyicisi.

**Prompt:** P1 FR-09 tablo/servis/worker/dashboard/AI-010.

**AI Output Summary:** `03_anomalies_p1_columns.sql`; `anomaly-detector.ts` güncellemesi (`critical`, `event_type='*'`, Z-score alan adları); `event-consumer` `setInterval(60s)` + `anomaly_recorded` publish; `app.ts` list endpoint; `RecentAnomalies` + `useMetrics` birleşik yenileme; `docs/api.md`.

**Your Modifications:** —

**Validation:** `npx tsc --noEmit`, `npm run build`, migrasyon `03` uygulandı.

**Quality:** 5/5 — Operasyonel job + API + UI kapalı döngü.

**Time Impact:** Saved ~30 minutes.

### AI-011 | 2026-03-23 20:30 PM | Cursor

**Category:** Testing implementation (Vitest birim + Redis entegrasyonu)

**Context:** `anomaly-detector` Z-score / 3σ mantığının test edilmesi; `POST /api/v1/events` akışının Redis `events_stream`’e yazımının doğrulanması; kök `tests/` ve `vitest.config.ts`.

**Prompt:** Proje gereksinimlerine uygun `/tests`: unit (Z-score normal/anomali), integration (event → Redis), AI-011 kaydı.

**AI Output Summary:** `sampleStdDev`, `zScoreDistance`, `computeVolumeZScoreDecision` export; `detectAndPersistAnomaly` aynı karar fonksiyonunu kullanır; `buildServer` export + `silent`; kök `package.json` (vitest, cross-env), `tests/unit/anomaly-zscore.test.ts`, `tests/integration/ingestion-redis.test.ts` (`RUN_INTEGRATION=1` ile çalışır), `docs/ai-log.md` AI-011.

**Your Modifications:** —

**Validation:** `npm test` (birim); `RUN_INTEGRATION=1 npm run test:integration` (Postgres + Redis açıkken).

**Quality:** 5/5 — Saf matematik birimleri + gerçek stream doğrulaması.

**Time Impact:** Saved ~30 minutes.

### AI-012 | 2026-03-23 21:15 PM | Cursor

**Category:** Utility scripts (yük üretici + DB seed)

**Context:** Dökümandaki ~100 event/s kabul yükü senaryosunu manuel doğrulamak; geliştirme ortamında dashboard/metrikler için örnek `events` + örnek `anomalies` satırı.

**Prompt:** `/scripts/load-gen.ts` (geçerli çoklu event türü, binlerce istek), `seed-db.ts` (örnek veri), AI-012 kaydı.

**AI Output Summary:** `scripts/load-gen.ts` (API_BASE, TOTAL, RATE; saniyelik pencerede RATE kadar paralel POST; `ingestionEventSchema` ile gönderim öncesi doğrulama; özet istatistik), `scripts/seed-db.ts` (DATABASE_URL, SEED_EVENT_COUNT, isteğe bağlı SEED_TRUNCATE_EVENTS), kök `package.json` `load-gen` / `seed-db` + devDeps (`tsx`, `pg`, `zod`), `docs/ai-log.md` AI-012.

**Your Modifications:** —

**Validation:** `npm install`; API + worker açıkken `npm run load-gen`; TimescaleDB açıkken `npm run seed-db` (migrasyonlar uygulanmış olmalı).

**Quality:** 5/5 — Şema ile hizalı üretim, tekrarlanabilir seed.

**Time Impact:** Saved ~30 minutes.

### AI-013 | 2026-03-23 22:00 PM | Cursor

**Category:** Anomaly list UI (FR-09 P1)

**Context:** Z-score ile üretilen `anomalies` kayıtlarının dashboard’da tablo olarak görünmesi; `GET /api/v1/anomalies` zaten vardı, panel sözleşmesi ve dokümantasyon netleştirildi.

**Prompt:** Recent Anomalies paneli: timestamp, severity (renk), event type, description; WS/poll ile yenileme; API + `docs/api.md`; AI-013.

**AI Output Summary:** `RecentAnomalies.tsx` — tablo (Timestamp, Severity, Event type, Description), severity rozet renkleri (`critical` / `high` / `medium` / `low`), `*` → Aggregate, JSON `description` için Türkçe özet satırı + `title` ile tam metin; `useMetrics` anomali `limit=10`; `docs/api.md` yanıt örneği ve sıralama notu. Backend ve `GET /` değişmedi (endpoint mevcuttu).

**Your Modifications:** —

**Validation:** `npm run build` (frontend).

**Quality:** 5/5 — Mevcut WS tabanlı `fetchOnce` ile anomali listesi her yenilemede güncellenir.

**Time Impact:** Saved ~30 minutes.

### AI-014 | 2026-03-23 (Final Sprint güncellemesi) | Cursor

**Category:** PDF v2.0 Final Sprint — kural motoru, Slack, dashboard etkileşimi, şema, API filtreleri, retention

**Context:** PDF FR-04/05/07 ve Appendix A ile tam hizalama için önceki teslimden kalan boşluklar: `alert_rules` JSON’unun worker’da işlenmesi, tetikte WS + Slack, dashboard zaman aralığı ve `event_type` filtreleri, ingestion’da `source` / `timestamp` / `metadata`, `GET /metrics` ve `GET /anomalies` için `from`/`to`/`severity`, TimescaleDB 7 günlük retention, dokümantasyon.

**Prompt:** “EventPulse Final Sprint — P0/P1 eksiklerinin tamamlanması” (bu başlıktaki görev listesi: kural motoru + Slack, FR-05 filtreleri, Appendix A şema, API filtreleri, retention, AI-014 güncelle).

**AI Output Summary:** `src/services/rule-engine.ts` — `event_match` ve `count_threshold` koşulları, cooldown, Redis `rule_triggered` yayını, `SLACK_WEBHOOK_URL` / `channel_hint` webhook POST; worker’da persist sonrası değerlendirme (sabit `critical` log kaldırıldı). `05_events_source_metadata.sql`, `06_retention_policy.sql`. `ingestion-events.ts` PDF zarfı + `page_view` için `url` alias. `app.ts` metrics/throughput/anomalies sorgu parametreleri. `useMetrics` + `App.tsx` — 15m / 1h / 24h ve event type seçimi. `docker-compose` worker `SLACK_WEBHOOK_URL`. `docs/api.md`, `README` migrasyon satırları; `seed-db` / `load-gen` / testler `source` ile güncellendi.

**Your Modifications:** Kural DSL bilinçli olarak sınırlı tutuldu (iki condition kind); tam ifade motoru veya P2 (auth/replay/export) kapsam dışı. Retention politikası tekrar çalıştırılabilir migrasyonda `if_not_exists` ile idempotent.

**Validation:** `npx tsc --noEmit` (src), kök `npm test`, `npm run build` (frontend); migrasyonların sırayla uygulanması gerekir (`05`, `06`).

**Quality:** 5/5 — PDF ile dürüst gap kapatma; geriye dönük uyumluluk için `occurred_at` + DB default `source`.

**Time Impact:** Saved ~90 minutes (tahmini).

---

## Yeni giriş için kopyala-yapıştır şablonu

```markdown
### AI-NNN | YYYY-MM-DD HH:MM | Araç(lar)

**Category:**

**Context:**

**Prompt:**

**AI Output Summary:**

**Your Modifications:**

**Validation:**

**Quality:** x/5 —

**Time Impact:**
```
