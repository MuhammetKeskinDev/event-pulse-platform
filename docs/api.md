# EventPulse — API Özeti

## OpenAPI / Swagger (PDF)

| Yöntem | Yol | Açıklama |
|--------|-----|----------|
| `GET` | `/docs` | Swagger UI (`@fastify/swagger-ui`). |

## Genel

| Yöntem | Yol | Açıklama |
|--------|-----|----------|
| `GET` | `/` | Servis özeti, `/docs` ve HTTP uç listesi (**200**). |

## Pipeline health (PDF §3.1)

| Yöntem | Yol | Açıklama |
|--------|-----|----------|
| `GET` | `/api/v1/events/health` | `stream_length`, `pending_messages`, `dlq_length`, `db_latency_ms` (**200**). |

## Metrics (dashboard)

| Yöntem | Yol | Açıklama |
|--------|-----|----------|
| `GET` | `/api/v1/metrics` | TimescaleDB `events` metrikleri (**200**). Sorgu: `from`, `to` (ISO-8601, ikisi de verilirse özel pencere; verilmezse son 1 saat). `event_type` — yalnızca bu türü say. Önbellek: `max-age=10`. |
| `GET` | `/api/v1/metrics/throughput` | Kova bazlı throughput. Sorgu: `windowMinutes` (15–1440), `bucketMinutes`, isteğe bağlı `event_type` (tek tür). |

### Yanıt özeti

- **`window`:** `label` = `last_1_hour` veya `custom`; `start` / `end` (ISO-8601).
- **`last_hour`:** Seçilen pencerede `by_event_type`, toplam, hata oranı (alan adı geriye dönük uyumluluk için `last_hour`).
- **`all_time`:** `from`/`to` verilmişse aynı aralığın toplamı; verilmemişse tüm tablo.
- **`suggested_poll_interval_seconds`:** `10` (önerilen poll aralığı).
- **`refreshed_at`:** Yanıtın üretildiği an.

### Hatalar

| HTTP | Gövde | Açıklama |
|------|--------|----------|
| 400 | `invalid_time_range` | `from` ≥ `to` |
| 503 | `metrics_unavailable` | Veritabanı sorgusu başarısız |

**Dashboard (FR-05 / FR-06):** `frontend/` Vite uygulaması geliştirmede `npm run dev` ile çalışır; `/api` ve **`/ws` WebSocket** Vite proxy ile backend’e gider. Üretim için `VITE_API_BASE` ve isteğe bağlı **`VITE_WS_BASE`** (HTTP(S) kökü; istemci `ws`/`wss`’e çevirir).

## Realtime (WebSocket — FR-06)

| Protokol | Yol | Açıklama |
|----------|-----|----------|
| WebSocket | `/ws/events` | Worker her başarılı persist + `XACK` sonrası Redis kanalı `eventpulse:events_live` üzerine yayın yapar; API abone olur ve bağlı tüm WS istemcilerine mesajı iletir. |

**Mesaj örneği (JSON string):**

```json
{
  "type": "event_processed",
  "event_id": "…",
  "event_type": "page_view",
  "occurred_at": "2026-03-23T12:00:00.000Z"
}
```

Dashboard bu mesajı alınca metrik, anomali, sağlık, throughput kovaları ve son olayları yeniler. Ek WS türü:

```json
{ "type": "event_dlq", "message_id": "…", "event_id": "…" }
```

Kural tetiklenince (worker):

```json
{
  "type": "rule_triggered",
  "rule_id": "…",
  "rule_name": "…",
  "severity": "warning",
  "event_id": "…",
  "event_type": "error",
  "message": "…"
}
```

## Events — sorgu (PDF FR-08)

| Yöntem | Yol | Açıklama |
|--------|-----|--------|
| `GET` | `/api/v1/events` | Filtre: `event_type`, `from`, `to` (ISO-8601), `limit` (1–100, varsayılan 50), `offset`. Yanıt: `{ items, limit, offset }`. |
| `GET` | `/api/v1/events/:id` | UUID ile son `occurred_at` satırı (**200** / **404**). |

## Rules — motor (PDF FR-04 / FR-07)

| Yöntem | Yol | Açıklama |
|--------|-----|--------|
| `GET` | `/api/v1/rules` | `alert_rules` tablosu (migrasyon `04_rules_retention.sql` gerekir). |
| `POST` | `/api/v1/rules` | `{ "name", "definition"?, "enabled"?, "channel_hint"? }` — **201**. |

**`definition`:** `event_match` veya `count_threshold` (worker); `cooldown_seconds`, `severity`. Slack: `SLACK_WEBHOOK_URL` veya `channel_hint` (https).

## Anomalies (FR-09 P1)

| Yöntem | Yol | Açıklama |
|--------|-----|----------|
| `GET` | `/api/v1/anomalies` | `limit` (1–500, varsayılan 10); isteğe bağlı `from` / `to`, `severity`, `event_type`. **400:** `invalid_from` / `invalid_to`. |

**Satır alanları:** `id`, `event_type` (toplam hacim kuralı için `*`), `severity` (`critical`, `high`, `medium`, `low` vb.), `detected_at` (ISO-8601), `description` (çoğunlukla JSON; Z-score kuralı alanları).

### Yanıt örneği (200)

```json
{
  "items": [
    {
      "id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
      "event_type": "*",
      "severity": "critical",
      "detected_at": "2026-03-23T12:05:00.000Z",
      "description": "{\"rule\":\"zscore_3sigma_minute_volume\",\"eval_count\":420,...}"
    }
  ]
}
```

**Şema:** `02_anomalies.sql` + `03_anomalies_p1_columns.sql` (`event_type` sütunu).

Worker, `detectAndPersistAnomaly` çağrısından sonra kritik kayıt oluşursa `anomaly_recorded` WS mesajı yayınlar.

## Ingestion

| Yöntem | Yol | Açıklama |
|--------|-----|----------|
| `POST` | `/api/v1/events` | Tekil olay; doğrulama sonrası stream’e yazar, **202**. Geçersiz gövde: **422**. |
| `POST` | `/api/v1/events/batch` | `{ "events": [ … ] }` — en fazla **500** olay (PDF FR-01). **202** + `count`, `event_ids`. |

**FR-03:** `06_retention_policy.sql` — `events` hypertable üzerinde **7 gün** saklama (`add_retention_policy`).

### Yanıt (202) — tekil

```json
{
  "status": "accepted",
  "event_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

`event_id` istek gövdesinde verilmediyse sunucu UUID üretir.

### Yanıt (202) — batch

```json
{
  "status": "accepted",
  "count": 10,
  "event_ids": ["…"]
}
```

### Hatalar

| HTTP | Gövde | Açıklama |
|------|--------|----------|
| 422 | `validation_failed` + `details` | Zod şemasına uymayan gövde |
| 503 | `stream_unavailable` | Redis `XADD` başarısız |

---

## Appendix A — Ingestion event şemaları

Tüm olaylar ortak bir **zarf** ve türe özel **payload** kullanır.

### Ortak zarf alanları (PDF Appendix A)

| Alan | Tip | Zorunlu | Açıklama |
|------|-----|---------|----------|
| `event_type` | string (literal) | Evet | `page_view`, `purchase`, `error`, `system_health` |
| `source` | string | Evet | Kaynak sistem (`web_app`, `payment_service`, …) |
| `event_id` | UUID string | Hayır | Yoksa sunucu üretir |
| `occurred_at` **veya** `timestamp` | ISO-8601 | Biri zorunlu | PDF’de `timestamp`; ikisi de kabul edilir, içeride `occurred_at` olur |
| `metadata` | object | Hayır | `user_id`, `session_id`, `geo`, … |
| `payload` | object | Evet | Türe özel (aşağıda) |

---

### A.1 `page_view`

**`payload` alanları**

| Alan | Tip | Zorunlu |
|------|-----|---------|
| `session_id` | string | Evet |
| `page_url` | string (URL) | `page_url` veya PDF’deki `url` (göreli yol kabul; canonical base ile tam URL’ye çevrilir) |
| `url` | string | `page_url` ile birlikte zorunlu değil; biri yeterli |
| `referrer` | string (URL) | Hayır |
| `user_id` | string | Hayır |

---

### A.2 `purchase`

**`payload` alanları**

| Alan | Tip | Zorunlu |
|------|-----|---------|
| `order_id` | string | Evet |
| `amount` | number (pozitif) | Evet |
| `currency` | string (3 harf, ISO 4217, büyük harf) | Evet |
| `line_items` | dizi | Hayır |
| `line_items[].product_id` | string | (öğe varsa) |
| `line_items[].quantity` | pozitif tam sayı | (öğe varsa) |
| `line_items[].unit_price` | number (≥ 0) | (öğe varsa) |
| `user_id` | string | Hayır |

---

### A.3 `error`

**`payload` alanları**

| Alan | Tip | Zorunlu |
|------|-----|---------|
| `error_code` | string | Evet |
| `message` | string | Evet |
| `severity` | `low` \| `medium` \| `high` \| `critical` | Hayır |
| `source_service` | string | Evet |
| `correlation_id` | string | Hayır |

---

### A.4 `system_health`

**`payload` alanları**

| Alan | Tip | Zorunlu |
|------|-----|---------|
| `component` | string | Evet |
| `status` | `ok` \| `degraded` \| `down` | Evet |
| `details` | string | Hayır |
| `metric_snapshot` | object (string → number) | Hayır |

---

### Örnek: `page_view`

```json
{
  "event_type": "page_view",
  "source": "web_app",
  "timestamp": "2026-03-23T12:00:00.000Z",
  "metadata": { "user_id": "usr_1", "session_id": "sess_abc" },
  "payload": {
    "session_id": "sess_abc123",
    "url": "/pricing",
    "referrer": "https://example.com/"
  }
}
```

Kod tarafında doğrulama: `src/schemas/ingestion-events.ts` (Zod). DB sütunları: migrasyon `05_events_source_metadata.sql` (`source`, `metadata`).
