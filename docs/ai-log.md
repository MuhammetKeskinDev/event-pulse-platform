# AI Interaction Log - EventPulse Case Study

## Summary

| Metric | Value |
|--------|-------|
| **Total AI interactions logged** | 6 |
| **Tools used** | Gemini, Cursor |
| **Estimated time saved** | ~155 minutes |
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
