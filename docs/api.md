# EventPulse — API Özeti

## Genel

| Yöntem | Yol | Açıklama |
|--------|-----|----------|
| `GET` | `/` | Servis özeti ve ingestion uç noktası bilgisi (**200**). |

## Metrics (dashboard)

| Yöntem | Yol | Açıklama |
|--------|-----|----------|
| `GET` | `/api/v1/metrics` | TimescaleDB `events` tablosundan metrikler (**200**). Önbellek: `Cache-Control: public, max-age=10` (panelde ~10 sn’de bir yenileme için uygundur). |

### Yanıt özeti

- **`window`:** Son 1 saatlik sorgu aralığı (`start` / `end`, ISO-8601).
- **`last_hour.by_event_type`:** Son 1 saatte `event_type` başına olay sayıları.
- **`last_hour.error_rate_percent`:** Son 1 saatte `event_type = 'error'` oranı (%).
- **`all_time`:** Tablodaki tüm kayıtlar için toplam olay, hata sayısı ve **`error_rate_percent`** (sistem geneli hata oranı).
- **`suggested_poll_interval_seconds`:** `10` (önerilen poll aralığı).
- **`refreshed_at`:** Yanıtın üretildiği an.

### Hatalar

| HTTP | Gövde | Açıklama |
|------|--------|----------|
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

Dashboard bu mesajı alınca `GET /api/v1/metrics` ile grafikleri yeniler.

## Ingestion

| Yöntem | Yol | Açıklama |
|--------|-----|----------|
| `POST` | `/api/v1/events` | Olay kabulü; doğrulama sonrası Redis Stream `events_stream` üzerine yazar, **202 Accepted** döner. |

### Yanıt (202 Accepted)

```json
{
  "status": "accepted",
  "event_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

`event_id` istek gövdesinde verilmediyse sunucu UUID üretir.

### Hatalar

| HTTP | Gövde | Açıklama |
|------|--------|----------|
| 400 | `validation_failed` + `details` | Zod şemasına uymayan gövde |
| 503 | `stream_unavailable` | Redis `XADD` başarısız |

---

## Appendix A — Ingestion event şemaları

Tüm olaylar ortak bir **zarf** ve türe özel **payload** kullanır.

### Ortak zarf alanları

| Alan | Tip | Zorunlu | Açıklama |
|------|-----|---------|----------|
| `event_type` | string (literal) | Evet | `page_view`, `purchase`, `error`, `system_health` |
| `event_id` | UUID string | Hayır | Yoksa sunucu üretir |
| `occurred_at` | ISO-8601 datetime | Evet | Olayın gerçekleştiği an |
| `payload` | object | Evet | Aşağıdaki türlere göre değişir |

---

### A.1 `page_view`

**`payload` alanları**

| Alan | Tip | Zorunlu |
|------|-----|---------|
| `session_id` | string | Evet |
| `page_url` | string (URL) | Evet |
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
  "occurred_at": "2026-03-23T12:00:00.000Z",
  "payload": {
    "session_id": "sess_abc123",
    "page_url": "https://example.com/pricing",
    "referrer": "https://example.com/"
  }
}
```

Kod tarafında doğrulama: `src/schemas/ingestion-events.ts` (Zod).
