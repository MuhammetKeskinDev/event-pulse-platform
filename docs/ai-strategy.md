# Yapay Zekâ ile Çalışma Stratejisi — EventPulse

> **Özet ilke:** AI’nın kod tamamlama hızından yararlanırken, mimari kararları ve veri bütünlüğü kurallarını manuel denetliyorum.

Bu metin, EventPulse vaka çalışması sırasında üretken yapay zekâ araçlarını nasıl konumlandırdığımı ve hangi riskleri bilinçli olarak üstlendiğimi özetler. Amaç, “AI her şeyi doğru bilir” varsayımını reddedip, **hız kazanımı ile mühendislik disiplini** arasında sürdürülebilir bir denge tanımlamaktır.

## Süreç analizi — tablo yalnızca ilk blok (AI-001 – AI-012)

Tam kronoloji **`docs/ai-log.md` içinde AI-001’den AI-020’ye** kadar tek tek kayıtlıdır; bu bölümdeki tablo ise **bilinçli olarak yalnızca AI-001 – AI-012** fazlarını özetliyor (ilk ingestion → test/seed aşaması). **AI-013 – AI-020** (final sprint, FR-05/12, mimari refaktör, dokümantasyon vb.) aynı dosyada ayrı başlıklar halinde duruyor; burada satır satır tekrar etmiyorum.

Özet: Başlıkta “→ AI-012” ifadesi, **bu tablonun kapsadığı aralık**tır; “tüm proje AI-012’de bitti” anlamına gelmez.

### Fazlar ve AI’nın katkısı

| Dönem | Odak | AI’nın güçlü olduğu alan |
|--------|------|---------------------------|
| **AI-001–002** | Stack seçimi, mimari belge | Teknoloji karşılaştırması, `docs/architecture.md` iskeleti, tablolar ve tutarlı anlatı |
| **AI-003** | Altyapı | `docker-compose.yml` servis tanımları, healthcheck, volume ve ortam değişkeni kalıpları (tekrarlayan YAML) |
| **AI-004** | Ingestion API | Fastify eklenti kaydı, `POST /api/v1/events`, Zod discriminated union, pino yapılandırması |
| **AI-005** | Worker + hypertable | Stream tüketici iskeleti, `XREADGROUP` / insert / ack akışı, SQL migrasyon taslağı |
| **AI-006–007** | Metrikler + panel | Paralel SQL sorguları, `Cache-Control`, React + Recharts bileşenleri, Vite proxy |
| **AI-008–010** | Anomali + WebSocket + P1 | SQL job mantığı, WS hub, Redis pub/sub köprüsü, dashboard parçaları |
| **AI-011–012** | Test ve yardımcı scriptler | Vitest test dosyaları, `load-gen` / `seed-db` üretimi |

Bu tabloda görülen ortak tema: **boilerplate, tekrarlayan entegrasyon kabloları ve belge yapısı** AI ile hızlanır; kararın *doğruluğu* ise ayrı bir doğrulama katmanına ihtiyaç duyar.

### Nerede hız kazandı? (Boilerplate ve hacim)

- **API ve şema:** Rota iskeleti, hata yanıtı biçimleri, Zod şemaları ve TypeScript tipleri elle yazılsa saatler sürer; AI çıktısı çoğunlukla doğrudan derlenip küçük revizyonla kullanılabilir.
- **Docker ve dokümantasyon:** Compose servisleri, portlar ve healthcheck’ler standart kalıplardır; mimari özeti ve API dokümanı için tutarlı başlık hiyerarşisi hızlı üretilir.
- **Frontend:** Chart bileşenleri, poll hook’ları ve stil iskeleti tekrarlanan UI işidir; iş mantığı API sözleşmesine kilitlendiğinde entegrasyon maliyeti düşer.
- **Test ve script:** Birim test örüntüleri ve `fetch` döngülü yük üreticisi, model için düşük bağlamlı ama yüksek hacimli çıktıdır.

### Nerede yanıldı? (TimescaleDB ve kütüphane yüzeyi)

**TimescaleDB hypertable birincil anahtarı (AI-005):** İlk migrasyon taslağında `events` için yalnızca `id` üzerinden birincil anahtar önerilmişti. TimescaleDB, partition sütunu (`occurred_at`) olmadan hypertable üzerinde beklenen benzersiz kısıt / PK düzenine izin vermez. Hata, “kötü niyet” değil **uzantıya özgü kuralın model bağlamında eksik kalmasıdır**; PostgreSQL ile aynı SQL’i düşünürken ortaya çıkan tipik bir tuzak.

**ioredis / `XREADGROUP` argüman sırası:** TypeScript imzaları ile gerçek komut sözdizimi arasında uyumsuzluk yaşandı. Bu, “tahmin edilen API” yerine **gerçek kütüphane dokümantasyonu ve çalışan bir çağrı** ile doğrulanması gereken bir yüzeydir.

### Developer müdahalesi: ne yaptım?

1. **Gerçek motor üzerinde migrasyon:** Şemayı dosyada tartışmak yetmez; `psql` / Docker içi çalıştırma ile TimescaleDB’nin reddettiği PK düzenini erken gördük ve **bileşik birincil anahtar `(id, occurred_at)`** ile düzelttik.
2. **Tek doğruluk kaynağı:** Kuyruk ile veritabanı sınırını ve 202 Accepted semantiğini yazılı tutarak AI’nın ara sıra önerdiği “tek süreçte her şey” kısayolunu reddettik.
3. **Entegrasyon testi kapısı:** `RUN_INTEGRATION=1` ile Redis + Postgres açıkken ingestion yolunun gerçekten stream’e yazdığını doğrulayan test (AI-011), regresyon maliyetini düşürür.
4. **Yük ve seed:** `load-gen` ile şemaya uygun trafik; `seed-db` ile panel ve metriklerin boş olmayan bir ortamda değerlendirilmesi — ikisi de tekrarlanabilir operasyonel disiplin.

Özetle: developer rolü, AI çıktısını **taslak** kabul edip **şema kurallarına, üretici dokümantasyona ve çalışan ortama** karşı kilitlemektir.

## Üretkenlik ve sorumluluk ayrımı

Yapay zekâdan en çok **kod tamamlama, iskelet üretimi ve tekrarlayan uygulama detaylarında** yararlanıyorum: Fastify rotaları, Zod şemaları, Docker Compose iskeleti, React bileşenleri ve TypeScript tipleri gibi alanlarda akışı hızlandırıyor. Bu katmanda hedef, elle yazılması uzun sürecek ama görece düşük bağlam gerektiren işleri makul bir kalite çubuğuyla otomatikleştirmektir.

Buna karşılık **mimari kararları**, **veri modeli ve bütünlük kurallarını** ve **üretimde geri dönüşü maliyetli** seçimleri **manuel denetliyorum**. Örneğin: hypertable birincil anahtarının partition sütununu içerme zorunluluğu, tüketici grubu ile mesaj teslim semantiği, anomali tespitinde baseline penceresinin anlamı veya WebSocket ile ayrı worker süreci arasında köprü tasarımı — bunlar yalnızca “çalışan kod” değil, sistemin davranış sözleşmesidir. AI önerisini kabul etmeden önce dokümantasyonla (TimescaleDB, Redis Streams, Fastify) çapraz kontrol ve mümkünse gerçek veritabanına karşı migrasyon denemesi yapıyorum.

## Çalışma ritmi: küçük adımlar, hızlı doğrulama

Pratikte görevleri mümkün olduğunca **atomik** parçalara bölüyorum: önce migrasyon, sonra API, sonra worker, sonra arayüz gibi. Her adımda mümkün olan en kısa geri bildirim döngüsünü hedefliyorum — örneğin `docker compose` ile gerçek TimescaleDB’ye SQL uygulamak, `tsc --noEmit` ile tip güvenliğini kilitlemek veya Vite derlemesini çalıştırmak. Bu ritim, yapay zekânın ürettiği büyük diflerin “görsel olarak doğru” görünüp çalışma zamanında patlamasını erken yakalamaya yarar.

Ayrıca **tek bir doğruluk kaynağı** ilkesini koruyorum: olayların kalıcı gerçeği veritabanındadır; kuyruk ise teslimat ve gevşek bağlantı içindir. AI bazen bu sınırı bulanıklaştıran kısayollar önerebilir (örneğin her şeyi tek süreçte toplamak). Mimariyi net yazmak ve her özellik için “veri nerede yaşar?” sorusunu cevaplamak, hem insanı hem modeli aynı çizgide tutuyor.

## Disiplin araçları: kurallar ve günlük

Projede `.cursorrules` ve `docs/ai-log.md` dosyaları, yapay zekânın **tutarlı bir çerçevede** çalışmasına yardımcı olmak için kullanıldı: teknoloji yığını, katmanlı mimari, olay güdümlü kabul modeli ve loglama beklentileri yazılı kaldı. Her anlamlı teslimattan sonra AI günlüğüne kategori, bağlam ve doğrulama notu düşmek, hem ileride denetlenebilir bir iz bırakıyor hem de “o an AI ne sandı, gerçekte ne oldu” ayrımını netleştiriyor.

Günlük kayıtları aynı zamanda **düzeltme anlarını** görünür kılıyor: kullanıcı veya veritabanı geri bildirimiyle yapılan değişiklikleri “Your Modifications” veya bağlam paragraflarında saklamak, ileride “neden bileşik anahtar var?” sorusuna tek satırla cevap vermeyi kolaylaştırıyor. Bu, yapay zekâ çıktısını “nihai gerçek” olarak değil, **tartışılmış bir taslak** olarak konumlandırmanın pratik bir yoludur.

## Ne yapmıyorum (bilinçli sınırlar)

Tam otonom, gözetimsiz dağıtım veya güvenlikle ilgili varsayımları sessizce kabul etme çizgisini çizmiyorum. Üretilen örnek şifreler veya geliştirici dostu gevşek ayarlar, repoda kalsa bile üretim kontrol listesinde yeniden ele alınmalıdır. Yapay zekâ hızlı prototip üretir; **tehdit modeli ve uyumluluk** ise bağlamına göre insan sürecinin parçası kalmalıdır.

Aynı şekilde, “tüm edge case’leri kapsayan” iddiasına güvenmiyorum. Özellikle mesaj sırası, yeniden deneme, zehirli mesaj ve tüketici grubu pending durumları gibi konularda kod okuma ve gerektiğinde küçük deneyler şart.

## Dürüst hata örnekleri ve kısıtlar

**AI-005 (Worker ve kalıcılık)** aşamasında, ilk migrasyon taslağında `events` tablosu için yalnızca `id` üzerinden birincil anahtar tanımlanmıştı. TimescaleDB, hypertable partition sütunu (`occurred_at`) olmadan benzersiz indeks / birincil anahtar oluşturulmasına izin vermedi; hata üretimde değil, `psql` ile migrasyon çalıştırılırken ortaya çıktı. Bu, yapay zekânın “Postgres gibi görünen” ama **uzantıya özgü kısıtları** her zaman içselleştirmediğini gösteren tipik bir örnektir. Çözüm, bileşik birincil anahtar (`id`, `occurred_at`) ve insert tarafında uyumlu yazım modeli oldu — fakat **ilk taslak “yanlış” değildi, eksik bağlamdı**; düzeltme insan denetimi ve gerçek motor geri bildirimiyle geldi.

Benzer şekilde, Redis `XREADGROUP` çağrısında TypeScript imzaları ile komut argüman sırası uyuşmazlığı yaşandı; bu da “kütüphane yüzeyini” tahmin etmek ile **gerçek tipleri okumak** arasındaki farkı hatırlatıyor.

Daha genel kısıtlar şunlar:

- **Bağlam penceresi:** Uzun dosyalar veya çok adımlı iş akışlarında model, önceki kararları unutabilir veya çelişen öneriler üretebilir.
- **Niş doğruluk:** Sürüm bağımlı API’ler, migrasyon sırası ve ortam farkları (Windows / Docker) için her zaman güvenilir değil.
- **Güvenlik ve gizlilik:** Üretilen kodda varsayılan şifreler veya gevşek CORS gibi konuları özellikle gözden geçiriyorum.

## Öğrenme döngüsü: hata → kural → tekrar etmeme

Her “AI hatası” aslında iki parçalı bir olaydır: modelin eksik tahmini ve insanın o ana kadar **otomatikleştirmediği** bir kontrol adımı. AI-005’teki hypertable kısıtı, bundan sonra benzer migrasyonlarda “partition anahtarı birincil anahtarda mı?” sorusunu zihinsel kontrol listesine ekledi. Benzer şekilde, Redis komut sırası veya WebSocket ile çok süreçli mimaride pub/sub ihtiyacı gibi konular, bir kez canlı ortamda veya entegrasyon testinde görüldükten sonra **dokümantasyona ve günlüğe** işlenerek kurumsal hafızaya dönüşüyor.

Bu stratejinin ölçütü yalnızca “daha az yazmak” değil; **daha az yanlış tekrarlamak** ve hataları mümkün olduğunca ucuz aşamada yakalamaktır. Üretken yapay zekâ, bu döngüyü hızlandırır — ama döngünün sahibi yine geliştirici ekibidir.

## Teslimat sonrası: export, PDF ve dokümantasyon (ben nereye dokundum?)

Kronoloji tablosu AI-012’ye kadar ilk sprinti özetliyor; sonrasında **FR-12 export**, **kurallar CRUD**, **Active Alerts**, PDF’te **stream ile gönderim**, **export `limit` tavanının kalkması** ve dashboard’da **system health’in üste alınması** gibi işler geldi. Bu parçalarda AI yine iskelet ve diff hızı sağladı; ben özellikle şunları kendim netleştirdim:

- **İkili yanıt / PDF:** “Çalışıyor gibi” görünüp **500** dönen edge case’leri logdan takip ettim; PDF’i `Readable` ile vermek bu sınıfta stabilite sağladı.
- **Limit politikası:** Sabit 10 000 tavanını ben kaldırmak istedim — büyük export’un maliyetini bilerek API tüketicisine bıraktım (`Number.MAX_SAFE_INTEGER` sadece JS güvenli tam sayı sınırı).
- **Dokümantasyon:** Kök README’yi **uzun ve birinci şahıs** yazdım; `walkthrough` ve `architecture`’a “güncel repo” notları ekledim ki walkthrough yalnızca ingestion hikâyesi sanılmasın. `api.md` ve `frontend/README` aynı hikâyeyi destekliyor.

Bu bölümü, `docs/ai-log.md` içindeki **AI-020** kaydı ile birlikte okursanız, “model ne üretti / ben ne onayladım” ayrımı güncel kalır.

## Sonuç

EventPulse deneyiminde yapay zekâ, **kod tamamlama hızından** ve tekrarlayan uygulama işinden güçlü biçimde yararlanılan bir ortaktır; oysa **mimari kararları** ile **veri bütünlüğü ve şema kurallarını** bilinçli olarak **manuel denetliyorum**. Bu ayrımı yazılı ve günlüklenmiş tutmak, hem ekip içi beklentiyi netleştiriyor hem de gelecekteki benzer projelerde aynı tuzaklara düşme olasılığını azaltıyor.

Özetle: AI’dan hız ve çeşitlilik alıyorum; **sınırları, tutarlılığı ve üretim güvenliğini** insan gözüyle onaylıyorum — ve bazen en iyi geri bildirim kaynağı, çalışan bir migrasyon çıktısı veya gerçek bir veritabanı hata mesajı oluyor.
