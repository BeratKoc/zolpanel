#!/bin/bash
# VPS Panel - Otomatik Kurulum Scripti
# Ubuntu 22.04/24.04 için

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log() { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err() { echo -e "${RED}[✗]${NC} $1"; exit 1; }

echo ""
echo "================================"
echo "  VPS Panel Kurulum Scripti"
echo "================================"
echo ""

# Root kontrolü
if [ "$EUID" -ne 0 ]; then
  err "Root olarak çalıştırın: sudo ./install.sh"
fi

# Sistem güncelle
log "Sistem güncelleniyor..."
apt update -qq && apt upgrade -y -qq

# Node.js kur (v20 LTS)
if ! command -v node &> /dev/null; then
  log "Node.js 20 kuruluyor..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - -qq
  apt install -y nodejs -qq
else
  log "Node.js zaten kurulu: $(node -v)"
fi

# PM2 kur
if ! command -v pm2 &> /dev/null; then
  log "PM2 kuruluyor..."
  npm install -g pm2 -q
  pm2 startup systemd -u root --hp /root
else
  log "PM2 zaten kurulu"
fi

# Caddy kur
if ! command -v caddy &> /dev/null; then
  log "Caddy kuruluyor..."
  apt install -y debian-keyring debian-archive-keyring apt-transport-https -qq
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | \
    gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | \
    tee /etc/apt/sources.list.d/caddy-stable.list > /dev/null
  apt update -qq && apt install caddy -qq
else
  log "Caddy zaten kurulu: $(caddy version)"
fi

# Uygulama dizini
INSTALL_DIR="/opt/vps-panel"
log "Uygulama $INSTALL_DIR dizinine kuruluyor..."
mkdir -p $INSTALL_DIR

# Proje dosyalarını kopyala (script ile aynı dizinde olmalı)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cp -r "$SCRIPT_DIR/backend" $INSTALL_DIR/
cp -r "$SCRIPT_DIR/frontend" $INSTALL_DIR/

# Backend bağımlılıkları
log "Backend bağımlılıkları kuruluyor..."
cd $INSTALL_DIR/backend && npm install --production -q

# Frontend build
log "Frontend build alınıyor..."
cd $INSTALL_DIR/frontend && npm install -q && npm run build -q

# Caddyfile oluştur (eğer yoksa)
CADDYFILE="/etc/caddy/Caddyfile"
if [ ! -f "$CADDYFILE" ] || [ ! -s "$CADDYFILE" ]; then
  log "Varsayılan Caddyfile oluşturuluyor..."
  cat > $CADDYFILE << 'EOF'
# VPS Panel Caddyfile
# Bu dosya otomatik yönetilmektedir.

EOF
fi

# Caddy Caddyfile'ın sahibini ayarla
chown caddy:caddy $CADDYFILE

# Panel'i PM2 ile başlat
log "Panel PM2 ile başlatılıyor..."
cd $INSTALL_DIR/backend
NODE_ENV=production pm2 start index.js \
  --name "vps-panel" \
  --cwd "$INSTALL_DIR/backend" \
  -e "$INSTALL_DIR/backend/logs/error.log" \
  -o "$INSTALL_DIR/backend/logs/out.log"

mkdir -p $INSTALL_DIR/backend/logs
pm2 save

# Caddy'yi başlat
log "Caddy başlatılıyor..."
systemctl enable caddy
systemctl start caddy || systemctl restart caddy

# Firewall (ufw)
if command -v ufw &> /dev/null; then
  warn "Firewall ayarlanıyor..."
  ufw allow 22/tcp comment "SSH" > /dev/null 2>&1 || true
  ufw allow 80/tcp comment "HTTP" > /dev/null 2>&1 || true
  ufw allow 443/tcp comment "HTTPS" > /dev/null 2>&1 || true
fi

echo ""
echo "================================"
log "Kurulum tamamlandı!"
echo "================================"
echo ""
echo "Panel şu adreste çalışıyor:"
echo "  👉  http://$(hostname -I | awk '{print $1}'):3999"
echo ""
echo "Varsayılan giriş:"
echo "  Kullanıcı: admin"
echo "  Şifre:     admin123"
echo ""
warn "İlk girişten sonra şifrenizi değiştirmeyi unutmayın!"
echo ""
echo "Panel logları:  pm2 logs vps-panel"
echo "Panel durumu:   pm2 status"
echo ""
