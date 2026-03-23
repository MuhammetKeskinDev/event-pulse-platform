# EventPulse

Yüksek hacimli olayları güvenilir biçimde toplayan, **Redis Streams** üzerinden işleyen ve **TimescaleDB** ile zaman serisi olarak saklayan bir platform. **Fastify** tabanlı ingestion API, stream tüketen worker, metrik uçları, **WebSocket** ile canlı dashboard ve dakika bazlı **Z-score anomali** tespiti içerir.

---

## Teknoloji yığını

| Katman | Seçim |
|--------|--------|
| API | Node.js, **TypeScript**, **Fastify**, **Zod**, **pino** |
| Kuyruk | **Redis Streams** (`XADD` / `XREADGROUP`) |
| Veri | **TimescaleDB** (PostgreSQL + hypertable), **Redis** |
| Gerçek zamanlı | **@fastify/websocket**, Redis pub/sub köprüsü |
| Dashboard | **Vite**, **React**, **TypeScript**, **Tailwind CSS**, **Recharts** |

---

## Hızlı kurulum

### 1. Altyapı

Proje kökünde:

```bash
docker compose up -d
```

Bu komut **TimescaleDB** (varsayılan `5432`) ve **Redis** (`6379`) servislerini ayağa kaldırır.

### 2. Veritabanı şeması

PostgreSQL içinde migrasyonları sırayla uygulayın (PowerShell örneği):

```powershell
Get-Content -Raw src\db\migrations\01_init_schema.sql | docker exec -i eventpulse-timescaledb psql -U eventpulse -d eventpulse -v ON_ERROR_STOP=1
Get-Content -Raw src\db\migrations\02_anomalies.sql | docker exec -i eventpulse-timescaledb psql -U eventpulse -d eventpulse -v ON_ERROR_STOP=1
Get-Content -Raw src\db\migrations\03_anomalies_p1_columns.sql | docker exec -i eventpulse-timescaledb psql -U eventpulse -d eventpulse -v ON_ERROR_STOP=1
```

### 3. Backend

```bash
cd src
npm install
npm run dev
```

API varsayılan olarak `http://127.0.0.1:3000` adresinde dinler.

### 4. Stream worker

Ayrı bir terminalde:

```bash
cd src
npm run worker:events
```

### 5. Dashboard (isteğe bağlı)

```bash
cd frontend
npm install
npm run dev
```

Geliştirmede Vite, `/api` ve `/ws` isteklerini backend’e proxy’ler. Ayrıntılar: [`docs/api.md`](docs/api.md).

---

## Anomali tespiti (özet)

- **Girdi:** Son **15 tam dakika** için, değerlendirilen dakika *hariç*, dakika başına **toplam olay sayıları** (boş dakikalar sıfır kabul edilir).
- **İstatistik:** Bu 15 değerin **ortalaması** ve **örneklem standart sapması** (Z-score için temel).
- **Karşılaştırma:** Hemen sonraki **tamamlanmış 1 dakikalık** penceredeki toplam olay sayısı, ortalamadan **3 standart sapmadan** fazla uzaksa olay **critical** ciddiyetle `anomalies` tablosuna yazılır.
- **Tetikleme:** Worker, bu kontrolü yaklaşık **her 60 saniyede** bir çalıştırır; kayıt oluşursa canlı panel Redis üzerinden haberdar edilebilir.

Detaylı API ve mimari açıklamalar: [`docs/architecture.md`](docs/architecture.md), [`docs/api.md`](docs/api.md).

---

## Dokümantasyon

| Dosya | İçerik |
|--------|--------|
| [`docs/architecture.md`](docs/architecture.md) | Mimari kararlar ve gerekçeler |
| [`docs/api.md`](docs/api.md) | HTTP ve WebSocket uçları |
| [`docs/walkthrough.md`](docs/walkthrough.md) | Uçtan uca teknik yolculuk |
| [`docs/ai-strategy.md`](docs/ai-strategy.md) | AI ile çalışma stratejisi |
| [`docs/ai-log.md`](docs/ai-log.md) | Etkileşim günlüğü |

---

## Lisans

Proje lisansı `package.json` / depo tercihinize göre eklenebilir.
