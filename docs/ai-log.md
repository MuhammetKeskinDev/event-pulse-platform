# AI Interaction Log - EventPulse Case Study

Bu günlüğü **disiplin için** tutuyorum: AI ile çalışırken bazen her şey hızlı ilerliyor; birkaç gün sonra “bu kararı neden böyle aldık?” sorusuna tek dosyadan cevap vermek istiyorum. Özeti tabloda, ayrıntıyı her `AI-NNN` başlığında birlikte bırakıyorum — bazen “Your Modifications” satırına kendi düzeltmemi not düşüyorum.

## Summary

| Metric | Value |
|--------|-------|
| **Total AI interactions logged** | 20 |
| **Tools used** | Gemini, Cursor |
| **Estimated time saved** | ~510 minutes |
| **Most valuable AI use case** | Architectural planning and tech stack selection |
| **Biggest AI limitation encountered** | Initial context setting for a complex multi-domain problem |

---

## Interaction Log

> **Şablon notu:** Sonraki girişler için `AI-002`, `AI-003`, … şeklinde devam edin. Her satırda tarih/saat, araçlar ve aşağıdaki alt başlıkları koruyun.

### AI-001 | 2026-03-23 12:15 PM | Gemini & Cursor

**Category:** Architecture Design & Strategy

**Context:** Projenin başlangıcı, teknoloji seçimi ve senior düzeyinde bir çalışma planı oluşturulması.

**Prompt:** " bir senior developer case study için en verimli teknoloji stack'ini, IDE seçimini ve proje klasör yapısını belirle, gerekçelendir."

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

### AI-015 | 2026-03-23 (PDF FR-05 dashboard interactivity) | Cursor

**Category:** Code Generation / Documentation correction

**Context:** Senior case study PDF FR-05: zaman aralığında **6 saat** seçeneği; panellerde **event type**, **source** ve **severity** filtreleri. Önceki oturumda kod değişiklikleri yapıldı fakat **AI Interaction Log güncellenmedi** — kullanıcı kuralları ve PDF Bölüm 5 (“her önemli etkileşim loglanmalı”) ile çelişiyordu; bu kayıt hem özelliği hem de bu süreç hatasını belgeler.

**Prompt:** “Önce 6 numarayı yap” (checklist: `feat(dashboard): add 6h preset and source/severity filters`). Sonraki mesaj: AI log’un yazılmaması ve kuralların unutulması üzerine düzeltme talebi.

**AI Output Summary:** **Backend (`src/app.ts`):** `GET /api/v1/metrics` ve `GET /api/v1/metrics/throughput` için `source` query parametresi (`AND ($n::text IS NULL OR source = $n)`); throughput yanıtına `source_filter`. `GET /api/v1/events` için `source` filtresi ve liste öğelerinde `source` alanı. **Frontend:** `DashboardWindowPreset` genişletildi (`360` = 6h); `SourceFilterOption` ve `SeverityFilterOption`; `useMetrics` içinde metrik/throughput/feed URL’lerine `source`, anomali listesine `severity`; `App.tsx` dört seçici + filtre özeti; `LiveEventRow` / `LiveEventFeed` ile kaynak etiketi. `npm run build` (src + frontend) doğrulandı.

**Your Modifications:** Severity yalnızca **anomali API’sine** uygulanır (events tablosunda `severity` yok); throughput altında kullanıcıya kısa açıklama metni eklendi. **Süreç:** Bu değişikliklerin ilk tesliminde `docs/ai-log.md` güncellenmemişti; bilinçli düzeltme olarak AI-015 ile geriye dönük kayıt açıldı — gelecekte her anlamlı AI destekli patch sonrası log güncellemesi rutin yapılacak.

**Validation:** `src` ve `frontend` için `npm run build`; API’de `source` olmadan geriye dönük uyumluluk (opsiyonel parametre).

**Quality:** 4/5 — Özellik PDF ile hizalı; log gecikmesi disiplin açısından eksi, düzeltme ile şeffaflık sağlandı.

**Time Impact:** Saved ~25 minutes (tahmini); log atlama ~5 dakika “borç” + düzeltme maliyeti.

### AI-016 | 2026-03-23 (Backend modülerleştirme) | Cursor

**Category:** Architecture / Refactoring

**Context:** PDF ve önceki plan: `app.ts` tek dosyada ~1200 satır; “component boundaries” ve sürdürülebilirlik için route/lib ayrımı. **Davranış ve uç noktalar değişmeden** sadece dosya sınırları taşındı.

**Prompt:** “PDF’te istenen kod yapısını ve uygulama mantığını bozmadan yap” (önceki mimari planın uygulanması).

**AI Output Summary:** `src/lib/query-params.ts`, `src/lib/metrics-helpers.ts`, `src/constants/swagger-route.ts`, `src/routes/*` (root, health, metrics+throughput, anomalies, events list+by id, rules, ingestion, websocket, `stream-envelope`, `register-routes.ts`). `app.ts` yalnızca Fastify kurulumu, eklentiler, Redis subscriber hook’ları, `registerAllRoutes`, error handler ve `start()`. `buildServer` export’u korundu (`tests` uyumu).

**Your Modifications:** Route kayıt sırası orijinale yakın tutuldu (ingestion POST’lar en sonda). `enqueueEnvelope` tipine opsiyonel `source`/`metadata` eklendi (runtime zaten gönderiyordu).

**Validation:** `npm run build` (`src`), kök `npm test` (birim).

**Quality:** 5/5 — Davranış korunmuş, sınır çizgileri netleşmiş.

**Time Impact:** Saved ~25 minutes (tahmini).

### AI-017 | 2026-03-23 (Git: build çıktıları + commit hazırlığı) | Cursor

**Category:** Repository hygiene / DevOps

**Context:** `src/dist` daha önce repoya commit’lenmişti; `.gitignore` zaten `src/dist/` ve `frontend/dist/` içeriyordu. Hedef: çıktıları versiyon kontrolünden çıkarmak, yerelde/Docker/CI’de `npm run build` ile üretime devam etmek. `frontend/dist` indekste yoktu.

**Prompt:** Commit öncesi; dist klasörlerinin geçmişte commit’lendiği; AI log ve commit mesajı metni istendi.

**AI Output Summary:** `git rm -r --cached src/dist` ile backend derleme çıktıları indeksten kaldırıldı (working tree’de dosyalar kalabilir). `frontend/dist` için pathspec eşleşmedi (takipte değildi). Commit öncesi `node_modules/.vite/...` gibi ara dosyaların stage’e girmemesi için `git restore` önerisi.

**Your Modifications:** —

**Validation:** `git status` ile staged silmelerin yalnızca `src/dist/*` olduğu doğrulanmalı; gerekirse `npm run build` (`src`) ile çıktı yeniden üretilir.

**Quality:** 5/5 — Tekrarlanabilir build, repo kirlenmesi azalır.

**Time Impact:** Saved ~10 minutes (tahmini).

### AI-018 | 2026-03-23 (Clean Architecture & PDF v2.0 P0 uyumu) | Cursor

**Category:** Architecture & Compliance (PDF v2.0)

**Context:** Senior case study PDF: Clean Architecture katmanları, FR-04 pencereli kural sayımları (ör. son 5 dk hata &gt; eşik), FR-05 custom zaman aralığı ve olay detayı, NFR p95 kanıtı ve kural motoru birim test &gt;%80.

**Prompt:** “Clean Architecture Refactoring & P0 Compliance (PDF v2.0)” — `domain` / `application` / `infrastructure` / `interface`; `count_threshold` genişletmesi (`source`, `payload_match`); `tests/unit/rule-engine.test.ts` + coverage eşiği; dashboard datetime-local + anomali `exemplar_event_id` → `GET /events/:id` modal; `load-gen` p95; dokümantasyon (Architecture & Compliance).

**AI Output Summary:** **`src/domain`:** `events/stream-envelope`, `rules` (parse, payload eşleşmesi, cooldown), `anomaly/zscore-math`, `notifications/resolve-slack-webhook`. **`src/application`:** `use-cases/evaluate-alert-rules`, `anomaly-detection/run-volume-zscore`, `event-processing` (re-export), `ports/alert-rules`. **`src/infrastructure`:** Postgres kural önbelleği + pencereli sayım (JSONB `@>`), Redis publish, Slack fetch, kuyruk `enqueue-envelope`. **`src/interface/http/routes` + `register-routes`**, **`interface/ws/ws-hub`**. `services/rule-engine` ve `services/anomaly-detector` cephe olarak korundu. Anomali açıklamasına `exemplar_event_id`; `GET /api/v1/events/:id` yanıtına `source`/`metadata`. Frontend: preset/custom aralık, `EventDetailModal`, `RecentAnomalies` / `LiveEventFeed` tıklama. `npm run test:coverage` (Vitest v8) kural paketinde ~%86 satır. `scripts/load-gen.ts` p95 çıktısı.

**Your Modifications:** Kullanıcı metninde “AI-015” etiketi istenmişti; **AI-015** tarihsel olarak dashboard filtresi kaydına ait olduğundan bu sprint **AI-018** ile işlendi (çakışmayı önlemek için).

**Validation:** `src` `npm run build`; `frontend` `npm run build`; kök `npm test`, `npm run test:coverage`.

**Quality:** 5/5 — PDF P0/NFR ile hizalı, katmanlar ayrıldı.

**Time Impact:** Saved ~120 minutes (tahmini).

### AI-019 | 2026-03-23 (FR-12 export + UI hizalama) | Cursor

**Category:** Feature delivery (FR-12) & dashboard polish

**Context:** PDF FR-12: yapılandırılabilir zaman aralığı ile olayların CSV/PDF dışa aktarımı; dashboard filtre çubuğunda export paneli; canlı akışta genişletilebilir payload (PDF §3.3). Önceki oturumda `docs/ai-log.md` bu iş paketi için güncellenmemişti; kullanıcı hizalama ve log talebiyle birlikte tamamlandı.

**Prompt:** FR-12 ekleme; frontend’de eksik kalanlar kontrolü; ardından “kutular aynı hizada olsun” ve AI log’a yazılıp yazılmadığının sorulması.

**AI Output Summary:** **Backend:** `GET /api/v1/events/export` (`format=csv|pdf`, zorunlu `from`/`to`, isteğe bağlı `event_type`, `source`, `limit` 1–10000); `src/lib/events-where.ts` ortak WHERE; `src/lib/events-export-body.ts` (CSV BOM + kaçış, `pdf-lib` ile PDF); `events-routes` içinde export rotası `/:id` önünde; `pdf-lib` bağımlılığı; `root` indeksinde `events_export`; `docs/api.md` satırı. **Frontend:** `dashboardWindowIso` (`useMetrics`), `buildEventsExportUrl`, filtre satırında export; `LiveEventFeed` chevron ile payload açılır panel. **Hizalama (bu tur):** filtre çubuğu `items-end` → `items-start` (uzun export sütunu kısa filtreleri aşağı itmesin); export sütunu diğerleriyle aynı `flex flex-col gap-1` + üst satır başlık / alt satır kontroller; format `select` için `px-3 py-2`; indirme butonu `h-[42px]` ile select ile hizalı yükseklik.

**Your Modifications:** —

**Validation:** `src` ve `frontend` için `npm run build`. Export’ta `internal_server_error` görülürse: API’nın güncel kod + `npm install` (pdf-lib) ile çalıştığından ve veritabanının erişilebilir olduğundan emin olun; ayrıntı için API log (`events_export_failed`).

**Quality:** 5/5 — FR-12 uçtan uca; log gecikmesi AI-019 ile kapatıldı.

**Time Impact:** Saved ~45 minutes (tahmini, FR-12 + hizalama + log).

**— AI-019 (Compliance Polish) eki — PDF v2.0 strict match**

**Category:** Compliance, API tamamlama, P2 stub, repo yapısı

**Prompt:** “EventPulse Final Compliance & Polish (PDF v2.0 Strict Match)” — Active Alerts paneli + anomali satır click-through; rules full CRUD; metrics `p95`/`p99` stub; e-posta log stub; `load-gen` → `tests/load/`; `architecture.md` FR-10/FR-11 taslakları; sürecin AI log’a işlenmesi.

**AI Output Summary:** **Dashboard:** `ActiveAlertsPanel`, `useMetrics` içinde `rule_triggered` ile `activeAlerts` (son 50), Clear + olay detayına link; `RecentAnomalies` satır tıklaması (`exemplar_event_id` varken) + klavye + açıklama metni. **API:** `GET/PUT/DELETE /api/v1/rules/:id`, `uuid-param` yardımcısı; `GET /api/v1/metrics` gövdesine `latency_ms_percentiles` stub. **Bildirim:** `EmailNotificationStub` portu, `LoggingEmailNotificationStub` (`channel_hint` = `email_stub` | `email_log` → `email_notification_stub` log); `evaluate-alert-rules` + `rule-engine` bağlandı; birim testi. **Yapı:** `tests/load/load-gen.ts`, kök `package.json` script güncellemesi; `scripts/load-gen.ts` kaldırıldı. **Dokümantasyon:** `docs/api.md`, `docs/architecture.md` (FR-10/FR-11), `root` endpoint haritası.

**Your Modifications:** —

**Validation:** `src` `npm run build`; `frontend` `npm run build`; kök `npm test`.

**Quality:** 5/5 — PDF §3.3–3.5 ve §6.1 ile hizalı polish.

**Time Impact:** Saved ~90 minutes (tahmini).

### AI-020 | 2026-03-24 | Cursor

**Category:** Documentation sync & first-person narration

**Context:** Kök README ve frontend README birinci şahıs ve detaylı hale getirildikten sonra; `api.md`, `architecture`, `ai-strategy`, `walkthrough` ve AI günlüğünün aynı gerçeği anlatması ve eksik teknik notların (export/PDF stream, 503 gövdeleri, auth uyarısı, limit politikası) eklenmesi.

**Prompt:** “diğer dökümanlarada bak ve eklemediğimiz şeyleri ekle ve ben yazmışım gibi yaz”

**AI Output Summary:** `docs/api.md` — kişisel giriş, FR-12 export alt bölümü (CSV BOM, PDF stream, payload güvenliği, 503 tablosu, dashboard notu). `docs/architecture.md` — yazar notu (blockquote). `docs/ai-strategy.md` — AI-012 sonrası teslimatlar ve dokümantasyon alışkanlıkları. `docs/walkthrough.md` — girişe “benim çerçevem” paragrafı. `docs/ai-log.md` — bu kayıt; özet tabloda toplam etkileşim **20** (AI-001 … AI-020).

**Your Modifications:** Tarihleri ve tonu kendi sürecine göre düzenleyebilirsin; teknik iddialar mevcut kodla uyumlu tutuldu.

**Validation:** Route ve export kodu ile çapraz kontrol (`pdf_generation_failed`, `Readable` PDF gönderimi).

**Quality:** 5/5 — Doküman seti README ile hizalı, tekrar okunabilir.

**Time Impact:** Tahmini 25 dakika.

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
