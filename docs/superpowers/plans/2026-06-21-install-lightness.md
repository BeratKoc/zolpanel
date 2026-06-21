# Caddy-Native (d): Install Lightness — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Tek komutla kurulum — `curl -fsSL https://raw.githubusercontent.com/BeratKoc/zolpanel/main/install.sh | bash` → Node 22 + Caddy + pm2 + zolpanel kodu + rastgele-secret `.env` + build + pm2 başlat; isteğe bağlı `PANEL_DOMAIN` verilirse otomatik-HTTPS Caddy bloğu. Zero-config makul varsayılanlar. "Hafiflik/basitlik" farkını somutlaştırır.

**Architecture:** Tek bir idempotent bash script (`install.sh`, repo kökünde → raw URL ile çekilebilir). apt-tabanlı (Debian/Ubuntu) hedef. Bölümler: preflight → Node → Caddy → pm2 → kod (git clone/pull) → `.env` (yoksa üret) → build → (opsiyonel) Caddy panel bloğu → pm2 start/save → özet (admin parolasını pm2 log'dan yüzeye çıkar). `--check` bayrağı: hiçbir değişiklik yapmadan ön-koşulları rapor eder (güvenli doğrulama yolu).

**Tech Stack:** bash, apt, NodeSource (Node 22), Caddy apt repo, pm2, git, openssl (secret), Next.js (`next start -p 3999`).

## Global Constraints
- **Idempotent**: ikinci kez çalıştırınca bozmaz — var olan Node/Caddy/pm2'yi yeniden kurmaz (sürüm yeterliyse atlar), var olan `.env`'i EZMEZ (secret korunur), pm2 app'i duplicate etmez (`pm2 restart zolpanel` ya da yoksa start).
- **Zero-config defaults** (hepsi env ile override edilebilir): `INSTALL_DIR=/opt/zolpanel`, `ZOLPANEL_PORT=3999` (uygulama `next start -p 3999`; portu değiştirmek build/script gerektirir — bu sürümde sabit 3999, env sadece Caddy bloğu/özet için), `ZOLPANEL_REPO=https://github.com/BeratKoc/zolpanel.git`, `ZOLPANEL_BRANCH=main`, `PANEL_DOMAIN` (boşsa Caddy'ye dokunma; panel `http://<sunucu-ip>:3999`).
- **.env** üretimi: `JWT_SECRET=$(openssl rand -hex 48)`, `JWT_EXPIRES=24h`, `PORT=3999`, `NODE_ENV=production`, `CADDYFILE_PATH=/etc/caddy/Caddyfile`, `DB_DIR=$INSTALL_DIR/db`, `PROTECTED_DOMAINS=$PANEL_DOMAIN` (PANEL_DOMAIN varsa). Var olan `.env` varsa hiç dokunma.
- **Caddy panel bloğu** YALNIZ `PANEL_DOMAIN` verilince: `/etc/caddy/Caddyfile`'a (yoksa oluştur) panel domaini için `reverse_proxy 127.0.0.1:3999` bloğu ekle (zaten varsa tekrar ekleme); `caddy validate --config /etc/caddy/Caddyfile` GEÇMELİ, sonra `systemctl reload caddy`. Validate başarısızsa yazılan bloğu geri al ve hata ver. zolpanel'in kendi managed-region marker'larına dokunma (panel domaini PROTECTED_DOMAINS olarak ayrılır).
- **Güvenlik/çıktı**: root gerektir (apt/systemctl). Admin parolası pm2 ilk-boot log'unda (`Şifre    : ...`) → kurulum sonunda yüzeye çıkar. Komut idempotent ve `set -euo pipefail`.
- **Canlı-güvenlik (DOĞRULAMA SINIRI)**: tam kurulum CANLI sunucuda (191.44.68.81) ÇALIŞTIRILMAZ — `/opt/zolpanel` ve Caddy canlıdır. Doğrulama yalnız: `bash -n`, `shellcheck`, ve sunucuda read-only `--check`.
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

### Task 1: `install.sh` — tek-komut idempotent kurucu + `--check`

**Files:** Create `install.sh` (repo kökü, `chmod +x`).

**Interfaces:** Produces çalıştırılabilir `install.sh`. Bayrak: `--check` (preflight-only). Env: INSTALL_DIR, ZOLPANEL_PORT, ZOLPANEL_REPO, ZOLPANEL_BRANCH, PANEL_DOMAIN.

- [ ] **Step 1: Script iskeleti + helpers + arg parse.** `#!/usr/bin/env bash` + `set -euo pipefail`. Renkli `log()`/`warn()`/`err()` (err → stderr + exit 1). Üst başlıkta kullanım örneği yorum. Varsayılanlar env'den (`: "${INSTALL_DIR:=/opt/zolpanel}"` vb.). `CHECK_ONLY=0`; `--check` görülürse `1`. `need_root()`: `[ "$(id -u)" = 0 ] || err "root gerekli (sudo bash install.sh)"`.
- [ ] **Step 2: `detect_os()`** — `/etc/os-release` oku; `ID`/`ID_LIKE` debian|ubuntu değilse `err "Yalnız Debian/Ubuntu (apt) destekleniyor"`. `command -v apt-get >/dev/null || err`.
- [ ] **Step 3: `ensure_node()`** — `command -v node` varsa ve `node -v` major ≥ 20 ise atla (log "Node mevcut: $(node -v)"). Yoksa: NodeSource 22.x setup (`curl -fsSL https://deb.nodesource.com/setup_22.x | bash -` + `apt-get install -y nodejs`). `--check` ise sadece raporla, kurma.
- [ ] **Step 4: `ensure_caddy()`** — `command -v caddy` varsa atla. Yoksa Caddy resmi apt deposu (keyring + repo) + `apt-get install -y caddy`. `--check` ise raporla.
- [ ] **Step 5: `ensure_pm2()`** — `command -v pm2` varsa atla; yoksa `npm install -g pm2`. `--check` raporla.
- [ ] **Step 6: `fetch_code()`** — `$INSTALL_DIR/.git` varsa `git -C "$INSTALL_DIR" pull --ff-only`; yoksa `git clone --branch "$ZOLPANEL_BRANCH" "$ZOLPANEL_REPO" "$INSTALL_DIR"`. `--check`: yalnız ne yapılacağını raporla.
- [ ] **Step 7: `ensure_env()`** — `$INSTALL_DIR/.env` VARSA dokunma (log "mevcut .env korundu"). Yoksa üret (Global Constraints'teki anahtarlar; `JWT_SECRET=$(openssl rand -hex 48)`). `chmod 600 .env`. `--check`: raporla.
- [ ] **Step 8: `build_app()`** — `cd "$INSTALL_DIR" && npm install && npm run build`. `--check`: atla (raporla "build yapılacak").
- [ ] **Step 9: `configure_caddy()`** — `[ -n "$PANEL_DOMAIN" ]` değilse atla (log "PANEL_DOMAIN yok → panel http://<ip>:$ZOLPANEL_PORT"). Varsa: `/etc/caddy/Caddyfile` içinde `^${PANEL_DOMAIN} {` zaten yoksa, dosya sonuna ekle:
  ```
  PANEL_DOMAIN {
      reverse_proxy 127.0.0.1:3999
  }
  ```
  Yazmadan önce `cp Caddyfile Caddyfile.zolpanel-install.bak`. `caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile` çalıştır; başarısızsa backup'tan geri yükle + `err`. Başarılıysa `systemctl reload caddy`. `--check`: yalnız raporla, yazma.
- [ ] **Step 10: `start_pm2()`** — `cd "$INSTALL_DIR"`; `pm2 describe zolpanel >/dev/null 2>&1` ise `pm2 restart zolpanel --update-env`, değilse `pm2 start ecosystem.config.cjs`. Sonra `pm2 save`. `pm2 startup` (systemd) çağır (idempotent). `--check`: atla.
- [ ] **Step 11: `print_summary()`** — URL (`PANEL_DOMAIN` varsa `https://$PANEL_DOMAIN`, yoksa `http://<sunucu-ip>:$ZOLPANEL_PORT` — ip için `hostname -I | awk '{print $1}'`). Admin parolası: ilk boot ise `pm2 logs zolpanel --nostream --lines 50` çıktısından `Şifre    :` satırını grep'le ve göster; yoksa "parola daha önce üretildi, `pm2 logs zolpanel` ile bakın" de.
- [ ] **Step 12: `main()`** — sırayla çağır: need_root → detect_os → ensure_node → ensure_caddy → ensure_pm2 → fetch_code → ensure_env → build_app → configure_caddy → start_pm2 → print_summary. `--check` ise build/start/configure'in yan-etkilerini atlayıp her adımın raporunu bas ve "DRY-RUN: değişiklik yapılmadı" ile bitir. Son satır: `chmod +x install.sh` gerektiğini README'ye bırak.
- [ ] **Step 13: Doğrula (yerel)** — `bash -n install.sh` (syntax PASS). Varsa `shellcheck install.sh` (kritik SC* uyarısı bırakma; stilistikler kabul). `chmod +x install.sh`.
- [ ] **Step 14: Commit** `git add install.sh && git commit -m "feat(install): one-command installer (Node+Caddy+pm2+env+build) with --check"`

---

### Task 2: README quickstart + canlı `--check` doğrulaması

**Files:** Modify `README.md` (yoksa Create).

- [ ] **Step 1: README "Hızlı Kurulum"** bölümü ekle: tek-komut (`curl -fsSL .../install.sh | sudo bash`), `PANEL_DOMAIN=panel.ornek.com sudo -E bash install.sh` (auto-HTTPS), env override tablosu (INSTALL_DIR/ZOLPANEL_PORT/PANEL_DOMAIN/ZOLPANEL_BRANCH), `--check` ile önizleme, ilk giriş (admin + pm2 log'daki parola, ilk girişten sonra değiştir). Türkçe, mevcut README diline uygun.
- [ ] **Step 2: Commit** `git add README.md && git commit -m "docs: quick install section for install.sh"`
- [ ] **Step 3: Canlı read-only doğrulama** — script'i sunucuya kopyala ve YALNIZ `--check` koş (değişiklik yapmaz): `scp install.sh root@191.44.68.81:/tmp/zp-install.sh && ssh root@191.44.68.81 'bash /tmp/zp-install.sh --check; rm -f /tmp/zp-install.sh'`. Beklenen: Node/Caddy/pm2 "mevcut" raporu (sunucuda kurulu), `/opt/zolpanel/.git` → "pull yapılacak", `.env` → "korunacak", "DRY-RUN: değişiklik yapılmadı". Hiçbir apt/pm2/systemctl/Caddy yan etkisi olmamalı. **Bu adım canlı app'i ve Caddy'yi DEĞİŞTİRMEZ.**
- [ ] **Step 4: Ledger + (d) tamam.**

---

## Self-Review (yazar)
- **Kapsam:** tek-komut kurulum→T1; idempotency (var olan Node/Caddy/pm2/.env/pm2-app)→T1 adımlar; zero-config defaults→Global Constraints+T1; auto-HTTPS opsiyonel→T1 Step 9; secret üretimi→T1 Step 7; admin parola yüzeye çıkarma→T1 Step 11; docs→T2; doğrulama→T1 Step 13 (yerel) + T2 Step 3 (canlı read-only).
- **Canlı-güvenlik:** tam kurulum canlıda koşulmaz; yalnız `--check` (yan-etkisiz). Caddy bloğu validate-gate + backup-rollback ile korumalı.
- **Port:** uygulama sabit 3999 (package.json/ecosystem). ZOLPANEL_PORT yalnız Caddy bloğu/özet metni için; bu sürümde gerçek port değişimi kapsam dışı (YAGNI) — Caddy bloğu 127.0.0.1:3999'a sabit proxyّ.
- **Placeholder taraması:** her adımda somut komut/davranış var; TODO yok.
- **Tip/isim tutarlılığı:** fonksiyon adları main() çağrı sırasıyla birebir; .env anahtarları sunucudaki gerçek anahtarlarla (JWT_SECRET/JWT_EXPIRES/PORT/NODE_ENV/CADDYFILE_PATH/DB_DIR/PROTECTED_DOMAINS) eşleşiyor.
