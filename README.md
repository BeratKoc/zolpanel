# Zolpanel

Caddy + PM2 tabanlı VDS yönetim paneli. **Next.js (App Router) + TypeScript** tek uygulama: API route handler'ları + React arayüzü aynı projede.

## Stack

- **Next.js 15** (App Router), **TypeScript**, React 18
- **NeDB** (dosya tabanlı DB) — `lib/server/db.ts`
- **Zod** girdi doğrulama, **JWT** auth (Authorization header)
- Sistem entegrasyonu: PM2, Caddy, `systeminformation` — `lib/server/*`

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
npm test           # birim testler (caddy, pm2, validation)
npm run build      # production build
```

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
