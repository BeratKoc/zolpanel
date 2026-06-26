# Zolpanel — Web Terminal (Tarayıcı SSH/Shell) Tasarım

> Pratik/genel-geçer özellik yol haritasının **ilk** alt-projesi. Sonraki sıralı alt-projeler: Dosya Yöneticisi → Cron → Firewall(UFW) → DNS(Cloudflare) → Offsite/S3 Yedek → Sistem Güncellemeleri+Disk → Env/Secrets+2FA/API. Her biri kendi spec→plan→SDD.
> Onaylı karar: **gerçek interaktif PTY** (node-pty + xterm.js), HTTP streaming (WebSocket yok).

## Amaç
Panelden, ayrı SSH istemcisi olmadan (mobil dahil) sunucuya **canlı interaktif terminal** — vim/top/htop/interaktif komutlar, kalıcı oturum, host shell + `docker exec` ile container içine girme. cPanel/Coolify'daki "Terminal" özelliğinin dengi.

## Mimari
`next start` (custom server yok) → native WebSocket YOK. Çözüm: **gerçek PTY (node-pty) + çıkışı HTTP ReadableStream, girişi POST** ile. Ayrı sunucu/Caddy-WS-route gerekmez.

- **Yeni bağımlılıklar:** `node-pty` (native; sunucuda better-sqlite3 zaten derlendiği için toolchain mevcut; Windows/CI için prebuilt binary), `@xterm/xterm` + `@xterm/addon-fit` (tarayıcı terminal emülatörü).
- **Session yöneticisi** (`lib/server/terminal/session.ts`): in-process `Map<sessionId, Session>`; `Session = { pty, userId, target, lastActivity, idleTimer }`. **Saf çekirdek** — pty üretimi **enjekte edilen bir spawner fonksiyonuyla** yapılır (DI), böylece cap/ownership/idle-timeout/cleanup mantığı node-pty olmadan unit-test edilir. Gerçek route node-pty spawner'ı geçirir.
  - Kurallar: **max eşzamanlı session = 5** (aşılırsa 429); **idle-timeout = 10 dk** (hareketsizlikte pty öldür); stream kapanınca/disconnect'te **pty öldür + Map'ten sil** (kaynak sızıntısı YOK — bu oturumdaki sızıntı dersi).
- **API route'ları** (`app/api/terminal/...`, hepsi `requireAuth`):
  - `POST /api/terminal` — body `{ target: 'host' | <containerName> }` → host için `node-pty.spawn('bash', [], {...})`, container için `spawn('docker', ['exec','-it', name, 'sh'], {...})` (containerName **`docker ps` adlarına karşı doğrulanır**; argv dizisi → shell injection yok). Session oluştur, **audit log'a yaz** (kim/ne zaman/hedef), `{ sessionId }` döndür. Limit aşımı → 429.
  - `GET /api/terminal/[id]/stream` — requireAuth + **sahiplik kontrolü** (token sub == session.userId) → `ReadableStream`: `pty.onData → controller.enqueue`; cancel/close → unsubscribe + session kill. (İstemci `fetch` ile `Authorization: Bearer` header gönderir, `response.body` reader'ı okur — **EventSource değil**.)
  - `POST /api/terminal/[id]/input` — body `{ data: string }` → `pty.write(data)`; lastActivity güncelle.
  - `POST /api/terminal/[id]/resize` — body `{ cols, rows }` → `pty.resize`.
  - `DELETE /api/terminal/[id]` — pty öldür + temizle.
- **Frontend** (`app/(panel)/terminal/page.tsx` + `components/terminal/Terminal.tsx`): xterm.js + fit addon. Hedef seçici (Host / keşfedilen container). Mount'ta `POST /api/terminal` → sessionId; `fetch` stream'i aç, decode edip `term.write`; `term.onData → POST input`; resize → `POST resize`; unmount/sayfa-değişiminde `DELETE`. Bağlantı koparsa "oturum kapandı" + yeniden-bağlan butonu (yeni session). Nav'a "Terminal" öğesi (lucide `SquareTerminal`).

## Güvenlik
- Hepsi `requireAuth`. Admin **zaten** sunucuya tam erişimli (kendi VPS paneli) → terminal **yeni yetki açmaz**; ama: session-sahipliği, **max-session + idle-timeout + disconnect-cleanup** (kaynak güvenliği), ve session açılışında **audit log** (kim/ne zaman/hedef). Host shell panel kullanıcısı (root) olarak çalışır.
- node-pty `spawn(file, argsArray, opts)` — argümanlar dizi (shell yok) → komut/ad enjeksiyonu yok. Container adı `docker ps` listesine karşı doğrulanır.
- Token istemci tarafında localStorage'da; stream/giriş fetch ile `Authorization: Bearer` taşır.

## Hata yönetimi
- Limit aşımı → 429 + UI mesajı. Geçersiz/başkasına ait session → 403/404. pty spawn hatası → 500 + mesaj. Container yoksa → 400. Idle-timeout → stream EOF + UI "oturum zaman aşımı".

## Test
- **Unit (node:test):** session yöneticisi **sahte spawner** ile — max-session cap (6.→429 hatası/red), idle-timeout pty.kill çağırır, DELETE temizler, ownership reddi, write/resize doğru pty'ye gider. (node-pty native modülüne bağımlı OLMAYAN saf mantık.)
- **e2e (Playwright):** Terminal nav'ı görünür; sayfa açılır; (CI'da node-pty derlenir — npm ci + build) bir komut yazıp çıktısının geldiği veya en azından prompt'un göründüğü doğrulanır; mobil 360px taşma yok. Kapsam sınırlıysa guard'lı.
- **Canlı doğrulama (SSH erişimi gelince):** Terminal aç → `ls`, `docker ps`, interaktif `top` sonra `q`, container'a `docker exec` gir. Idle-timeout + max-session gözlemle. (Bu özellik bugünkü SSH kilidini de çözerdi.)

## Dosya yapısı
- `lib/server/terminal/session.ts` — session yöneticisi (DI spawner) + tipler.
- `lib/server/terminal/session.test.ts` — unit testler (sahte spawner).
- `app/api/terminal/route.ts` (POST create) + `app/api/terminal/[id]/{stream,input,resize}/route.ts` + `[id]/route.ts` (DELETE).
- `lib/server/terminal/pty.ts` — node-pty spawner (host/container) + container-ad doğrulama.
- `components/terminal/Terminal.tsx` + `app/(panel)/terminal/page.tsx`.
- `app/(panel)/layout.tsx` — nav'a Terminal.
- `lib/api-client.ts` — `terminalCreate/terminalInput/terminalResize/terminalDelete` + stream helper.
- `messages/*.json` (6 dil) — terminal anahtarları.
- `package.json` — node-pty, @xterm/xterm, @xterm/addon-fit.
- `deploy.sh` — gerekiyorsa node-pty native derleme/preflight notu.

## Kapsam dışı (YAGNI / sonraki)
- Çoklu sekme/split terminal, oturum kaydı/replay, kopyala-yapıştır ötesi, dosya yükleme (Dosya Yöneticisi alt-projesi), oturumların kullanıcılar arası paylaşımı, SSH-to-remote-host (yalnız yerel sunucu + container).

## Operasyonel not
SSH erişimi şu an kapalı (iptables olayı) → bu alt-proje yerelde build+test+push+CI-yeşil yapılır; **deploy + canlı doğrulama SSH geri gelince** (kontrollü, node-pty native derlemesi izlenerek).
