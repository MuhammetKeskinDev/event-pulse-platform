# EventPulse: Tasarımdan WebSocket’e Teknik Yolculuk

Bu yazı, EventPulse platformunun nasıl tasarlandığını ve “senior” seviyesinde hangi teknik seçimlerin neden yapıldığını, uçtan uca bir teknik makale düzeninde anlatır. Hedef okuyucu, olay akışı, zaman serisi ve gerçek zamanlı panel kavramlarına aşina bir yazılım mühendisidir.

## Problem çerçevesi

EventPulse, yüksek hacimli olayları kabul eden, güvenilir biçimde işleyen ve operatörün durumu görebileceği bir sistem olarak kurgulandı. Kısıtlar tipik bir vaka çalışmasına benzer: kısa sürede işler bir ürün çıkmalı, ölçek ve gecikme hedefleri (örneğin kabul katmanında düşük P95) göz önünde bulundurulmalı ve ileride servis sınırları genişletilebilmelidir.

Bu çerçeve, “tek bir dev süreç” yerine **gevşek bağlı** bileşenlere yönelmeyi zorunlu kılıyor: API hızlı karar vermeli, ağır iş yükü ertelenmeli, kalıcı durum tek bir yerde toplanmamalı.

## Mimari omurga: olay güdümlü ve katmanlı yapı

İlk karar, giriş katmanının sorumluluğunu daraltmaktı: doğrulama, sıraya alma ve hızlı yanıt. İş mantığının tamamı API sürecinde çözülmemeli; aksi halde hem ölçek hem de hata izolasyonu zorlaşır. Bu nedenle **API → (kuyruk) → worker → veritabanı** ayrımı temel alındı.

Bu ayrımın somut karşılığı: HTTP tarafında **202 Accepted** ile erken yanıt ve asenkron işleme beklentisi. Böylece istemci beklerken veritabanı kilidi veya ağır agregasyonlarla sınırlanmıyoruz.

## Neden Redis Streams?

Kuyruk için Redis Streams seçilmesinin birkaç gerekçesi var. Birincisi, zaten **düşük gecikmeli** bir altyapı (Redis) içinde kalınarak operasyonel karmaşıklığın sınırlanması. İkincisi, Streams’in **tüketici grupları** ve mesaj kimlikleri ile “en az bir kez” işlemeye yakın pratik bir model sunması: API yayımlar, worker grubu okur, başarılı işlemden sonra onay (ack) verilir.

Üçüncüsü, vaka ölçeğinde Kafka kadar ağır bir dağıtık kuyruk kurmadan **decoupling** elde edilmesi. Streams, EventPulse gibi prototipten üretime geçişte makul bir orta yol sunar; ileride gerekirse daha büyük bir mesajlaşma sistemine evrilirken de desen benzer kalır.

Özetle: Redis Streams, “hemen çalışan, anlaşılır ve genişletilebilir” bir mesaj sınırı sağlar.

## Neden TimescaleDB (PostgreSQL üzerinde)?

Olay verisi doğası gereği **zaman serisi**dir: `occurred_at` ekseninde yoğun yazma ve aralık sorguları beklenir. Saf ilişkisel tabloda bu yük, indeks ve tablo şişmesiyle yönetilir; TimescaleDB ise **hypertable** ve bölümleme ile bu iş yükünü ürünleştirir.

Aynı zamanda PostgreSQL uyumluluğu, SQL ekosistemi, yedekleme ve şema evrimi gibi konularda “bilinen” bir zemini korur. EventPulse’ta `events` tablosu hypertable’a dönüştürülürken, TimescaleDB’nin **partition anahtarını benzersiz kısıtlarla uyumlu** tutma zorunluluğu (örneğin birincil anahtarda `occurred_at` bulunması) gerçek bir mühendislik geri bildirimi olarak ortaya çıktı; bu kısıt, veri modelinin tasarımını şekillendirdi.

## Ingestion API ve doğrulama

Fastify + TypeScript + Zod kombinasyonu, düşük framework overhead’i ile **katı sözleşme** tanımını birleştirir. Olay türleri discriminated union ile ayrılır; böylece “geçerli JSON ama anlamsız alanlar” sınıfı erken elenir. Pino ile yapılandırılmış loglama, üretimde izlenebilirlik için zorunlu görülür.

## Worker ve dayanıklılık

Worker, stream’den okur, kural motoru (örneğin kritik hata uyarısı) çalıştırır ve TimescaleDB’ye yazar. Başarısız kalıcı yazmalarda mesajın **ack edilmemesi**, tekrar deneme için pending durumda kalmasını sağlar; zehirli veya bozuk mesajlarda ise sonsuz döngüyü önlemek için ayrı bir strateji (örneğin ack + log) gerekir. Bu ayrım, “asla kaybetme” ile “sistemi kilitleme” arasındaki gerçekçi dengeyi yansıtır.

## Metrikler ve panel

Toplanan olaylar üzerinden son bir saatlik dağılım ve hata oranı gibi özetler, operatör için tek endpoint altında sunulur. İlk aşamada panel, periyodik yenileme ile beslenebilir; ancak gerçek zamanlı his için **WebSocket** katmanı eklenir.

## WebSocket entegrasyonu: çok süreçli gerçeklik

API süreci ile worker süreci ayrı olduğundan, “worker her işlemde doğrudan WS istemcisine yazamaz”. Pratik çözüm: worker **Redis pub/sub** ile yayın yapar, API süreci abone olur ve bağlı WebSocket istemcilerine iletir. Böylece gerçek zamanlı güncelleme, süreçler arası gevşek bağlantıyı bozmaz.

Frontend tarafında Vite proxy ile geliştirme ortamında `/ws` yolu backend’e yönlendirilir; üretimde ise açık `VITE_WS_BASE` gibi yapılandırmalarla aynı desen korunur.

## Anomali tespiti (FR-09)

Dakika bazlı toplam hacim için son on beş dakikanın örneklem ortalaması ve standart sapması hesaplanır; son tamamlanmış dakikanın hacmi **üç sigma** eşiğini aştığında kayıt oluşturulur. Bu, basit ama açıklanabilir bir istatistiksel kuraldır; işletmede daha gelişmiş modellerle değiştirilmeye açıktır.

## Son söz

EventPulse’un yolculuğu, “hızlı API”den öte, **zaman serisi**, **kuyruk**, **asıl kaynak (veritabanı)** ve **gerçek zamanlı gözlem** katmanlarının bilinçli sıralanmasıdır. Redis Streams ve TimescaleDB seçimleri tek başına sihir değildir; birlikte, senior düzeyde bir olay platformunun iskeletini makul karmaşıklıkta sunar.
