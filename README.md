# Zolpanel

Caddy + PM2 tabanlı VDS yönetim paneli. **Next.js (App Router) + TypeScript** tek uygulama: API route handler'ları + React arayüzü aynı projede.

## Hızlı Kurulum (tek komut)

Temiz bir **Debian/Ubuntu** sunucuda Node 22 + Caddy + PM2 + panel'i tek komutla kurar (`set -euo pipefail`, idempotent):

```bash
curl -fsSL https://raw.githubusercontent.com/BeratKoc/zolpanel/main/install.sh | sudo bash
```

Otomatik HTTPS ile (panel için alan adı verirsen Caddy bloğu + Let's Encrypt sertifikası otomatik kurulur — `-E` env'i korur):

```bash
curl -fsSL https://raw.githubusercontent.com/BeratKoc/zolpanel/main/install.sh -o install.sh
PANEL_DOMAIN=panel.ornek.com sudo -E bash install.sh
```

### Güncelleme

`install.sh` yalnız ilk kurulum içindir. Kurulu paneli güncellemek için repodaki **`deploy.sh`** kullanılır (local kaynak → sunucu rsync + `npm install` + build + `pm2 restart`; `.env` ve `db/` korunur):

```bash
bash deploy.sh
```

**Ortam değişkenleri (hepsi opsiyonel, makul varsayılanlar):**

| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `PANEL_DOMAIN` | _(boş)_ | Verilirse Caddy'ye otomatik-HTTPS reverse-proxy bloğu eklenir; boşsa panel `http://<sunucu-ip>:3999` |
| `INSTALL_DIR` | `/opt/zolpanel` | Kurulum dizini (pm2/ecosystem bu yola sabit) |
| `ZOLPANEL_PORT` | `3999` | Uygulama portu (Next `next start -p 3999`) |
| `ZOLPANEL_BRANCH` | `main` | Çekilecek git dalı |
| `ZOLPANEL_REPO` | `…/BeratKoc/zolpanel.git` | Depo URL'i |

**İlk giriş:** Kurulum bittiğinde kullanıcı `admin` ve **rastgele üretilen şifre** ekrana basılır (kaçırırsan `pm2 logs zolpanel` ile boot log'unda `Şifre :` satırına bak). İlk girişten sonra Settings'ten değiştir. Var olan `.env` korunur — yeniden çalıştırmak secret'ı ezmez.

## Stack

- **Next.js 15** (App Router), **TypeScript**, React 18
- **better-sqlite3** (senkron, dosya tabanlı SQL) — `lib/server/db.ts`
- **next-intl** i18n (6 dil: tr/en/zh/es/de/fr, cookie tabanlı)
- **Zod** girdi doğrulama, **JWT** auth (Authorization header)
- Sistem entegrasyonu: PM2, Caddy, `systeminformation` — `lib/server/*`
- Testler: `node --test` (birim) + **Playwright** (E2E)

## Yapı

```
app/
  api/            → route handlers (auth, domains, processes, system, health)
  (panel)/        → dashboard, domains, processes, logs, settings (+ nav layout)
  login/          → giriş sayfası
lib/
  server/         → db, caddy, pm2, portManager, memoryTracker, rateLimit (server-only)
  auth.ts         → signToken / requireAuth (tokenVersion ile invalidation)
  validation.ts   → Zod şemaları
  api-client.ts   → frontend fetch wrapper (401'de otomatik logout)
components/        → ui.tsx, AuthGate.tsx
instrumentation.ts → boot'ta initDb + initAdmin + memoryTracker
```

## Geliştirme

```bash
npm install
npm run dev        # http://localhost:3999
npm test           # birim testler (caddy, pm2, validation, portManager)
npm run build      # production build
npm run e2e        # Playwright E2E (build + headless chromium)
```

## Test & CI

- **Birim:** `npm test` (caddy token-match/dedup/parse, pm2 isim whitelist, Zod, portManager).
- **E2E:** `npm run e2e` — Playwright kendi Chromium'unu kullanır; login → domain ekle/durdur/sil → dil değiştir akışlarını gerçek tarayıcıda sürer. Deterministik giriş için `ZOLPANEL_TEST_ADMIN_PASSWORD` env'i kullanılır.
- **CI:** `.github/workflows/ci.yml` her push/PR'de `tsc + npm test + build + Playwright E2E` koşar (otomatik deploy YOK). **Aktif olması için repoyu GitHub'a bağla:**
  ```bash
  gh repo create zolpanel --private --source=. --push   # veya: git remote add origin <url> && git push -u origin nextjs-migration
  ```
  GitHub'a push'ladığın anda CI çalışmaya başlar.

## Çevre Değişkenleri (`.env`)

```env
JWT_SECRET=guclu-bir-secret        # zorunlu
JWT_EXPIRES=8h
CADDYFILE_PATH=/etc/caddy/Caddyfile
DB_DIR=/opt/zolpanel/db/data
PROTECTED_DOMAINS=panel.zolvix.app # panel'in dokunmayacağı bloklar
NODE_ENV=production
```

İlk açılışta admin yoksa **rastgele güçlü şifre** üretilir ve boot log'una bir kez basılır (kullanıcı: `admin`). İlk girişten sonra Settings'ten değiştirin.

## Deploy

`deploy.sh` local'den sunucudaki `/opt/zolpanel`'e gönderir (kod + `npm install` + `npm run build` + pm2), `.env` / `db/data` / `node_modules` korunur:

```bash
bash deploy.sh
```

PM2: `ecosystem.config.cjs` → `next start -p 3999`. Caddy `panel.zolvix.app`'i `127.0.0.1:3999`'a reverse-proxy eder.

## Güvenlik notları

- Tüm domain/route girdileri Zod ile doğrulanır (Caddyfile injection engellenir).
- PM2 işlemleri `execFile` (shell yok) + isim whitelist ile çalıştırılır.
- Şifre değişiminde `tokenVersion` artar → eski JWT'ler geçersiz olur.
- `removeDomainBlock` tam-token eşleştirme yapar (substring değil) → korumalı bloklar (ör. `panel.zolvix.app`) yanlışlıkla silinmez.
