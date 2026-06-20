#!/usr/bin/env bash
# Zolpanel deploy: local vps-panel-latest -> sunucu /opt/vps-panel
# Kullanım:
#   bash deploy.sh backend     # sadece backend (kopya + restart)
#   bash deploy.sh frontend    # sadece frontend (kopya + build)
#   bash deploy.sh all         # ikisi birden
#   bash deploy.sh deps        # backend + npm install
#
# Güvenlik: .env, db/data, node_modules ASLA gönderilmez/ezilmez.
set -euo pipefail

SRV="root@191.44.68.81"
DEST="/opt/vps-panel"
LOCAL="$(cd "$(dirname "$0")" && pwd)"
MODE="${1:-backend}"

echo ">> Sunucuya bağlanılıyor ($SRV)..."
TS="$(ssh "$SRV" 'date +%Y%m%d-%H%M%S')"

deploy_backend() {
  echo ">> [backend] Sunucuda yedek alınıyor..."
  ssh "$SRV" "tar czf /tmp/backend-bak-$TS.tgz -C $DEST/backend --exclude=node_modules --exclude='db/data' . && echo '   yedek: /tmp/backend-bak-$TS.tgz'"

  echo ">> [backend] Dosyalar gönderiliyor (.env, db/data, node_modules hariç)..."
  tar czf - -C "$LOCAL/backend" \
    --exclude=node_modules --exclude=.env --exclude='db/data' --exclude='*.bak*' . \
    | ssh "$SRV" "cd $DEST/backend && tar xzf -"

  echo ">> [backend] Syntax kontrolü..."
  ssh "$SRV" "cd $DEST/backend && for f in index.js load-env.js ecosystem.config.js routes/*.js services/caddy.js services/pm2.js services/portManager.js services/memoryTracker.js; do node --check \"\$f\"; done && echo '   syntax OK'"

  if [ "$MODE" = "deps" ]; then
    echo ">> [backend] npm install..."
    ssh "$SRV" "cd $DEST/backend && npm install --omit=dev --no-audit --no-fund"
  fi

  echo ">> [backend] pm2 restart + health..."
  ssh "$SRV" "pm2 restart vps-panel >/dev/null && sleep 2 && curl -s http://127.0.0.1:3999/api/health && echo"
}

deploy_frontend() {
  echo ">> [frontend] Dosyalar gönderiliyor (node_modules/dist hariç)..."
  tar czf - -C "$LOCAL/frontend" --exclude=node_modules --exclude=dist . \
    | ssh "$SRV" "cd $DEST/frontend && tar xzf -"
  echo ">> [frontend] Sunucuda build..."
  ssh "$SRV" "cd $DEST/frontend && npm install --no-audit --no-fund && npm run build && echo '   build OK (panel frontend/dist serve ediyor)'"
}

case "$MODE" in
  backend|deps) deploy_backend ;;
  frontend)     deploy_frontend ;;
  all)          deploy_backend; deploy_frontend ;;
  *) echo "Geçersiz mod: $MODE  (backend|frontend|all|deps)"; exit 1 ;;
esac

echo ">> Caddy validate..."
ssh "$SRV" "caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile 2>&1 | tail -1"
echo "BİTTİ. (geri almak için: ssh $SRV 'tar xzf /tmp/backend-bak-$TS.tgz -C $DEST/backend')"
