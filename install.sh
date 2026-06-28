#!/usr/bin/env bash
# ==============================================================================
# Zolpanel — Tek-Komut Kurucu (yalnız ilk kurulum)
# Kullanım:
#   sudo bash install.sh
#   curl -fsSL https://raw.githubusercontent.com/BeratKoc/zolpanel/main/install.sh | sudo bash
#
# Güncelleme: deploy.sh (local→sunucu rsync) kullanın — bu script güncelleme yapmaz.
#
# Ortam değişkenleri (isteğe bağlı, varsayılanlar aşağıda):
#   INSTALL_DIR     — kurulum dizini (varsayılan: /opt/zolpanel)
#   ZOLPANEL_PORT   — Caddy hedef portu / özet URL (varsayılan: 3999; uygulama 3999'da sabit)
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

# ── Varsayılanlar ─────────────────────────────────────────────────────────────
: "${INSTALL_DIR:=/opt/zolpanel}"
: "${ZOLPANEL_PORT:=3999}"
: "${ZOLPANEL_REPO:=https://github.com/BeratKoc/zolpanel.git}"
: "${ZOLPANEL_BRANCH:=main}"
: "${PANEL_DOMAIN:=}"

# Bu sürüm yalnız tam kurulum yapar — argüman kabul etmez.
if [ "$#" -gt 0 ]; then
  err "Bu script argüman almaz. Güncelleme için: deploy.sh. Verilen: $*"
fi

# ── Root kontrolü ─────────────────────────────────────────────────────────────
need_root() {
  [ "$(id -u)" = "0" ] || err "root gerekli (sudo bash install.sh)"
}

# ── OS tespiti ────────────────────────────────────────────────────────────────
detect_os() {
  [ -f /etc/os-release ] || err "'/etc/os-release' bulunamadı — Yalnız Debian/Ubuntu (apt) destekleniyor"

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

# ── Node.js ───────────────────────────────────────────────────────────────────
ensure_node() {
  if command -v node >/dev/null 2>&1; then
    local node_version major
    node_version="$(node -v)"
    major="$(echo "$node_version" | sed 's/v\([0-9]*\).*/\1/')"
    major="${major:-0}"
    if echo "$major" | grep -qE '^[0-9]+$' && [ "$major" -ge 20 ]; then
      log "Node mevcut: $node_version — atlanıyor"
      return
    fi
    warn "Node sürümü '$node_version' uygun değil (≥20 gerekli) — kurulacak"
  fi

  log "Node.js 22.x kuruluyor (NodeSource)…"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
  log "Node kuruldu: $(node -v)"
}

# ── Caddy ─────────────────────────────────────────────────────────────────────
ensure_caddy() {
  if command -v caddy >/dev/null 2>&1; then
    log "Caddy mevcut: $(caddy version 2>/dev/null | head -1) — atlanıyor"
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

# ── PM2 ───────────────────────────────────────────────────────────────────────
ensure_pm2() {
  if command -v pm2 >/dev/null 2>&1; then
    log "pm2 mevcut: $(pm2 --version) — atlanıyor"
    return
  fi

  log "pm2 global olarak kuruluyor…"
  npm install -g pm2
  log "pm2 kuruldu: $(pm2 --version)"
}

# ── Kaynak kod ────────────────────────────────────────────────────────────────
fetch_code() {
  if [ -d "${INSTALL_DIR}/.git" ]; then
    log "Mevcut repo güncelleniyor: ${INSTALL_DIR}"
    git -C "${INSTALL_DIR}" pull --ff-only
  else
    log "Repo klonlanıyor → ${INSTALL_DIR}…"
    git clone --branch "${ZOLPANEL_BRANCH}" "${ZOLPANEL_REPO}" "${INSTALL_DIR}"
  fi
  log "Kaynak kod hazır: ${INSTALL_DIR}"
}

# ── .env dosyası ──────────────────────────────────────────────────────────────
ensure_env() {
  if [ -f "${INSTALL_DIR}/.env" ]; then
    log "Mevcut .env korundu — dokunulmadı"
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
DB_DIR=${INSTALL_DIR}/db/data
PROTECTED_DOMAINS=${PANEL_DOMAIN}
EOF

  chmod 600 "${INSTALL_DIR}/.env"
  log ".env oluşturuldu ve izinleri ayarlandı (chmod 600)"
}

# ── Uygulama derleme ──────────────────────────────────────────────────────────
build_app() {
  log "Bağımlılıklar yükleniyor ve uygulama derleniyor…"
  cd "${INSTALL_DIR}"
  npm install
  npm run build
  log "Uygulama derlendi"
}

# ── Caddy yapılandırması ──────────────────────────────────────────────────────
configure_caddy() {
  if [ -z "${PANEL_DOMAIN}" ]; then
    local _ip
    _ip="$(hostname -I | awk '{print $1}')"
    log "PANEL_DOMAIN tanımlı değil → panel HTTP ile erişilebilir: http://${_ip}:${ZOLPANEL_PORT}"
    return
  fi

  local caddyfile="/etc/caddy/Caddyfile"
  # Domain'deki '.' gibi regex meta-karakterlerini kaçır (yanlış eşleşmeyi önle)
  local domain_re="${PANEL_DOMAIN//./\\.}"

  # Zaten ekliyse atla (idempotent): "domain {" bloğu başlığı var mı?
  if [ -f "${caddyfile}" ] && grep -qE "^[[:space:]]*${domain_re}[[:space:]]*\{" "${caddyfile}"; then
    log "Caddy: '${PANEL_DOMAIN}' zaten Caddyfile'da mevcut — atlanıyor"
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

# ── PM2 başlatma ──────────────────────────────────────────────────────────────
start_pm2() {
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

# ── Sağlık kontrolü ───────────────────────────────────────────────────────────
wait_for_health() {
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

# ── Özet ──────────────────────────────────────────────────────────────────────
print_summary() {
  local server_ip panel_url
  server_ip="$(hostname -I | awk '{print $1}')"

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

# ── Ana akış ──────────────────────────────────────────────────────────────────
main() {
  echo ""
  log "Zolpanel kurucusu başlatılıyor…"
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
  print_summary
}

main "$@"
