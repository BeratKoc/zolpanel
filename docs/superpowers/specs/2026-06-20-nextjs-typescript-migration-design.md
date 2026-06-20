# Zolpanel — Next.js + TypeScript Migration Design

**Tarih:** 2026-06-20
**Durum:** Onaylandı (tasarım), spec inceleme bekliyor
**Kapsam:** Mevcut Express + React(Vite) + NeDB panelini, davranışı birebir koruyarak tek bir Next.js (App Router) + TypeScript uygulamasına taşımak; bu esnada Tier-1 güvenlik düzeltmelerini yeni kod tabanına gömmek.

---

## 1. Amaç ve Gerekçe

- **Birincil amaç:** Tüm projeyi Next.js (App Router) + TypeScript'e taşımak. Gerekçe: sürdürülebilirlik, tip güvenliği ve geliştiricinin (proje sahibinin) Next.js'e aşina olması → bakım ve büyütme daha kolay.
- **İkincil amaç:** Mevcut Tier-1 güvenlik açıklarını (Caddyfile injection, varsayılan şifre, JWT invalidation) eski JS'te değil, doğrudan yeni Next+TS koduna gömerek çift iş yapmamak.
- **Felsefe:** Önce **birebir aynı işlevsellik** (yeni özellik yok), sonra büyütme. Risk minimizasyonu için aynı anda yalnızca framework + dil değişir; DB ve auth modeli korunur.

## 2. Kapsam Dışı (Non-Goals)

Bu migration'da YAPILMAYACAK (ayrı/sonraki işler):

- **DB değişimi** — NeDB korunur. (better-sqlite3 / Postgres geçişi ayrı task.)
- **Auth modeli değişimi** — JWT-in-Authorization-header korunur. (httpOnly cookie + CSRF yükseltmesi ayrı task.)
- **Yeni özellikler** — (b) Docker/terminal/dosya/cron yönetimi bu migration'dan SONRA, her biri kendi spec'i ile.
- **Çoklu sunucu / multi-tenant / SaaS** (a, c, d) — bu spec'in konusu değil.
- **Caddy Admin API'ye geçiş** — mevcut token-bazlı string yönetimi (test edilmiş) korunur.

## 3. Mimari

Tek bir Next.js App Router uygulaması, hem API'yi (route handlers) hem UI'ı (React Server/Client Components) barındırır. Sistem komutu çalıştıran tüm mantık `lib/server/*` altında, framework'ten bağımsız saf TypeScript modülleri olarak kalır ve yalnızca route handler'lardan çağrılır.

```
zolpanel/
├── app/
│   ├── layout.tsx
│   ├── page.tsx                       # dashboard (veya (panel)/dashboard)
│   ├── login/page.tsx
│   ├── domains/page.tsx
│   ├── processes/page.tsx
│   ├── logs/page.tsx
│   ├── settings/page.tsx
│   └── api/
│       ├── auth/
│       │   ├── login/route.ts
│       │   ├── verify/route.ts
│       │   └── change-password/route.ts
│       ├── domains/
│       │   ├── route.ts               # GET liste, POST ekle
│       │   ├── [id]/route.ts          # GET, PUT, DELETE
│       │   └── utils/next-port/route.ts
│       ├── processes/
│       │   ├── route.ts               # GET liste, POST start
│       │   └── [name]/...             # stop, restart, delete, logs
│       └── system/
│           ├── metrics/route.ts
│           ├── stats/route.ts
│           ├── logs/route.ts
│           └── caddy/{config,reload}/route.ts
├── lib/
│   ├── server/
│   │   ├── db.ts                      # NeDB datastore'ları + addLog (mevcut database.js)
│   │   ├── caddy.ts                   # mevcut caddy.js (token-match + PROTECTED + dedup korunur)
│   │   ├── pm2.ts                     # mevcut pm2.js (execFile + assertSafeName korunur)
│   │   ├── portManager.ts
│   │   └── memoryTracker.ts
│   ├── auth.ts                        # JWT sign/verify + requireAuth(req) helper
│   ├── validation.ts                  # Zod şemaları (domain, route, process, vb.)
│   └── api-client.ts                  # frontend fetch wrapper (eski api.js) + 401 auto-logout
├── instrumentation.ts                 # boot'ta initAdmin() + startTracker()
├── components/                        # ui bileşenleri (eski components/ui.jsx → tsx)
├── next.config.ts
├── tsconfig.json
├── package.json
├── ecosystem.config.cjs               # pm2: next start -p 3999
└── .env                               # sunucuda (JWT_SECRET vb.)
```

## 4. Bileşen Eşlemesi (mevcut → yeni)

| Mevcut | Yeni | Not |
|---|---|---|
| `backend/index.js` (Express bootstrap) | Next runtime + `instrumentation.ts` | Express kalkar |
| `backend/load-env.js` | Next `.env` yükleme (native) + gerekiyorsa fallback | Next `.env`'i native okur |
| `routes/auth.js` | `app/api/auth/*/route.ts` | rate-limit Next'te (bkz. §7) |
| `routes/domains.js` | `app/api/domains/**/route.ts` | nested callback → async/await + Zod |
| `routes/processes.js` | `app/api/processes/**/route.ts` | — |
| `routes/system.js` | `app/api/system/**/route.ts` | — |
| `services/caddy.js` | `lib/server/caddy.ts` | mantık birebir; tipler eklenir |
| `services/pm2.js` | `lib/server/pm2.ts` | execFile + assertSafeName korunur |
| `services/portManager.js` | `lib/server/portManager.ts` | — |
| `services/memoryTracker.js` | `lib/server/memoryTracker.ts` | `instrumentation.ts`'ten başlatılır |
| `db/database.js` | `lib/server/db.ts` | NeDB korunur |
| `frontend/src/pages/*.jsx` | `app/*/page.tsx` | client component'ler ('use client') |
| `frontend/src/components/ui.jsx` | `components/*.tsx` | — |
| `frontend/src/api.js` | `lib/api-client.ts` | 401 auto-logout eklenir |
| `frontend/src/App.jsx` (useState nav) | App Router dosya-bazlı routing | router gerçek olur; react-router-dom kalkar |

## 5. Auth Tasarımı

- JWT, login'de `lib/auth.ts`'in `signToken()` ile üretilir; client `localStorage`'da tutar ve `Authorization: Bearer` ile gönderir (mevcut davranış birebir).
- Korumalı route handler'lar başında `requireAuth(req)` çağrılır → token yoksa/invalidse 401/403, geçerliyse `user` döner.
- `JWT_SECRET` zorunlu (yoksa boot'ta hata). `JWT_EXPIRES` env (varsayılan 8h).
- **Yeni (Tier-1 #3):** `user.tokenVersion` alanı; JWT payload'ına gömülür; `requireAuth` DB'deki versiyonla karşılaştırır. Şifre değişince versiyon artar → eski tokenlar geçersiz.
- Route handler'lar Node.js runtime'da çalışır (`export const runtime = 'nodejs'`) — edge değil (NeDB, child_process gerekiyor).

## 6. Arkaplan İşi (memoryTracker)

- `instrumentation.ts` → `register()` içinde, `process.env.NEXT_RUNTIME === 'nodejs'` koşuluyla `initAdmin()` ve `startTracker()` çağrılır. `next start` kalıcı process'te interval yaşar.
- Geliştirme modunda (HMR) çift başlatmayı önlemek için global guard (`globalThis.__zolpanelTracker`).

## 7. Validasyon ve Güvenlik (port sırasında gömülür)

- **#1 Caddyfile injection (Zod):** `lib/validation.ts`'te şemalar — domain/alias `^[a-z0-9.-]+$`, port `int 1..65535`, route.path Caddy-safe pattern, rootPath güvenli mutlak yol. Tüm `app/api/domains` handler'ları girdiyi Zod ile parse eder; `buildDomainBlock`'a yalnızca doğrulanmış veri gider.
- **#2 Varsayılan şifre:** `initAdmin` artık sabit `admin123` yazmaz; rastgele güçlü şifre üretip **boot log'una bir kez** basar (veya `mustChangePassword` flag + ilk girişte zorunlu değişim). Seçim: rastgele şifre + log.
- **#3 JWT invalidation:** §5'teki `tokenVersion`.
- **rate-limit:** login için basit in-memory limiter (IP başına 5/15dk) — `lib/server`'da küçük bir util (express-rate-limit yerine framework-bağımsız).
- CORS: Next aynı-origin serve ettiği için CORS'a gerek kalmaz (Express'teki cors middleware kalkar).

## 8. Deploy Değişiklikleri

- `package.json`: `dev: next dev -p 3999`, `build: next build`, `start: next start -p 3999`.
- Sunucuda: `npm install` + `npm run build` → pm2 `next start -p 3999` (standalone output kullanılmaz; basitlik için klasik `next start`). Port 3999 sabit → **Caddy config değişmez** (`panel.zolvix.app → 127.0.0.1:3999`).
- `ecosystem.config.cjs`: script `node_modules/.bin/next`, args `start -p 3999`, cwd uygulama kökü, env `.env`'den.
- `deploy.sh` güncellenir: tek app dizini gönderilir (`.env`, `db/data`, `node_modules`, `.next` hariç); sunucuda `npm install` + `npm run build` + `pm2 restart`. Build öncesi local `npm run build` ile doğrulama (bozuk build prod'u düşürmesin).
- **DB taşıma:** mevcut `/opt/vps-panel/backend/db/data/*.db` korunur; yeni app aynı NeDB dosyalarını okuyacak şekilde `lib/server/db.ts` path'i ayarlanır (veri kaybı yok).

## 9. Migration Stratejisi (fazlar)

1. **Scaffold:** Next App Router + TS iskeleti, tsconfig, bağımlılıklar (next, react, zod, jsonwebtoken, bcryptjs, nedb, systeminformation, @types/*).
2. **lib/server portu:** caddy/pm2/portManager/memoryTracker/db'yi TS'e taşı (mantık birebir, tip ekle). Birim testleri (caddy, pm2) bu aşamada repoya alınır ve TS'e uyarlanır.
3. **API portu:** auth → domains → processes → system route handler'ları; her grupta Zod + requireAuth.
4. **UI portu:** ui bileşenleri → sayfalar (login, dashboard, domains, processes, logs, settings); `lib/api-client.ts`.
5. **Güvenlik:** #1/#2/#3 entegre (büyük kısmı 2-3. fazda doğal olarak girer).
6. **Doğrulama:** lokalde `next dev`, mevcut panelin tüm akışları manuel + birim test; davranış paritesi kontrol listesi.
7. **Deploy:** `deploy.sh` güncelle, staging gibi ayrı port/dizinde dene, sonra cut-over (pm2 `vps-panel` yeni app'e işaret eder), NeDB verisi taşınır, health + Caddy doğrulama.

## 10. Test

- **Birim:** `lib/server/caddy.ts` (removeDomainBlock/buildDomainBlock/parseCaddyfile), `lib/server/pm2.ts` (assertSafeName), `lib/validation.ts` (Zod şemaları) — `node --test` veya vitest.
- **Davranış paritesi:** her API endpoint için mevcut davranışla karşılaştırmalı manuel kontrol (login, domain ekle/durdur/sil, process kontrol, metrics).
- **Deploy doğrulama:** health endpoint, `panel.zolvix.app` 200, `zolvix.app` etkilenmedi, caddy validate.

## 11. Riskler ve Önlemler

| Risk | Önlem |
|---|---|
| Cut-over sırasında panel erişilemez kalır | Önce ayrı port/dizinde çalıştır, doğrula, sonra pm2'yi yönlendir; eski `/opt/vps-panel` yedeği dursun |
| NeDB veri kaybı | Cut-over'da `db/data` dosyaları kopyalanır; yeni app aynı dosyaları okur; önce yedek |
| Caddyfile mantığında regresyon | Birim testler TS'e taşınır ve cut-over öncesi koşar |
| memoryTracker dev'de çift başlar | global guard |
| Build prod'u düşürür | local build doğrulaması + ayrı dizinde test |

## 12. Açık Sorular

Yok — tüm tasarım kararları onaylandı (App Router, NeDB korunur, JWT-header auth korunur, port 3999).
