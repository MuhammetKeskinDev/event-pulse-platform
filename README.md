# EventPulse

## Executive summary (yönetici özeti)

**Vizyon:** Yüksek hacimli olayları güvenilir biçimde toplayan, **Redis Streams** ile API’den ayıran ve **TimescaleDB** üzerinde zaman serisi olarak saklayan bir platform. Amaç; operatörün metrik ve anomalileri görebildiği, kabul katmanında **P95 gecikmesinin 200 ms altında** tutulması hedeflenen (vaka gereksinimi) olay altyapısı sunmaktır.

**Ne içerir:** Fastify + TypeScript ingestion API (`202` + stream’e yazma), stream tüketen worker, metrik uçları, WebSocket ile canlı dashboard köprüsü, dakika bazlı Z-score anomali tespiti, Vitest testleri ve `load-gen` / `seed-db` yardımcı scriptleri.

---

## Mimari (ASCII)

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

## Hızlı kurulum

### 1. Altyapı

Proje kökünde:

```bash
docker compose up -d
```

**TimescaleDB** (`5432`) ve **Redis** (`6379`) ayağa kalkar.

### 2. Bağımlılıklar (kök)

Testler, `load-gen` ve `seed-db` için:

```bash
npm install
```

### 3. Veritabanı şeması

Migrasyonları sırayla uygulayın (PowerShell örneği):

```powershell
Get-Content -Raw src\db\migrations\01_init_schema.sql | docker exec -i eventpulse-timescaledb psql -U eventpulse -d eventpulse -v ON_ERROR_STOP=1
Get-Content -Raw src\db\migrations\02_anomalies.sql | docker exec -i eventpulse-timescaledb psql -U eventpulse -d eventpulse -v ON_ERROR_STOP=1
Get-Content -Raw src\db\migrations\03_anomalies_p1_columns.sql | docker exec -i eventpulse-timescaledb psql -U eventpulse -d eventpulse -v ON_ERROR_STOP=1
```

### 4. Örnek veri (isteğe bağlı)

`DATABASE_URL` varsayılan olarak docker-compose ile uyumludur:

```bash
npm run seed-db
```

İsteğe bağlı: `SEED_TRUNCATE_EVENTS=1` ile önce `events` tablosunu temizler. Ayrıntılar: `scripts/seed-db.ts`.

### 5. Backend

```bash
cd src
npm install
npm run dev
```

API: `http://127.0.0.1:3000`

### 6. Worker (ayrı terminal)

```bash
cd src
npm run worker:events
```

### 7. Dashboard (isteğe bağlı)

```bash
cd frontend
npm install
npm run dev
```

### 8. Yük testi (isteğe bağlı)

API çalışırken, kök dizinde:

```bash
npm run load-gen
```

Hedef hız ve hacim: `RATE`, `TOTAL`, `API_BASE` ortam değişkenleri (`scripts/load-gen.ts`). **P95 &lt; 200 ms** vaka hedefi için üretim öncesi ortamda histogram tabanlı araçlarla doğrulama önerilir; ayrıntı: [`docs/walkthrough.md`](docs/walkthrough.md).

---

## Teknoloji özeti

| Katman | Seçim |
|--------|--------|
| API | Node.js, TypeScript, **Fastify**, **Zod**, **pino** |
| Kuyruk | **Redis Streams** (`XADD` / `XREADGROUP`) |
| Veri | **TimescaleDB** (hypertable), **Redis** |
| Gerçek zamanlı | **WebSocket**, Redis pub/sub köprüsü |
| Dashboard | **Vite**, **React**, **Tailwind**, **Recharts** |

---

## Anomali tespiti (kısa)

Son **15 tam dakika** baseline, son tamamlanmış **1 dakika** hacmi ile karşılaştırılır; **3σ** aşımında `anomalies` kaydı (worker periyodik job). Detay: aşağıdaki dokümanlar.

---

## Dokümantasyon

| Dosya | İçerik |
|--------|--------|
| [`docs/architecture.md`](docs/architecture.md) | Mimari kararlar |
| [`docs/api.md`](docs/api.md) | HTTP ve WebSocket |
| [`docs/walkthrough.md`](docs/walkthrough.md) | İki milyon olay problemi, Streams/Timescale, yük ve P95 hedefi |
| [`docs/ai-strategy.md`](docs/ai-strategy.md) | AI ile çalışma ve AI-001 → AI-012 süreç analizi |
| [`docs/ai-log.md`](docs/ai-log.md) | Etkileşim günlüğü |

---

## Lisans

Proje lisansı `package.json` / depo tercihinize göre eklenebilir.
