#!/usr/bin/env bash
# ==============================================================================
# Zolpanel — Tek-Komut Kurucu
# Kullanım:
#   sudo bash install.sh                      # tam kurulum
#   sudo bash install.sh --check              # preflight (yan-etki yok)
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
for arg in "$@"; do
  case "$arg" in
    --check) CHECK_ONLY=1 ;;
    *) err "Bilinmeyen argüman: $arg" ;;
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
    if [ "$major" -ge 20 ]; then
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
    if [ "$CHECK_ONLY" = "1" ]; then
      info "[DRY-RUN] Mevcut repo güncellecek: git -C \"${INSTALL_DIR}\" pull --ff-only"
      return
    fi
    log "Mevcut repo güncelleniyor: ${INSTALL_DIR}"
    git -C "${INSTALL_DIR}" pull --ff-only
  else
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
PROTECTED_DOMAINS=
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
  if grep -qE "^${PANEL_DOMAIN}[[:space:]]*\{" "${caddyfile}" 2>/dev/null; then
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

# ── Step 12: Ana fonksiyon ────────────────────────────────────────────────────
main() {
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

  if [ "$CHECK_ONLY" = "1" ]; then
    echo ""
    log "DRY-RUN: değişiklik yapılmadı"
    exit 0
  fi

  print_summary
}

main "$@"
