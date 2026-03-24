# EventPulse

Bu repoda, yüksek hacimli ürün olaylarını güvenle toplayıp zaman serisi olarak sorgulanabilir hale getiren bir **olay platformu** kuruyorum. Amacım; vaka çalışmasındaki hedeflerle uyumlu şekilde kabul katmanında **düşük gecikme** (tasarım hedefi: P95 &lt; 200 ms), **Redis Streams** ile API’den ayrılmış işleme ve **TimescaleDB** üzerinde ölçeklenebilir saklama sağlamak. Operatör tarafında ise metrikler, anomaliler, canlı akış ve **dışa aktarım (CSV/PDF)** ile gerçekten kullanılabilir bir dashboard sunmak.

Aşağıdaki metni, repoyu ilk kez açan biri adım adım ilerleyebilsin diye bilerek uzun ve açıklayıcı tuttum; kısayol arayanlar için **Hızlı başlangıç** bölümüne atlayabilirsiniz.

---

## Ben ne inşa ettim? (kısa liste)

- **API (Fastify + TypeScript):** tekil ve batch olay kabulü, OpenAPI **Swagger UI** (`/docs`), pipeline health, metrikler, throughput kovaları, olay sorgusu, **UUID ile tek olay**, **CSV/PDF export**, kurallar için **tam CRUD** (`GET/POST` + `GET/PUT/DELETE` `:id`).
- **Kuyruk:** Redis Streams (`events_stream`), consumer group, başarısızlıkta yeniden deneme ve **DLQ** (ör. 3 deneme sonrası).
- **Worker:** stream tüketimi, TimescaleDB’ye yazma, anomali (hacim Z-score) job’ı, başarılı persist sonrası **Redis pub** ve kural motoru (Slack webhook, e-posta için **log stub**).
- **Gerçek zamanlı:** API, Redis’e abone olup **WebSocket** (`/ws/events`) ile dashboard’a canlı mesaj (işlenen olay, DLQ, **kural tetikleri**).
- **Dashboard (Vite + React + Tailwind + Recharts):** zaman aralığı (preset veya özel `from`/`to`), event type / source / severity filtreleri, **system health** üstte, throughput grafiği, hata oranı, özet tablo, anomali zaman çizelgesi ve tıklanabilir satırlar, son anomaliler, canlı olay akışı, **aktif uyarılar** paneli, **FR-12 export** (satır limiti → format CSV/PDF → indirme).
- **Test ve araçlar:** Vitest birim testleri, isteğe bağlı entegrasyon testi, `seed-db`, `load-gen`, demo kural tetiklemek için `trigger-rule-alert`.
- **Dağıtım:** `Dockerfile.api`, `Dockerfile.worker`, `docker-compose.yml` (TimescaleDB, Redis, API, worker).

---

## Repo yapısı (nerede ne var?)

| Yol | Açıklama |
|-----|----------|
| `src/` | API ve worker kaynak kodu (`app.ts`, `interface/http/routes`, `domain`, `application`, `infrastructure`, `workers/…`). |
| `src/db/migrations/` | PostgreSQL/Timescale şema migrasyonları (sırayla uygulanmalı). |
| `frontend/` | React dashboard; geliştirmede Vite proxy ile `/api` ve `/ws` → `127.0.0.1:3000`. |
| `tests/unit/` | Vitest birim testleri (kural motoru, anomali, batch vb.). |
| `tests/integration/` | Örn. Redis ile entegrasyon (`RUN_INTEGRATION=1`). |
| `tests/load/load-gen.ts` | HTTP yük üretimi (`npm run load-gen`). |
| `scripts/` | `seed-db.ts`, `trigger-rule-alert.ts`, `full-verify.ps1`. |
| `docs/` | Mimari, API özeti, walkthrough, AI strateji ve etkileşim günlüğü. |

---

## Mimari (tek bakışta)

```
                    ┌─────────────────────────────────────────────────────────┐
                    │                     İstemciler / entegrasyonlar          │
                    └────────────────────────────┬────────────────────────────┘
                                                 │ HTTP POST /api/v1/events
                                                 ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│  API süreci (Fastify)                                                             │
│  • Zod doğrulama  • 202 Accepted  • XADD ────────────────────────┐                │
│  • GET metrics / anomalies  • WS /ws/events ◄── Redis SUB       │                │
└────────────────────────────────────────────────────────────────│────────────────┘
                                                                 │
         ┌───────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────┐       XREADGROUP + işleme        ┌─────────────────────────────┐
│  Redis Streams   │ ──────────────────────────────► │  Worker süreci              │
│  events_stream   │                                 │  • insert TimescaleDB       │
│  + DLQ stream    │                                 │  • 3x retry → DLQ + XACK    │
└─────────────────┘                                 │  • XACK (başarıda)          │
         ▲                                            │  • anomali job (periyodik)  │
         │ PUB (canlı)                                │  • PUB eventpulse:events_live │
         └────────────────────────────────────────────└──────────────┬──────────────┘
                                                                     │
                                                                     ▼
                                                        ┌─────────────────────────────┐
                                                        │  TimescaleDB (PostgreSQL)    │
                                                        │  events (hypertable)        │
                                                        │  anomalies                  │
                                                        └─────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────────┐
│  Dashboard (Vite + React) — geliştirmede /api ve /ws proxy ile API’ye bağlanır     │
└──────────────────────────────────────────────────────────────────────────────────┘
```

---

## Hızlı başlangıç

```bash
docker compose up -d --build
```

Ardından migrasyonları uygulayıp (aşağıdaki PowerShell bloğu) isteğe bağlı `npm run seed-db` ile örnek veri yükleyin. **OpenAPI:** http://127.0.0.1:3000/docs  

Sadece veri katmanı: `docker compose up -d timescaledb redis`

---

## Kurulumu ben nasıl yapıyorum? (adım adım)

### 1) Docker ile tam yığın

Kök dizinde `docker compose up -d --build` dediğimde **TimescaleDB**, **Redis**, **API** (port **3000**), **worker** birlikte ayağa kalkıyor. Worker’a Slack istiyorsam `docker-compose.yml` içinde `SLACK_WEBHOOK_URL` ortam değişkenini dolduruyorum (veya `.env` ile compose’a aktarıyorum).

### 2) Migrasyonlar (ilk kurulum şart)

PowerShell örneği (konteyner adı `eventpulse-timescaledb` varsayımıyla):

```powershell
$m = @(
  "01_init_schema.sql",
  "02_anomalies.sql",
  "03_anomalies_p1_columns.sql",
  "04_rules_retention.sql",
  "05_events_source_metadata.sql",
  "06_retention_policy.sql"
)
foreach ($f in $m) {
  Get-Content -Raw "src\db\migrations\$f" | docker exec -i eventpulse-timescaledb psql -U eventpulse -d eventpulse -v ON_ERROR_STOP=1
}
```

### 3) Kök `npm install`

Testler, `seed-db`, `load-gen`, `trigger-rule-alert` için kökte:

```bash
npm install
```

### 4) Örnek veri (isteğe bağlı)

Docker’daki varsayılan `DATABASE_URL` ile uyumlu bağlantıda:

```bash
npm run seed-db
```

Önce `events` tablosunu boşaltmak istersen: `SEED_TRUNCATE_EVENTS=1` (detay: `scripts/seed-db.ts`).

### 5) API’yi yerelde (Docker’sız) çalıştırmak

```bash
cd src
npm install
npm run dev
```

`DATABASE_URL` ve `REDIS_URL` ortam değişkenlerini kendi Postgres/Redis’inize göre ayarlıyorum; yoksa `app.ts` içindeki varsayılanlar yerel geliştirme içindir.

### 6) Worker (ayrı terminal)

```bash
cd src
npm run worker:events
```

### 7) Dashboard

```bash
cd frontend
npm install
npm run dev
```

Tarayıcıda genelde **http://localhost:5173**. API’yi `127.0.0.1:3000`’de çalıştırıyorum; Vite `vite.config.ts` içinde `/api` ve `/ws` proxy’si bunu otomatik yönlendiriyor.

Üretim veya özel host için frontend’de `VITE_API_BASE` kullanıyorum; WebSocket tabanı için gerekirse `VITE_WS_BASE` (HTTP kökü; istemci `ws`/`wss`’e çevirir). Ayrıntı: `docs/api.md`.

### 8) Yük testi

API ayakta iken kökte:

```bash
npm run load-gen
```

Hız ve toplam olay: `RATE`, `TOTAL`, `API_BASE` (`tests/load/load-gen.ts`). P95 hedefi için üretim öncesi ortamda histogram tabanlı ölçüm öneririm; tartışma: `docs/walkthrough.md`.

### 9) Kural uyarısını manuel denemek

Worker ve cache davranışını görmek için (API erişilebilirken):

```bash
npm run trigger-rule-alert
```

---

## Ortam değişkenleri (sık kullandıklarım)

| Değişken | Nerede | Ne işe yarıyor |
|----------|--------|----------------|
| `DATABASE_URL` | API, worker | Postgres bağlantısı |
| `REDIS_URL` | API, worker | Streams, pub/sub, önbellek |
| `PORT` / `HOST` | API | Dinleme adresi (Docker’da genelde `3000`, `0.0.0.0`) |
| `SLACK_WEBHOOK_URL` | worker (compose) | Kural tetiklenince webhook POST |
| `ALERT_RULES_CACHE_TTL_MS` | worker | Kural listesi önbellek süresi (ör. demo için kısa TTL) |
| `VITE_API_BASE` | frontend build | API kökü (boşsa aynı origin + proxy) |
| `VITE_WS_BASE` | frontend | WS için HTTP(S) kökü (opsiyonel) |
| `SEED_TRUNCATE_EVENTS` | seed-db | `1` ise önce `events` truncate |

---

## NPM scriptleri (kök `package.json`)

| Komut | Açıklama |
|-------|----------|
| `npm test` | Birim testleri |
| `npm run test:coverage` | Coverage ile birim testleri |
| `npm run test:integration` | `RUN_INTEGRATION=1` ile entegrasyon |
| `npm run test:all` | Tüm Vitest testleri |
| `npm run load-gen` | Yük üreticisi |
| `npm run seed-db` | Örnek olaylar |
| `npm run trigger-rule-alert` | Kural tetik mesajı / demo |
| `npm run verify:full` | PowerShell tam doğrulama (Windows) |

---

## Dashboard’da neler var?

- **System health:** API↔Postgres gecikmesi, stream uzunluğu, pending, DLQ — en üstte gösteriyorum ki pipeline’ı ilk bakışta görelim.
- **Filtre çubuğu:** Zaman (preset veya özel), event type, source, anomaly severity; metrik ve anomali sorguları bu pencereye göre yenileniyor.
- **Export (FR-12):** Seçilen zaman aralığı + event type + source ile `GET /api/v1/events/export`; `format=csv|pdf`, `limit` ile satır sayısı (sunucuda minimum 1, üst sınır pratikte `Number.MAX_SAFE_INTEGER`; PDF gövdesi **stream** ile iletiliyor, PDF’te satır/payload için ekstra kesme yok). Severity export filtresine **dahil değil** (bilinçli).
- **Throughput, error rate, özet tablo, anomali grafiği, son anomaliler, canlı akış:** WebSocket ile güncellenir; kural tetiklerinde toast + **Active alerts** paneli dolar.

---

## Teknoloji özeti

| Katman | Seçim |
|--------|--------|
| API | Node.js, TypeScript, **Fastify**, **Zod**, **pino** |
| Kuyruk | **Redis Streams** |
| Veri | **TimescaleDB**, **Redis** |
| Gerçek zamanlı | **WebSocket**, Redis pub/sub |
| Dashboard | **Vite**, **React**, **Tailwind**, **Recharts** |
| Export PDF | **pdf-lib** |

---

## Anomali tespiti (çok kısa)

Worker tarafında son pencerelere göre hacim Z-score ile `anomalies` tablosuna kayıt düşülüyor. Detaylı gerekçe ve akış: `docs/architecture.md`, `docs/walkthrough.md`.

---

## Dokümantasyon indeksi

| Dosya | İçerik |
|--------|--------|
| [`docs/architecture.md`](docs/architecture.md) | Mimari kararlar, katmanlar, FR-10/11 taslakları, güncel ürün özeti |
| [`docs/api.md`](docs/api.md) | HTTP, WebSocket, export, hata kodları |
| [`docs/walkthrough.md`](docs/walkthrough.md) | Ölçek, Streams, Timescale, P95 tartışması |
| [`docs/ai-strategy.md`](docs/ai-strategy.md) | AI ile çalışma notları |
| [`docs/ai-log.md`](docs/ai-log.md) | Etkileşim günlüğü |
| [`frontend/README.md`](frontend/README.md) | Dashboard geliştirme notları |

---

## Bilinen sınırlar ve sıradaki işler

- **FR-10 / FR-11:** Kimlik doğrulama (RBAC) ve olay **replay** — tasarlandı, **henüz kod yok**; üretim öncesi auth şart görüyorum.
- **FR-12 (export):** **Uygulandı** (CSV/PDF, dashboard entegrasyonu).
- **FR-07:** Slack webhook var; gerçek e-posta SMTP yok — `email_stub` / `email_log` kanalları log stub ile temsil ediliyor.
- **PDF / Appendix A:** Üst seviye alan adları yerine `occurred_at` + payload şeması kullanıyorum; ayrıntı `docs/api.md`.
- **Kural DSL:** `event_match` ve `count_threshold` odaklı; tam ifade motoru bilinçli olarak genişletilmedi.
- **Test:** Birim testleri var; kapsamı genişletmek için alan bıraktım.

---

## Lisans

`package.json` / tercihinize göre lisans satırı eklenebilir; şu an özel proje varsayımıyla ilerliyorum.

---

*Son güncelleme: README’yi repo durumuyla uyumlu ve okuyucu dostu tutmak için düzenli gözden geçiriyorum; eksik gördüğünüz bir adım olursa issue açmanız yeterli.*
