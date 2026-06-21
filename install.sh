#!/usr/bin/env bash
# ==============================================================================
# Zolpanel — Tek-Komut Kurucu
# Kullanım:
#   sudo bash install.sh                      # tam kurulum
#   sudo bash install.sh --check              # preflight (yan-etki yok)
#   sudo bash install.sh --update             # kodu çek, build et, pm2 restart
#   sudo bash install.sh --update --check     # güncelleme önizleme (yan-etki yok)
#   sudo bash install.sh --uninstall          # kaldır (henüz yok — Task 2'de gelir)
#   sudo bash install.sh --uninstall --purge  # kaldır + veri sil (Task 2'de gelir)
#
# Ortam değişkenleri (isteğe bağlı, varsayılanlar aşağıda):
#   INSTALL_DIR     — kurulum dizini (varsayılan: /opt/zolpanel)
#   ZOLPANEL_PORT   — uygulama portu (varsayılan: 3999; ecosystem.config.cjs'de sabit)
#   ZOLPANEL_REPO   — git deposu (varsayılan: https://github.com/BeratKoc/zolpanel.git)
#   ZOLPANEL_BRANCH — git dalı (varsayılan: main)
#   PANEL_DOMAIN    — Caddy HTTPS için alan adı (varsayılan: boş → HTTP)
# ==============================================================================

set -euo pipefail

# ── Renkli log yardımcıları ──────────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
RESET='\033[0m'

log()  { echo -e "${GREEN}[ZP]${RESET} $*"; }
warn() { echo -e "${YELLOW}[ZP UYARI]${RESET} $*"; }
err()  { echo -e "${RED}[ZP HATA]${RESET} $*" >&2; exit 1; }
info() { echo -e "${CYAN}[ZP INFO]${RESET} $*"; }

# ── Varsayılanlar ─────────────────────────────────────────────────────────────
: "${INSTALL_DIR:=/opt/zolpanel}"
: "${ZOLPANEL_PORT:=3999}"
: "${ZOLPANEL_REPO:=https://github.com/BeratKoc/zolpanel.git}"
: "${ZOLPANEL_BRANCH:=main}"
: "${PANEL_DOMAIN:=}"

# ── Argüman parse ─────────────────────────────────────────────────────────────
CHECK_ONLY=0
MODE="install"
PURGE=0
for arg in "$@"; do
  case "$arg" in
    --check)     CHECK_ONLY=1 ;;
    --update)    MODE="update" ;;
    --uninstall) MODE="uninstall" ;;
    --purge)     PURGE=1 ;;
    *) err "Bilinmeyen argüman: ${arg}" ;;
  esac
done

# ── Step 1: Root kontrolü ─────────────────────────────────────────────────────
need_root() {
  [ "$(id -u)" = "0" ] || err "root gerekli (sudo bash install.sh)"
}

# ── Step 2: OS tespiti ────────────────────────────────────────────────────────
detect_os() {
  if [ ! -f /etc/os-release ]; then
    err "'/etc/os-release' bulunamadı — Yalnız Debian/Ubuntu (apt) destekleniyor"
  fi

  # shellcheck source=/dev/null
  . /etc/os-release

  local os_id="${ID:-}"
  local os_like="${ID_LIKE:-}"

  case "$os_id" in
    debian|ubuntu) : ;;
    *)
      case "$os_like" in
        *debian*|*ubuntu*) : ;;
        *) err "Yalnız Debian/Ubuntu (apt) destekleniyor. Tespit edilen: ${os_id}" ;;
      esac
      ;;
  esac

  command -v apt-get >/dev/null || err "'apt-get' bulunamadı — Yalnız Debian/Ubuntu (apt) destekleniyor"
  log "İşletim sistemi: ${PRETTY_NAME:-${os_id}}"
}

# ── Step 3: Node.js ───────────────────────────────────────────────────────────
ensure_node() {
  if command -v node >/dev/null 2>&1; then
    local node_version
    node_version="$(node -v)"
    local major
    major="$(echo "$node_version" | sed 's/v\([0-9]*\).*/\1/')"
    # Guard: default to 0 if extraction returned empty or non-numeric
    major="${major:-0}"
    if ! echo "$major" | grep -qE '^[0-9]+$'; then
      if [ "$CHECK_ONLY" = "1" ]; then
        info "[DRY-RUN] Node sürümü belirlenemedi → kurulacak (NodeSource 22.x)"
        return
      fi
      warn "Node sürümü belirlenemedi ('$node_version') — yeniden kurulacak"
    elif [ "$major" -ge 20 ]; then
      log "Node mevcut: $node_version — atlanıyor"
      return
    else
      warn "Node sürümü $node_version eski (≥20 gerekli) — güncellenecek"
    fi
  fi

  if [ "$CHECK_ONLY" = "1" ]; then
    info "[DRY-RUN] Node.js 22.x kurulacak (NodeSource)"
    return
  fi

  log "Node.js 22.x kuruluyor (NodeSource)…"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
  log "Node kuruldu: $(node -v)"
}

# ── Step 4: Caddy ─────────────────────────────────────────────────────────────
ensure_caddy() {
  if command -v caddy >/dev/null 2>&1; then
    log "Caddy mevcut: $(caddy version 2>/dev/null || caddy --version 2>/dev/null | head -1) — atlanıyor"
    return
  fi

  if [ "$CHECK_ONLY" = "1" ]; then
    info "[DRY-RUN] Caddy resmi apt deposu eklenip kurulacak"
    return
  fi

  log "Caddy kuruluyor (resmi apt deposu)…"
  apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    | tee /etc/apt/sources.list.d/caddy-stable.list
  apt-get update
  apt-get install -y caddy
  log "Caddy kuruldu: $(caddy version 2>/dev/null | head -1)"
}

# ── Step 5: PM2 ───────────────────────────────────────────────────────────────
ensure_pm2() {
  if command -v pm2 >/dev/null 2>&1; then
    log "pm2 mevcut: $(pm2 --version) — atlanıyor"
    return
  fi

  if [ "$CHECK_ONLY" = "1" ]; then
    info "[DRY-RUN] pm2 global olarak kurulacak (npm install -g pm2)"
    return
  fi

  log "pm2 global olarak kuruluyor…"
  npm install -g pm2
  log "pm2 kuruldu: $(pm2 --version)"
}

# ── Step 6: Kaynak kod ────────────────────────────────────────────────────────
fetch_code() {
  if [ -d "${INSTALL_DIR}/.git" ]; then
    # Branch 1: Already a git repo — fast-forward pull
    if [ "$CHECK_ONLY" = "1" ]; then
      info "[DRY-RUN] Mevcut repo güncellecek: git -C \"${INSTALL_DIR}\" pull --ff-only"
      return
    fi
    log "Mevcut repo güncelleniyor: ${INSTALL_DIR}"
    git -C "${INSTALL_DIR}" pull --ff-only
  elif [ -d "${INSTALL_DIR}" ] && [ -n "$(ls -A "${INSTALL_DIR}" 2>/dev/null)" ]; then
    # Branch 2: Dir exists, non-empty, but no .git — adopt as git repo
    # checkout -f overwrites only tracked files; untracked .env / db/ / node_modules/ survive
    if [ "$CHECK_ONLY" = "1" ]; then
      info "[DRY-RUN] Mevcut dizin git deposuna dönüştürülecek (.env/db korunur): ${INSTALL_DIR}"
      return
    fi
    log "Mevcut dizin git deposuna dönüştürülüyor (.env/db korunur): ${INSTALL_DIR}"
    git -C "${INSTALL_DIR}" init -q
    git -C "${INSTALL_DIR}" remote add origin "${ZOLPANEL_REPO}" 2>/dev/null \
      || git -C "${INSTALL_DIR}" remote set-url origin "${ZOLPANEL_REPO}"
    git -C "${INSTALL_DIR}" fetch -q origin "${ZOLPANEL_BRANCH}"
    git -C "${INSTALL_DIR}" checkout -f -B "${ZOLPANEL_BRANCH}" "origin/${ZOLPANEL_BRANCH}"
  else
    # Branch 3: Dir absent or empty — fresh clone
    if [ "$CHECK_ONLY" = "1" ]; then
      info "[DRY-RUN] Repo klonlanacak: ${ZOLPANEL_REPO} (dal: ${ZOLPANEL_BRANCH}) → ${INSTALL_DIR}"
      return
    fi
    log "Repo klonlanıyor → ${INSTALL_DIR}…"
    git clone --branch "${ZOLPANEL_BRANCH}" "${ZOLPANEL_REPO}" "${INSTALL_DIR}"
  fi
  log "Kaynak kod hazır: ${INSTALL_DIR}"
}

# ── Step 7: .env dosyası ──────────────────────────────────────────────────────
ensure_env() {
  if [ -f "${INSTALL_DIR}/.env" ]; then
    log "Mevcut .env korundu — dokunulmadı"
    return
  fi

  if [ "$CHECK_ONLY" = "1" ]; then
    info "[DRY-RUN] .env yok → yeni .env oluşturulacak (JWT_SECRET, PORT, vb.)"
    return
  fi

  log ".env oluşturuluyor: ${INSTALL_DIR}/.env"
  local jwt_secret
  jwt_secret="$(openssl rand -hex 48)"

  cat > "${INSTALL_DIR}/.env" <<EOF
JWT_SECRET=${jwt_secret}
JWT_EXPIRES=7d
PORT=${ZOLPANEL_PORT}
NODE_ENV=production
CADDYFILE_PATH=/etc/caddy/Caddyfile
DB_DIR=${INSTALL_DIR}/data
PROTECTED_DOMAINS=${PANEL_DOMAIN}
EOF

  chmod 600 "${INSTALL_DIR}/.env"
  log ".env oluşturuldu ve izinleri ayarlandı (chmod 600)"
}

# ── Step 8: Uygulama derleme ──────────────────────────────────────────────────
build_app() {
  if [ "$CHECK_ONLY" = "1" ]; then
    info "[DRY-RUN] Build yapılacak: cd \"${INSTALL_DIR}\" && npm install && npm run build"
    return
  fi

  log "Bağımlılıklar yükleniyor ve uygulama derleniyor…"
  cd "${INSTALL_DIR}"
  npm install
  npm run build
  log "Uygulama derlendi"
}

# ── Step 9: Caddy yapılandırması ──────────────────────────────────────────────
configure_caddy() {
  if [ -z "${PANEL_DOMAIN}" ]; then
    local _ip
    _ip="$(hostname -I | awk '{print $1}')"
    log "PANEL_DOMAIN tanımlı değil → panel HTTP ile erişilebilir: http://${_ip}:${ZOLPANEL_PORT}"
    return
  fi

  local caddyfile="/etc/caddy/Caddyfile"

  # Alan adı zaten ekli mi kontrol et
  if [ -f "${caddyfile}" ] && _caddy_block_exists "${PANEL_DOMAIN}" "${caddyfile}"; then
    log "Caddy: '${PANEL_DOMAIN}' zaten Caddyfile'da mevcut — atlanıyor"
    return
  fi

  if [ "$CHECK_ONLY" = "1" ]; then
    info "[DRY-RUN] Caddyfile'a '${PANEL_DOMAIN}' bloğu eklenecek (reverse_proxy 127.0.0.1:${ZOLPANEL_PORT})"
    return
  fi

  log "Caddyfile yedekleniyor: ${caddyfile}.zolpanel-install.bak"
  cp "${caddyfile}" "${caddyfile}.zolpanel-install.bak"

  log "Caddyfile'a '${PANEL_DOMAIN}' bloğu ekleniyor…"
  cat >> "${caddyfile}" <<EOF

${PANEL_DOMAIN} {
    reverse_proxy 127.0.0.1:${ZOLPANEL_PORT}
}
EOF

  log "Caddy yapılandırması doğrulanıyor…"
  if ! caddy validate --config "${caddyfile}" --adapter caddyfile; then
    warn "Caddy doğrulaması başarısız — yedekten geri yükleniyor"
    cp "${caddyfile}.zolpanel-install.bak" "${caddyfile}"
    err "Caddy yapılandırması geçersiz. Yedek geri yüklendi: ${caddyfile}.zolpanel-install.bak"
  fi

  log "Caddy yeniden yükleniyor…"
  systemctl reload caddy
  log "Caddy yapılandırması güncellendi ve yeniden yüklendi"
}

# ── Step 10: PM2 başlatma ─────────────────────────────────────────────────────
start_pm2() {
  if [ "$CHECK_ONLY" = "1" ]; then
    info "[DRY-RUN] pm2 başlatılacak/yeniden başlatılacak, pm2 save + pm2 startup çalıştırılacak"
    return
  fi

  cd "${INSTALL_DIR}"

  if pm2 describe zolpanel >/dev/null 2>&1; then
    log "pm2: 'zolpanel' zaten çalışıyor — yeniden başlatılıyor (--update-env)…"
    pm2 restart zolpanel --update-env
  else
    log "pm2: 'zolpanel' başlatılıyor…"
    pm2 start ecosystem.config.cjs
  fi

  pm2 save
  log "pm2 startup yapılandırılıyor (systemd — idempotent)…"
  pm2 startup systemd -u root --hp /root || true
  log "pm2 hazır"
}

# ── Step 10b: Sağlık kontrolü ─────────────────────────────────────────────────
wait_for_health() {
  if [ "$CHECK_ONLY" = "1" ]; then
    info "[DRY-RUN] Kurulum sonrası sağlık kontrolü yapılacak (http://127.0.0.1:3999/api/health)"
    return 0
  fi

  local max_attempts=20
  local attempt=1
  local wait_seconds=2

  log "Panel sağlık kontrolü başlatılıyor (max ${max_attempts} deneme)…"

  while [ "$attempt" -le "$max_attempts" ]; do
    if curl -fsS --max-time 3 "http://127.0.0.1:3999/api/health" 2>/dev/null | grep -q '"status":"ok"'; then
      log "Panel ayakta — sağlık kontrolü OK"
      return 0
    fi

    if [ "$attempt" -lt "$max_attempts" ]; then
      echo -n "."
      sleep "$wait_seconds"
    fi
    attempt=$((attempt + 1))
  done

  echo ""
  warn "Panel sağlık kontrolü ${max_attempts} deneme içinde geçemedi"
  warn "Panel başlamaya devam ediyor — durumu kontrol etmek için: pm2 logs zolpanel"
  return 0
}

# ── Step 11: Özet ─────────────────────────────────────────────────────────────
print_summary() {
  local server_ip
  server_ip="$(hostname -I | awk '{print $1}')"

  local panel_url
  if [ -n "${PANEL_DOMAIN}" ]; then
    panel_url="https://${PANEL_DOMAIN}"
  else
    panel_url="http://${server_ip}:${ZOLPANEL_PORT}"
  fi

  echo ""
  echo -e "${GREEN}╔══════════════════════════════════════════╗${RESET}"
  echo -e "${GREEN}║        Zolpanel Kurulumu Tamamlandı      ║${RESET}"
  echo -e "${GREEN}╚══════════════════════════════════════════╝${RESET}"
  echo ""
  echo -e "  Panel URL   : ${CYAN}${panel_url}${RESET}"
  echo ""

  # İlk boot parolasını pm2 loglarından çekmeye çalış
  local sifre_satiri
  sifre_satiri="$(pm2 logs zolpanel --nostream --lines 50 2>/dev/null | grep 'Şifre' | tail -1 || true)"

  if [ -n "$sifre_satiri" ]; then
    echo -e "  Admin Bilgileri (ilk boot):"
    echo -e "  ${sifre_satiri}"
  else
    warn "Admin parolası bu çıktıda görünmüyor."
    warn "Parola daha önce üretildi — görmek için: pm2 logs zolpanel"
  fi

  echo ""
}

# ── Yardımcı: Caddyfile'da "domain {" bloğu var mı? ──────────────────────────
# index() ile tam literal eşleşme — domain'deki regex meta-karakterleri (. gibi)
# yanlış eşleşmeye yol açmaz. Kaldırma awk'ıyla aynı eşleşme mantığı.
_caddy_block_exists() {
  # $1 = domain, $2 = caddyfile
  awk -v d="$1" 'index($0,d)==1 && substr($0,length(d)+1) ~ /^[[:space:]]*\{/ {found=1; exit} END{exit !found}' "$2"
}

# ── Uninstall: Caddy bloğunu brace-farkında awk ile temizle ──────────────────
remove_caddy_block() {
  local domain="$1"
  local CADDYFILE="${CADDYFILE_PATH:-/etc/caddy/Caddyfile}"

  # Dosya yoksa veya blok yoksa atla
  if [ ! -f "$CADDYFILE" ]; then
    log "Caddyfile bulunamadı: ${CADDYFILE} — atlanıyor"
    return 0
  fi

  if ! _caddy_block_exists "$domain" "$CADDYFILE"; then
    log "Caddy bloğu yok (${domain}), atlanıyor"
    return 0
  fi

  # --check modunda sadece raporla
  if [ "$CHECK_ONLY" = "1" ]; then
    info "[DRY-RUN] Caddy panel bloğu kaldırılacak: ${domain}"
    return 0
  fi

  # Yedek al
  local bak="${CADDYFILE}.zolpanel-uninstall.bak"
  log "Caddyfile yedekleniyor: ${bak}"
  cp "$CADDYFILE" "$bak"

  # Brace-farkında awk ile yalnız hedef bloğu çıkar
  # index() ile tam literal eşleşme — regex meta-karakterleri (. gibi) güvenli
  awk -v d="$domain" '
    BEGIN{skip=0; depth=0}
    skip==0 && index($0,d)==1 && substr($0,length(d)+1) ~ /^[[:space:]]*\{/ {skip=1; depth=1; next}
    skip==1 { n=gsub(/\{/,"{"); m=gsub(/\}/,"}"); depth+=n-m; if(depth<=0) skip=0; next }
    {print}
  ' "$CADDYFILE" > "${CADDYFILE}.zolpanel.tmp" && mv "${CADDYFILE}.zolpanel.tmp" "$CADDYFILE"

  # Doğrula
  log "Caddy yapılandırması doğrulanıyor…"
  if ! caddy validate --config "$CADDYFILE" --adapter caddyfile; then
    warn "Caddy doğrulama başarısız — yedekten geri yükleniyor"
    cp "$bak" "$CADDYFILE"
    err "Caddy doğrulama başarısız, geri alındı"
  fi

  log "Caddy yeniden yükleniyor…"
  systemctl reload caddy || warn "Caddy yeniden yüklenemedi (manuel kontrol edin)"
  log "Caddy bloğu kaldırıldı: ${domain}"
}

# ── Uninstall: pm2 sil, Caddy bloğunu kaldır, (opsiyonel) dizini sil ─────────
do_uninstall() {
  need_root

  echo ""
  log "Zolpanel kaldırılıyor…"
  if [ "$CHECK_ONLY" = "1" ]; then
    warn "PREFLIGHT modu: değişiklik yapılmayacak"
  fi
  echo ""

  # Panel domain bilgisini belirle:
  #   1. PANEL_DOMAIN ortam değişkeni (override)
  #   2. Caddyfile'dan otomatik tespit (panel portuna reverse_proxy yapan blok)
  local dom
  dom="${PANEL_DOMAIN:-}"
  if [ -z "${dom}" ]; then
    local _cf="${CADDYFILE_PATH:-/etc/caddy/Caddyfile}"
    if [ -f "${_cf}" ]; then
      dom="$(awk -v port="${ZOLPANEL_PORT}" '
        /^[^[:space:]#].*\{[[:space:]]*$/ { hdr=$0; sub(/[[:space:]]*\{.*/,"",hdr) }
        $0 ~ ("reverse_proxy[[:space:]]+127\\.0\\.0\\.1:" port) { print hdr; exit }
      ' "${_cf}" | awk '{print $1}' | tr -d ',')" || dom=""
    fi
  fi

  # PM2 uygulamasını kaldır
  if pm2 describe zolpanel >/dev/null 2>&1; then
    if [ "$CHECK_ONLY" = "1" ]; then
      info "[DRY-RUN] pm2 uygulaması silinecek: zolpanel"
    else
      log "pm2 uygulaması siliniyor: zolpanel"
      pm2 delete zolpanel
      pm2 save
    fi
  else
    log "pm2 app yok (zolpanel) — atlanıyor"
  fi

  # Caddy bloğunu kaldır
  if [ -n "$dom" ]; then
    remove_caddy_block "$dom"
  else
    log "panel domaini yok (HTTP kurulum) → Caddy'ye dokunulmuyor"
  fi

  # Kurulum dizini
  if [ "$PURGE" = "1" ]; then
    if [ "$CHECK_ONLY" = "1" ]; then
      info "[DRY-RUN] Kurulum dizini silinecek: ${INSTALL_DIR}"
    else
      rm -rf "${INSTALL_DIR}"
      log "dizin silindi: ${INSTALL_DIR}"
    fi
  else
    if [ "$CHECK_ONLY" = "1" ]; then
      info "[DRY-RUN] Kurulum dizini korunacak: ${INSTALL_DIR} (silmek için --purge)"
    else
      log "veri korundu: ${INSTALL_DIR} (silmek için --purge)"
    fi
  fi

  if [ "$CHECK_ONLY" = "1" ]; then
    echo ""
    log "DRY-RUN: değişiklik yapılmadı"
    exit 0
  fi

  log "Kaldırma tamam."
}

# ── Update: kodu tazele, build et, pm2 restart ────────────────────────────────
do_update() {
  need_root
  [ -d "${INSTALL_DIR}" ] || err "kurulum yok: ${INSTALL_DIR}"

  echo ""
  log "Zolpanel güncelleniyor…"
  if [ "$CHECK_ONLY" = "1" ]; then
    warn "PREFLIGHT modu: değişiklik yapılmayacak"
  fi
  echo ""

  fetch_code
  ensure_env
  build_app
  start_pm2
  wait_for_health

  if [ "$CHECK_ONLY" = "1" ]; then
    echo ""
    log "DRY-RUN: değişiklik yapılmadı"
    exit 0
  fi

  log "Güncelleme tamam."
}

# ── Step 12: Ana fonksiyon ────────────────────────────────────────────────────
main() {
  case "$MODE" in
    install)
      echo ""
      log "Zolpanel kurucusu başlatılıyor…"
      if [ "$CHECK_ONLY" = "1" ]; then
        warn "PREFLIGHT modu: değişiklik yapılmayacak"
      fi
      echo ""

      need_root
      detect_os
      ensure_node
      ensure_caddy
      ensure_pm2
      fetch_code
      ensure_env
      build_app
      configure_caddy
      start_pm2
      wait_for_health

      if [ "$CHECK_ONLY" = "1" ]; then
        echo ""
        log "DRY-RUN: değişiklik yapılmadı"
        exit 0
      fi

      print_summary
      ;;
    update)
      do_update
      ;;
    uninstall)
      do_uninstall
      ;;
  esac
}

main "$@"
