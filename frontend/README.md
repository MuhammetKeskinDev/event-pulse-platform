# EventPulse — Dashboard (frontend)

Bu klasörde, EventPulse için yazdığım **React + Vite + TypeScript** arayüzü var. Amacım; API’den gelen metrikleri, anomalileri, sağlık sinyallerini ve canlı olay akışını tek ekranda toplamak; vaka gereksinimlerindeki **FR-05 / FR-06 / FR-12** davranışlarını (zaman aralığı, filtreler, WebSocket, CSV/PDF export) somutlaştırmak.

## Nasıl çalıştırıyorum?

Önce backend’in ayakta olduğundan emin oluyorum (Docker veya `src` altında `npm run dev`, varsayılan **http://127.0.0.1:3000**).

```bash
cd frontend
npm install
npm run dev
```

Tarayıcıda genelde **http://localhost:5173**. `vite.config.ts` içinde **`/api`** ve **`/ws`** istekleri aynı makinedeki API’ye **proxy** ediliyor; ekstra CORS ayarı gerektirmemek için geliştirmede bunu tercih ettim.

## Ortam değişkenleri

| Değişken | Ne zaman? | Açıklama |
|----------|-----------|----------|
| `VITE_API_BASE` | API farklı origin’deyse | Örn. `http://127.0.0.1:3000` — export URL’leri ve fetch kökü |
| `VITE_WS_BASE` | WS ayrı kökteyse | HTTP(S) kök; kod `ws` / `wss`’e çevirir |

Boş bıraktığımda göreli yol kullanılıyor; geliştirmede proxy devreye giriyor.

## Ekranda neler var?

- **System health** — stream, pending, DLQ, DB gecikmesi (üstte).
- **Filtreler** — preset veya özel tarih, event type, source, anomaly severity.
- **Export** — `format` (CSV/PDF), `limit` (satır sayısı), indirme; zaman aralığı ve type/source ile uyumlu.
- **Throughput, hata oranı, özet tablo** — seçilen pencereye göre.
- **Anomali grafiği ve listeler** — mümkün olduğunda örnek olay ID’sine tıklayıp detay modali.
- **Canlı akış** — WebSocket’ten gelen olaylar; payload satırı genişletilebilir.
- **Active alerts** — `rule_triggered` mesajları; temizleme ve olay detayına geçiş.

## Derleme

```bash
npm run build
npm run preview   # isteğe bağlı önizleme
```

Üretimde `VITE_API_BASE` / `VITE_WS_BASE` değerlerini dağıtım adresinize göre set edin.

## Not

Kök dizindeki **[`README.md`](../README.md)** tam platform kurulumunu anlatıyor; API şeması için **[`docs/api.md`](../docs/api.md)** dosyasına bakıyorum.
