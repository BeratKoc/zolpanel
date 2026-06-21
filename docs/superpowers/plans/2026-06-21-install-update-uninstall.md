# install.sh — Update & Uninstall Modları Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** `install.sh`'a iki güvenli mod ekle — `--update` (tek komutla güncelle: pull+build+pm2 restart+health) ve `--uninstall` (pm2 kaldır + Caddy panel bloğunu güvenle temizle; `--purge` ile dizini de sil). Her ikisi de `--check` ile yan-etkisiz önizlenebilir.

**Architecture:** Mevcut `install.sh`'a bir `MODE` kavramı eklenir (`install` varsayılan / `update` / `uninstall`), `--purge` modifier'ı, ve `--check` her modda dry-run olarak çalışır. `main()` MODE'a göre dallanır. Mevcut güvenlik kalıpları (backup → `caddy validate` → rollback → reload) Caddy blok kaldırmada yeniden kullanılır. Caddy bloğu kaldırma brace-farkında awk ile yalnız panel domainini hedefler.

**Tech Stack:** bash, git, npm/Next build, pm2, Caddy (`caddy validate --adapter caddyfile`), awk.

## Global Constraints
- `set -euo pipefail`; tüm değişken genişletmeleri tırnaklı. Mevcut `log`/`warn`/`err`/`info` helper'larını ve `CHECK_ONLY` bayrağını kullan.
- **`--check` her modda KESİN yan-etkisiz**: hiçbir apt/git-write/npm/pm2/systemctl/Caddy-write çalışmaz; yalnız ne yapılacağını `[DRY-RUN]` satırlarıyla raporla ve "DRY-RUN: değişiklik yapılmadı" ile bitir.
- **Caddy canlı altyapı**: panel bloğu kaldırma YALNIZ backup → `caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile` → başarısızsa backup'tan geri yükle + `err` → başarılıysa `systemctl reload caddy`. Asla geçersiz Caddyfile bırakma. Sadece **panel domainine ait** bloğu kaldır (başka blokları değil).
- **Veri güvenliği**: `--uninstall` varsayılanda `INSTALL_DIR`'i (ve `.env`/`db`) SİLMEZ — yalnız `--purge` verilince siler. `--purge` destructive olduğu için tek başına açık opt-in'dir.
- **Idempotent**: `--update` tekrar çalışınca güvenli; `--uninstall` zaten kaldırılmışsa nazikçe (pm2 app yok → atla, Caddy bloğu yok → atla) tamamlanır, `err` ile patlamaz.
- `app` sabit port 3999, pm2 app adı `zolpanel`, `INSTALL_DIR` varsayılan `/opt/zolpanel` (ecosystem hardcoded). Panel domaini `.env`'deki `PROTECTED_DOMAINS`'ten okunur (install onu oraya yazıyor).
- **DOĞRULAMA SINIRI**: gerçek `--update`/`--uninstall` CANLI sunucuda (191.44.68.81) ÇALIŞTIRILMAZ. Doğrulama: `bash -n`, Caddy-blok-kaldırma awk'ının `/tmp`'de örnek Caddyfile'lar üzerinde izole testi, ve canlıda yalnız `--update --check` / `--uninstall --check` (yan-etkisiz).
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

### Task 1: Arg-parse + MODE + `--update` modu

**Files:** Modify `install.sh`; Modify `README.md`.

**Interfaces:** Produces `MODE` değişkeni (`install`|`update`|`uninstall`), `--update`/`--uninstall`/`--purge` arg'ları, `do_update()` fonksiyonu. Mevcut `--check`/`CHECK_ONLY` korunur.

- [ ] **Step 1:** install.sh arg-parse döngüsünü genişlet: `MODE="install"`; `PURGE=0`. `--update` → `MODE="update"`; `--uninstall` → `MODE="uninstall"`; `--purge` → `PURGE=1`; `--check` → `CHECK_ONLY=1` (var olan). Bilinmeyen arg → `err "bilinmeyen argüman: $1"`. Üst yorum bloğuna kullanım örnekleri ekle (`--update`, `--uninstall [--purge]`, hepsi `--check` ile).
- [ ] **Step 2:** `do_update()` ekle: `need_root`; `[ -d "${INSTALL_DIR}" ] || err "kurulum yok: ${INSTALL_DIR}"`; `fetch_code` (mevcut pull/adopt mantığı); `ensure_env` (mevcut — var olanı korur); `build_app`; `start_pm2` (mevcut restart dalı); `wait_for_health`; `log "Güncelleme tamam."`. `--check` ise her adımı `[DRY-RUN]` raporla, yazma. (Node/Caddy/pm2 ensure ve configure_caddy ÇAĞRILMAZ — update sadece kodu tazeler.)
- [ ] **Step 3:** `main()`'i MODE'a göre dallandır: `case "$MODE" in install) <mevcut sıra> ;; update) do_update ;; uninstall) do_uninstall ;; esac`. (uninstall Task 2'de gelir — şimdilik `do_uninstall` için `:` placeholder DEĞİL; Task 2 ekleyecek. Bu task'ta `uninstall` dalını henüz ekleme ya da `err "uninstall Task 2'de"` koyma — sadece install+update dallarını ekle.)
- [ ] **Step 4:** README "Hızlı Kurulum" bölümüne **Güncelleme** alt-başlığı ekle: `sudo bash install.sh --update` (ya da curl ile), `--check` önizleme.
- [ ] **Step 5: Doğrula** — yerel `bash -n install.sh` PASS. Sunucuya kopyala, `bash /tmp/zp-install.sh --update --check` koş: Beklenen → `[DRY-RUN]` ile "kod çekilecek/build/pm2 restart/health" raporu + "DRY-RUN: değişiklik yapılmadı", **hiçbir yan etki yok** (`/opt/zolpanel/.git` oluşmamalı, pm2 restart olmamalı). Temizle (`rm /tmp/zp-install.sh`).
- [ ] **Step 6: Commit** `git add install.sh README.md && git commit -m "feat(install): --update mode (pull+build+restart+health) with --check"`

---

### Task 2: `--uninstall` (+ `--purge`) + güvenli Caddy blok kaldırma

**Files:** Modify `install.sh`; Modify `README.md`.

**Interfaces:** Consumes MODE/PURGE (Task 1). Produces `do_uninstall()` ve `remove_caddy_block(domain)`.

- [ ] **Step 1: `remove_caddy_block()`** ekle (arg: domain). Davranış:
  - `CADDYFILE="${CADDYFILE_PATH:-/etc/caddy/Caddyfile}"`. Dosya yoksa veya domain bloğu yoksa (`grep -qE "^${domain}[[:space:]]*\{" "$CADDYFILE"` başarısız) → `log "Caddy bloğu yok, atlanıyor"` ve return 0.
  - `--check` ise → `info "[DRY-RUN] Caddy panel bloğu kaldırılacak: ${domain}"`, return 0 (yazma yok).
  - Gerçek mod: `cp "$CADDYFILE" "${CADDYFILE}.zolpanel-uninstall.bak"`. Brace-farkında awk ile **yalnız** `^domain {` ile başlayan bloğu (açılış `{`'tan eşleşen `}`'a kadar) çıkar, kalanı geçici dosyaya yaz, `mv` ile yerine koy:
    ```bash
    awk -v d="$domain" '
      BEGIN{skip=0; depth=0}
      skip==0 && $0 ~ "^"d"[[:space:]]*\\{" {skip=1; depth=1; next}
      skip==1 { n=gsub(/\{/,"{"); m=gsub(/\}/,"}"); depth+=n-m; if(depth<=0) skip=0; next }
      {print}
    ' "$CADDYFILE" > "${CADDYFILE}.zolpanel.tmp" && mv "${CADDYFILE}.zolpanel.tmp" "$CADDYFILE"
    ```
  - `caddy validate --config "$CADDYFILE" --adapter caddyfile` → başarısızsa `cp "${CADDYFILE}.zolpanel-uninstall.bak" "$CADDYFILE"` (geri yükle) + `err "Caddy doğrulama başarısız, geri alındı"`. Başarılıysa `systemctl reload caddy` (`|| warn`).
- [ ] **Step 2: `do_uninstall()`** ekle: `need_root`.
  - Panel domainini öğren: `.env`'den `PROTECTED_DOMAINS` oku (`PANEL_DOMAIN` env override edebilir): `dom="$(grep -E '^PROTECTED_DOMAINS=' "${INSTALL_DIR}/.env" 2>/dev/null | cut -d= -f2- | tr -d ' ')"`; `dom="${PANEL_DOMAIN:-$dom}"`.
  - pm2: `pm2 describe zolpanel >/dev/null 2>&1` ise (`--check` değilse) `pm2 delete zolpanel` + `pm2 save`; yoksa `log "pm2 app yok"`. `--check` ise `[DRY-RUN]` raporla.
  - Caddy: `[ -n "$dom" ]` ise `remove_caddy_block "$dom"`; değilse `log "panel domaini yok (HTTP kurulum) → Caddy'ye dokunulmuyor"`.
  - Dizin: `[ "$PURGE" = "1" ]` ise (`--check` değilse) `rm -rf "${INSTALL_DIR}"` + `log "dizin silindi: ${INSTALL_DIR}"`; değilse `log "veri korundu: ${INSTALL_DIR} (silmek için --purge)"`. `--check` ise ne yapılacağını raporla.
  - Bitir: `log "Kaldırma tamam."`.
- [ ] **Step 3:** `main()` `case`'ine `uninstall) do_uninstall ;;` dalını ekle.
- [ ] **Step 4:** README'ye **Kaldırma** alt-başlığı: `sudo bash install.sh --uninstall` (veri korunur), `sudo bash install.sh --uninstall --purge` (her şeyi sil), `--check` önizleme uyarısı.
- [ ] **Step 5: Doğrula (izole awk testi)** — `/tmp`'de örnek Caddyfile oluştur:
  ```
  panel.test.com {
      reverse_proxy 127.0.0.1:3999
  }
  baska.com {
      reverse_proxy 127.0.0.1:8080
  }
  ```
  Step 1'deki awk'ı `d=panel.test.com` ile çalıştır → çıktıda **yalnız** `baska.com` bloğu kalmalı, `panel.test.com` tamamen gitmeli, brace dengesi bozulmamalı. (Bir de iç-içe brace içeren bir blokla test et: `panel.test.com { @m { ... } reverse_proxy ... }` → tümü temiz çıkmalı.) Sonucu raporla.
- [ ] **Step 6: Doğrula (canlı read-only)** — sunucuya kopyala, `bash /tmp/zp-install.sh --uninstall --check` → `[DRY-RUN]` ile "pm2 silinecek / Caddy bloğu (panel.zolvix.app) kaldırılacak / veri korunacak" raporu + "DRY-RUN: değişiklik yapılmadı". **Gerçekte hiçbir şey silinmemeli** (pm2 zolpanel hâlâ online, Caddyfile değişmemiş). `bash -n` de PASS. Temizle.
- [ ] **Step 7: Commit** `git add install.sh README.md && git commit -m "feat(install): --uninstall (+--purge) with safe Caddy block removal + --check"`

---

## Self-Review (yazar)
- **Kapsam:** update→T1, uninstall+purge→T2, güvenli Caddy kaldırma→T2 Step1, dry-run her mod→T1/T2, docs→T1S4+T2S4, doğrulama→bash -n + izole awk + canlı --check.
- **Canlı-güvenlik:** gerçek update/uninstall canlıda koşulmaz; Caddy kaldırma backup+validate+rollback; awk yalnız hedef domain bloğunu çıkarır (izole test ile kanıtlanır); --uninstall dizini varsayılan korur.
- **Idempotency:** update tekrar güvenli; uninstall eksik bileşenleri atlar.
- **Tip/isim tutarlılığı:** MODE/PURGE/CHECK_ONLY, do_update/do_uninstall/remove_caddy_block, pm2 app `zolpanel`, port 3999, PROTECTED_DOMAINS okuma — install.sh'ın mevcut değişken/fonksiyon adlarıyla uyumlu (implementer dosyayı okuyup birebir eşler).
- **Placeholder yok:** awk ve tüm komutlar somut verili.
