#!/usr/bin/env bash
# Zolpanel (Next.js) deploy: local repo -> sunucu /opt/zolpanel
# Kullanım: bash deploy.sh
#
# Gönderir: app/, lib/, components/, instrumentation.ts, next.config.ts,
#           tsconfig.json, package.json, package-lock.json, ecosystem.config.cjs
# Göndermez/ezmez: .env, db/data, node_modules, .next, eski backend/ + frontend/, docs/
# Sunucuda: npm install + npm run build + pm2 (ilk seferde ecosystem ile start,
#           sonra restart). Sonunda health + caddy validate.
set -euo pipefail

SRV="root@191.44.68.81"
DEST="/opt/zolpanel"
LOCAL="$(cd "$(dirname "$0")" && pwd)"

echo ">> Sunucuya bağlanılıyor ($SRV)..."
TS="$(ssh "$SRV" 'date +%Y%m%d-%H%M%S')"
ssh "$SRV" "mkdir -p $DEST"

echo ">> [yedek] mevcut sürüm (varsa) yedekleniyor..."
ssh "$SRV" "[ -d $DEST/app ] && tar czf /tmp/zolpanel-bak-$TS.tgz -C $DEST --exclude=node_modules --exclude=.next --exclude='db/data' . && echo '   yedek: /tmp/zolpanel-bak-$TS.tgz' || echo '   (ilk deploy, yedek yok)'"

echo ">> [gönder] kaynak dosyalar (eski backend/frontend, node_modules, .next, .env, db/data hariç)..."
tar czf - -C "$LOCAL" \
  --exclude=node_modules --exclude=.next --exclude=.git \
  --exclude=.env --exclude='.env.local' --exclude='db/data' \
  --exclude=backend --exclude=frontend --exclude=docs \
  --exclude='*.bak' --exclude='tsconfig.tsbuildinfo' \
  app lib components instrumentation.ts next.config.ts tsconfig.json \
  package.json package-lock.json ecosystem.config.cjs next-env.d.ts \
  | ssh "$SRV" "cd $DEST && tar xzf -"

echo ">> [server] npm install + build..."
ssh "$SRV" "cd $DEST && npm install --no-audit --no-fund && npm run build"

echo ">> [server] pm2 (start/restart)..."
ssh "$SRV" "cd $DEST && (pm2 describe zolpanel >/dev/null 2>&1 && pm2 restart zolpanel --update-env || pm2 start ecosystem.config.cjs) && pm2 save"

echo ">> [doğrula] health + caddy..."
sleep 3
ssh "$SRV" "curl -s http://127.0.0.1:3999/api/health && echo && caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile 2>&1 | tail -1"
echo "BİTTİ."
