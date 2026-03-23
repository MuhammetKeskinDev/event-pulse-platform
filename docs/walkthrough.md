# EventPulse: İki Milyon Olay Problemini Parçalamak — Teknik Bir Yolculuk

Bu yazı, bir vaka çalışması düzeyinde “günde yaklaşık **iki milyon olay** kabul edebilen, operatörün görebildiği ve zaman serisi olarak sorgulanabilir bir platform” hedefini nasıl **yönetilebilir parçalara** böldüğümüzü anlatır. Okuyucu, HTTP ingestion, kuyruk ve zaman serisi veritabanı kavramlarına aşina bir yazılım mühendisi varsayılır.

---

## Problem: ölçek tek bir sayı değil

“İki milyon event” ifadesi, tek başına bir performans benchmark’ı değil; **süreklilik ve bütçe** anlamı taşır:

- Günlük 2M olay ≈ ortalama **~23 olay/saniye** sürekli; pratikte trafik **patikalar** ve kabul katmanı bunu katlar.
- Vaka metni ayrıca **kabul (ingestion) tarafında P95 gecikmenin 200 ms altında** kalması beklentisini taşır. Bu, “sistem ayakta”dan farklıdır: kullanıcı veya entegrasyon partneri, çoğu istekte **hızlı bir 202 Accepted** görmelidir.

Bu yüzden problemi üç soruya ayırdık:

1. **Kabul:** Olayı doğrula, güvenilir şekilde sıraya al, **hemen** yanıt ver.
2. **İşleme:** Ağır veya başarısızlığa açık işleri API’den çıkar; **at-least-once** işlemeye yakın bir tüketim modeli kur.
3. **Gerçek ve gözlem:** Kalıcı gerçeği tek yerde topla (zaman serisi), operatöre özet metrikler ve gerekirse **canlı** sinyal ver.

Bu ayrım, “tek monolit süreçte her şeyi yap” tuzağından kaçınmayı mümkün kılar.

---

## Neden Redis Streams?

Kafka veya ayrı bir mesaj broker’ı bu ölçekte mantıklı olabilir; vaka süresi ve operasyonel yük için **Redis Streams** üç nedeni bir arada sağladı:

1. **Düşük devreye alma maliyeti:** Zaten Redis kullanıyoruz; Streams aynı operatör beyninde kalır, ek küme yönetimi yoktur.
2. **Tüketici grupları:** `XREADGROUP` ile paralel worker ölçeklemesi ve mesaj kimlikleriyle **yeniden okunabilir**, **onaylanabilir (ack)** bir tüketim hattı.
3. **Decoupling:** API yalnızca `XADD` ile stream’e yazar; worker ayrı süreçte okur. API, veritabanı yazma süresine **kilitlenmez** — bu, P95 bütçesinin korunmasına doğrudan yardım eder.

Özet: Redis Streams, “hemen çalışan, anlaşılır, ileride daha büyük bir kuyruğa evrilebilir” bir **sınır katmanı**dır.

---

## Neden TimescaleDB?

Olaylar doğası gereği **zaman serisi**: `occurred_at` ekseninde yoğun insert ve “son bir saat / son bir gün” pencereleriyle sorgular beklenir. Klasik ilişkisel tabloda bu, indeks ve tablo büyümesiyle birlikte operasyonel acı verir.

**TimescaleDB**, PostgreSQL uyumluluğunu koruyarak hypertable ve bölümleme ile bu iş yükünü ürünleştirir. SQL ekosistemi, yedekleme ve şema evrimi “bilinen dünya”da kalır.

**Gerçek dünya müdahalesi:** Hypertable oluştururken TimescaleDB, partition sütunu (`occurred_at`) ile **birincil anahtar / benzersiz kısıt uyumu** ister. İlk taslakta yalnızca `id` ile PK önerilmişti; migrasyon gerçek veritabanında çalıştırılınca hata verdi ve model **bileşik PK `(id, occurred_at)`** ile düzeltildi. Bu, “Postgres = Timescale” varsayımının nerede kırıldığının somut örneğidir.

---

## Uçtan uca akış

1. İstemci `POST /api/v1/events` ile **Zod** ile doğrulanmış bir olay gönderir.
2. API **202 Accepted** döner ve zarfı Redis stream’e (`XADD`) yazar.
3. Worker stream’den **tüketici grubu** ile okur, TimescaleDB’ye yazar, başarıda **ack** eder.
4. Metrik ve anomali mantığı veritabanı üzerinden çalışır; canlı his için worker **pub/sub** ile yayınlar, API süreci WebSocket istemcilerine iletir.

Bu zincirde “P95 &lt; 200 ms” beklentisi özellikle **adım 1–2** için tanımlanır: doğrulama + enqueue + HTTP yanıtı. Veritabanı insert süresi, istemcinin beklediği kritik yolun dışına alınır.

---

## Yük testi ve başarı ölçütü: `load-gen` + P95

Projede **`npm run load-gen`** (`scripts/load-gen.ts`), Appendix A ile uyumlu rastgele `page_view`, `purchase`, `error`, `system_health` olaylarını hedef URL’ye gönderir. Varsayılanlar kabaca **100 istek/saniye** hedefi ve binlerce toplam istek üzerinden **sürdürülebilir basınç** üretmek içindir; çalışma sonunda özet istatistik (başarılı/başarısız sayıları, süre, **ortalama** yanıt süresi, gerçekleşen evt/s) yazdırılır.

**Başarı kriteri (vaka / mimari hedef):** Kabul katmanında **P95 gecikme &lt; 200 ms** — yük altında bile çoğu istemci hızlı bir kabul görmelidir.

- `load-gen` çıktısındaki **ortalama ms**, regresyon ve kabaca sağlık için kullanışlıdır; tek başına P95 yerine geçmez.
- **P95’i resmileştirmek** için üretim öncesi ortamda `autocannon`, `k6` veya eşdeğer bir araçla histogram üretmek ve hedefi oradan doğrulamak en doğru yaklaşımdır.

Pratik kullanım: API ve altyapı ayağa kalktıktan sonra `TOTAL` ve `RATE` ortam değişkenleriyle senaryoyu büyütün; P95’i ayrıca ölçtüğünüzde, **200 ms çizgisinin altında kalma** hedefiyle kıyaslayın.

---

## Özet

EventPulse yolculuğu, “hızlı bir REST API”den fazlasıdır: **zaman serisi**, **stream tabanlı gevşek bağlantı**, **asıl kaynak (TimescaleDB)** ve **gerçek zamanlı gözlem** katmanlarının bilinçli sıralanmasıdır. Redis Streams ve TimescaleDB seçimleri sihir değildir; birlikte, iki milyonluk ölçeği **parçalayarak** yönetilebilir bir mimari sunar — ve kabul tarafında **P95 &lt; 200 ms** beklentisi, bu tasarımın ölçülebilir sınavıdır.

**İlgili belgeler:** [`docs/architecture.md`](architecture.md), [`docs/api.md`](api.md), [`docs/ai-strategy.md`](ai-strategy.md).
