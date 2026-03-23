# EventPulse — Mimari Kararlar ve Gerekçeler

Bu belge, EventPulse platformunun teknik mimarisini, alınan kararları ve bu kararların iş ve operasyonel gereksinimlere nasıl karşılık verdiğini özetler.

---

## 1. Genel mimari stratejisi

### Olay güdümlü ve mikroservis dostu yapı

Sistem, **olay güdümlü (event-driven)** bir akış üzerine kurulur: üretilen her olay kaydedilir, işlenir ve tüketiciler (worker’lar, analitik servisler) bu olaylara göre bağımsız ölçeklenir. Bu yaklaşım:

- Yoğun yazma trafiğini okuma/analiz yükünden ayırır.
- Bileşenlerin sürümleme ve dağıtımını birbirinden koparır (**loose coupling**).
- İleride belirli sınırlar içinde **mikroservis**lere bölünmeyi mümkün kılar; başlangıçta monolit içinde modüler sınırlar (API, servis, repository/worker) korunur.

### Ingestion API — Node.js ve Fastify

Giriş katmanı **Node.js** üzerinde **Fastify** ile uygulanır.

| Gerekçe | Açıklama |
|--------|----------|
| Düşük overhead | Fastify, minimal soyutlama ile yüksek istek/saniye kapasitesi sunar; saf HTTP/JSON ingestion senaryolarında framework maliyeti düşüktür. |
| Asenkron I/O | Olay kabulünde disk/ağ I/O’su baskındır; Node.js’nin olay döngüsü ve asenkron modeli, bağlantı başına thread tüketimini sınırlar. |
| Throughput | Yüksek eşzamanlı bağlantı ve kısa süreli iş yüklerinde, senkron thread modeline kıyasla ölçeklenebilirlik avantajı sağlar. |

Ingestion API’nin sorumluluğu: isteği doğrulamak, kalıcılık veya iş kuyruğuna aktarımı güvenilir şekilde başlatmak ve mümkün olan en kısa sürede yanıt dönmektir (aşağıda performans hedefi).

---

## 2. Veri depolama ve ölçeklenebilirlik

### TimescaleDB (PostgreSQL tabanlı)

**TimescaleDB**, PostgreSQL uyumluluğunu korurken zaman serisi iş yükleri için optimize edilmiş bir uzantıdır.

- **Hypertable** modeli, zaman ve isteğe bağlı bölümleme anahtarına göre veriyi parçalar; milyonlarca satırda bile yazma ve zaman aralığına göre sorgulama performansını yönetilebilir tutar.
- SQL ekosistemi, şema evrimi ve operasyonel olgunluk (yedekleme, replikasyon, izleme) açısından kurumsal kullanıma uygundur.
- Olay akışının **kalıcı kaynak doğruluğu (source of truth)** olarak PostgreSQL/TimescaleDB kullanılması, raporlama ve denetim için uygundur.

### Redis

**Redis**, yüksek hızlı bellek içi erişim gerektiren kullanım alanları için kullanılır:

- **Anlık anomali tespiti** ve **kayan pencere (sliding window)** sayım/limit hesapları.
- Sık erişilen meta veriler veya agregasyon sonuçları için **önbellekleme (caching)**.
- Kuyruk ve geçici durum için düşük gecikmeli bir katman olarak TimescaleDB ile tamamlayıcı rol.

---

## 3. Güvenilirlik ve dayanıklılık

### Redis Streams (mesaj kuyruğu)

**Redis Streams**, API ile arka plan **worker** katmanını birbirinden ayırır (**decoupling**).

- API, olayı kabul edip akışa yazar; iş ağır veya yavaş olsa bile ingestion yanıtı akışa yazımın başarısına bağlı kısaltılabilir.
- Kısa süreli kesintilerde, tüketilmemiş mesajlar akışta kalır; doğru **consumer group** ve onay (ack) modeliyle **veri kaybı riski** azaltılır.
- Worker ölçeklemesi, API trafiğinden bağımsız yapılabilir.

### Dead Letter Queue (DLQ)

İşlenemeyen veya sürekli hata veren olaylar, tanımlı bir **yeniden deneme (retry)** politikasının ardından — örneğin **en fazla 3 deneme** sonrası — **DLQ**’ya yönlendirilir.

- Ana işleme hattının tıkanması engellenir.
- Hatalı yükler izole edilerek incelenir, düzeltme veya yeniden oynatma (replay) ile yönetilir.
- Operasyonel görünürlük: “sistem sessizce yutuyor mu?” sorusuna net bir ayrım sağlar.

---

## 4. Performans hedefleri

### Ingestion API — P95 gecikme (hedef: 200 ms altı)

**P95 gecikmesinin 200 ms altında tutulması** bir **tasarım ve operasyon hedefidir**; tek başına bir framework seçimi matematiksel garanti vermez. Bu hedefe uygunluk şu tasarım seçimleriyle **desteklenir**:

1. **Hafif runtime ve framework** (Fastify) ile istek başına işlem maliyetinin düşürülmesi.
2. **Senkron ağır iş yükünün API’den çıkarılması**: ağır işlemler kuyruk + worker’a devredilir; API mümkün olduğunca doğrulama ve enqueue ile sınırlı kalır.
3. **Dockerize** edilmiş dağıtımda tutarlı kaynak limitleri, sağlık kontrolleri ve yatay ölçekleme ile trafiğin düğümlere dağıtılması.
4. **Ölçüm**: üretimde P95/P99 izlenmesi, darboğazların (DB, Redis, ağ) proaktif tespiti.

Hedef, yük testleri ve gerçek trafik profiline göre sürekli doğrulanmalıdır.

---

## 5. Geliştirme standartları

### TypeScript ve tip güvenliği

Kod tabanı **TypeScript** ile yazılır; **katı tip güvenliği** (ör. `any` kullanımından kaçınma, veri yapıları için açık `interface` / `type` tanımları) **senior mühendislik disiplini** olarak benimsenir.

- API sözleşmeleri, kuyruk yükleri ve veritabanı eşlemeleri tipler üzerinden belgelenir.
- Refaktör ve çok geliştiricili çalışmada hata maliyeti düşer.
- Çalışma zamanı doğrulaması (ör. Zod / TypeBox) ile tip ve şema birlikte kullanılarak sınır katmanları güçlendirilir.

---

## Özet

| Alan | Seçim | Ana gerekçe |
|------|--------|-------------|
| Giriş katmanı | Fastify (Node.js) | Düşük overhead, asenkron I/O, yüksek throughput potansiyeli |
| Kalıcı zaman serisi | TimescaleDB | Hypertable ile ölçeklenebilir zaman serisi ve PostgreSQL ekosistemi |
| Hızlı durum / kuyruk | Redis + Streams | Önbellek, pencereli hesaplar, güvenilir decoupling |
| Dayanıklılık | Retry + DLQ | Ana hattın korunması ve hatalı olayların yönetilebilirliği |
| Kalite çubuğu | TypeScript (strict) | Sürdürülebilirlik ve üretim güvenliği |

Bu belge, `docs/api.md` ve dağıtım/runbook dokümanlarıyla birlikte okunmalıdır; somut endpoint’ler ve altyapı diyagramları ilgili dosyalarda güncellenir.
