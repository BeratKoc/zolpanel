# Zolpanel — Detaylı Ürün Analizi & Yol Haritası
*Tarih: 2026-06-21 · Bağlam: tek-VDS yönetim paneli, Next.js 15 + TS + better-sqlite3, Caddy + PM2 entegrasyonu*

## 0. Yönetici Özeti

Zolpanel bugün **tek bir sunucuda Caddy domainlerini + PM2 süreçlerini yöneten, metrik/log/bellek izleyen** sağlam, modern (Next.js, TS, i18n 6 dil, responsive, CI, gerçek SSL durumu, testli) bir iç araç. Mimari temiz, güvenlik temeli iyi (Zod, JWT invalidation, execFile, rate-limit).

**Ama** sektörde tanınan self-host panelleri (Coolify, Dokploy, CapRover, Ploi/Forge, Easypanel) ile kıyaslayınca Zolpanel henüz bir **"deploy platformu" değil, bir "sunucu kontrol paneli"**. En büyük boşluk: **Git'ten uygulama deploy etme** (build → çalıştır) yok, **Docker yönetimi** yok (oysa sunucun 10+ konteyner çalıştırıyor), ve **tek sunucu / tek kullanıcı** ile sınırlı.

Tanınır olmanın yolu ya **(A) net bir niş** ("Caddy-native, hafif, solo-dev paneli") ya da **(B) deploy-platformu özelliklerini yakalamak**tan geçer. İkisi birleştirilebilir.

---

## 1. Mevcut Güçlü Yönler (üstüne inşa edilecek)

- **Caddy-native:** Otomatik HTTPS + basit reverse-proxy. Çoğu panel Nginx/Traefik'i zorlama Caddy entegrasyonuyla yapar; Zolpanel Caddy-öncelikli — gerçek bir farklılaşma tohumu.
- **Modern, bakımı kolay stack:** Next.js App Router + TS + better-sqlite3 (senkron, race-free) + Zod + next-intl. Tek uygulama, tek deploy.
- **Kalite altyapısı:** birim + Playwright E2E (mobil dahil), GitHub Actions CI, deploy.sh (yedek+rollback), tasarım sistemi (MASTER.md), responsive, 6 dil.
- **Güvenlik temeli:** JWT (tokenVersion invalidation), Zod injection koruması, `execFile` (shell yok), rate-limit, gerçek SSL handshake kontrolü.
- **Düşük kaynak:** Tek Node process + dosya DB. 31GB RAM'in 2GB'ını kullanan bir sunucuda tüy gibi.

---

## 2. Eksikler & Zayıflıklar (kategorize)

### 2.1 Ürün / Özellik (en kritik boşluk)
- **Git-push / Git-bağlantılı deploy YOK.** Sektörün "olmazsa olmaz"ı: repo bağla → otomatik build (Nixpacks/Dockerfile/buildpack) → çalıştır → otomatik SSL. Şu an kullanıcı uygulamayı elle kurup PM2'ye veriyor.
- **Docker yönetimi YOK.** Sunucun zaten 10+ konteyner (zolvix, schema-mapper) çalıştırıyor; panel bunları sadece bellekte *görüyor*, yönetemiyor (start/stop/logs/exec).
- **Veritabanı servisi sağlama YOK.** Postgres/MySQL/Redis tek tıkla oluşturma (Coolify/Easypanel'in çekirdek özelliği) yok.
- **Uygulama şablonları / one-click apps YOK** (Ghost, n8n, Plausible, Umami, Postgres…). Tanınırlığın en hızlı yolu.
- **Web terminal / dosya yöneticisi / cron UI YOK** (daha önce (b) seçeneğinde konuşulmuştu).
- **Ortam değişkeni (env) yönetimi YOK** — uygulama başına .env UI'dan yönetilemiyor.

### 2.2 Güvenilirlik / Operasyon
- **Otomatik yedek YOK** (sunucuda cron yok). Panel DB'si, Caddyfile, uygulama verisi yedeklenmiyor. Tek-tık veya zamanlanmış backup + restore büyük eksik.
- **İzleme/alarm YOK.** memoryTracker leak'i logluyor ama bildirim (e-posta/Telegram/webhook) yok. Servis/domain düşünce kimse haberdar olmuyor. Uptime monitor + alert kanalı sektör standardı.
- **Audit log YOK.** "Kim, ne zaman, hangi domaini sildi" izlenmiyor (logs var ama eylem-bazlı denetim değil).
- **Health-check / otomatik restart politikası** panelden tanımlanamıyor.

### 2.3 Güvenlik (sertleştirme)
- **Tek kullanıcı, rol YOK.** admin/viewer ayrımı, ekip, RBAC yok.
- **2FA (TOTP) YOK.**
- **JWT localStorage'da** (XSS yüzeyi). httpOnly cookie + CSRF daha güvenli.
- **Sunucu sertleştirme entegrasyonu YOK:** fail2ban/ufw kapalı (sunucuda inactive); panel bunları kurup yönetebilir.
- **Sır yönetimi düz `.env`** — şifreleme/secret store yok.

### 2.4 Mimari / Teknik
- **Tek sunucu.** Çoklu sunucu (agent + merkezi kontrol) yok → ölçeklenmez.
- **Caddy'yi metin (string) ile yönetiyor.** Test edildi/güvenli ama Caddy Admin API (JSON) daha sağlam olurdu (ileride).
- **Arka plan işleri uygulama içinde** (instrumentation interval'leri). Çok sunucu/iş kuyruğu gerekince yetersiz kalır.
- **Gerçek zamanlı yok** — metrikler polling; WebSocket/SSE ile canlı akış (log tail, metrik stream) daha "ops paneli" hissi verir.

### 2.5 UX / Erişilebilirlik (tasarım sistemi sonrası iyi durumda)
- Dark-only (MASTER kararı — sorun değil ama bazı kullanıcı light ister).
- Grafikler basit sparkline; gerçek zaman-serisi grafikleri (CPU/RAM geçmişi, alan grafikleri) yok.
- Onboarding/kurulum sihirbazı yok (ilk kurulum hâlâ teknik).

### 2.6 İş / Go-to-Market
- **Açık kaynak değil / topluluk yok** (tanınırlığın #1 motoru self-host dünyasında GitHub yıldızı + Discord).
- **Tek-komut kurulum YOK** (`curl … | bash`). Coolify/CapRover bununla yayıldı.
- **Dokümantasyon/landing yok.** Marka, demo, ekran görüntüleri yok.

---

## 3. Rakip Karşılaştırması (kısa)

| Yetenek | Zolpanel | Coolify | Dokploy | CapRover | Ploi/Forge |
|---|---|---|---|---|---|
| Git-push deploy | ❌ | ✅ | ✅ | ✅ | ✅ |
| Docker/Compose yönetimi | ❌ (sadece okur) | ✅ | ✅ | ✅ | kısmi |
| One-click DB (PG/Redis…) | ❌ | ✅ | ✅ | ✅ | ✅ |
| One-click apps/şablonlar | ❌ | ✅ | ✅ | ✅ | ✅ |
| Otomatik SSL | ✅ (Caddy) | ✅ | ✅ | ✅ | ✅ |
| Çoklu sunucu | ❌ | ✅ | ✅ | kısmi | ✅ |
| Yedek + geri yükleme | ❌ | ✅ | ✅ | kısmi | ✅ |
| İzleme + alarm | kısmi | ✅ | ✅ | kısmi | ✅ |
| Ekip/RBAC | ❌ | ✅ | ✅ | kısmi | ✅ |
| Hafiflik / sadelik | ✅✅ | ❌ (ağır) | orta | orta | (SaaS) |
| **Caddy-native** | **✅✅** | ❌ | ❌ | ❌ | ❌ |

**Okunuş:** Zolpanel'in "olmazsa olmaz" kapsamında geniş açığı var (deploy, docker, db, şablon, backup, çoklu sunucu) ama **iki gerçek kozu** mevcut: **hafiflik/sadelik** ve **Caddy-native**.

---

## 4. "Sektörde Tanınır Olmak" İçin Özellik Yol Haritası

### Tier 1 — Parite (bunlar olmadan ciddiye alınmaz)
1. **Git-bağlantılı deploy** (en yüksek etki): GitHub/GitLab repo bağla → webhook ile build (önce Dockerfile, sonra Nixpacks/buildpack) → konteyner çalıştır → Caddy ile otomatik domain+SSL. *Zolpanel'in Caddy-native'liği burada otomatik-HTTPS deneyimini rakiplerden daha pürüzsüz yapabilir.*
2. **Docker yönetimi:** konteyner/Compose list-start-stop-restart-logs-exec; `dockerode` ile. Sunucu zaten Docker dolu → anında değer.
3. **One-click veritabanları:** Postgres/MySQL/Redis konteyner + bağlantı dizesi + otomatik yedek.
4. **Otomatik yedek + geri yükleme:** panel DB + Caddyfile + uygulama vol'ları; zamanlanmış + S3/B2 hedefi.
5. **Tek-komut kurulum:** `curl -fsSL get.zolpanel… | bash` (Docker + Caddy + panel). Yayılmanın anahtarı.

### Tier 2 — Farklılaştırıcılar (seni "tanınır" yapar)
6. **One-click app kataloğu** (Ghost, n8n, Plausible, Umami, Uptime-Kuma, Postgres, MinIO…): topluluk şablonları → en hızlı viral büyüme.
7. **İzleme + çok-kanallı alarm** (Telegram/Discord/e-posta/webhook): servis düştü, SSL bitiyor, disk %90, memory leak. memoryTracker zaten temel.
8. **Gerçek zamanlı log tail + canlı metrik** (WebSocket/SSE) + zaman-serisi grafikleri.
9. **Web terminal** (ws + node-pty) + **dosya yöneticisi** + **cron UI**.
10. **Ekip + RBAC + audit log + 2FA** — "production'da güvenle kullanılır" sinyali.

### Tier 3 — Vizyon / moonshot
11. **Çoklu sunucu** (agent mimarisi) → tek panelden N sunucu.
12. **Caddy-native edge özellikleri:** UI'dan rate-limit, basic-auth, IP allowlist, header/redirect kuralları, WAF-lite — Caddy'nin gücünü görselleştir (kimse bunu iyi yapmıyor).
13. **SaaS / multi-tenant** (managed Zolpanel) — gelir modeli.

---

## 5. Önerilen Strateji & Faz Planı

**Konumlandırma önerisi:** *"Caddy-native, hafif, solo geliştirici & küçük ekip için Git-push deploy paneli."* Coolify'ın ağırlığından ve karmaşıklığından kaçanlara sadelik + otomatik-HTTPS pürüzsüzlüğü vaat et.

**Faz A (parite çekirdeği, ~en kritik):** Docker yönetimi → Git-deploy (Dockerfile) → one-click DB → otomatik yedek. *(Sunucun zaten Docker dolu, en hızlı somut değer.)*
**Faz B (yayılma):** tek-komut kurulum + one-click app kataloğu + landing/docs + **açık kaynak + GitHub'da yayın**.
**Faz C (güven):** izleme/alarm + ekip/RBAC + 2FA + audit log + gerçek zamanlı log/metik.
**Faz D (ölçek):** çoklu sunucu (agent) + Caddy-edge özellikleri + (opsiyonel) SaaS.

**Hızlı kazanımlar (düşük efor, yüksek algı):**
- Otomatik yedek (cron + S3) — bir hafta sonu işi, devasa güven artışı.
- Telegram alarm (memoryTracker'a bağla) — küçük, "vay" etkisi yüksek.
- Tek-komut kurulum scripti — dağıtımın önünü açar.
- Caddyfile UI editörü (validate + reload zaten var) — Caddy-native kimliğini güçlendirir.

---

## 6. Tek Cümlelik Sonuç

Zolpanel teknik olarak sağlam ve **Caddy-native + hafiflik** ile gerçek bir niş kozu var; ama "sunucu kontrol paneli"nden **"deploy platformu"na** evrilmeden (Git-deploy + Docker + one-click DB/app + yedek + tek-komut kurulum + açık kaynak topluluk) sektörde tanınır olamaz. İyi haber: temel o kadar sağlam ki bu yol haritası tamamen ulaşılabilir.
