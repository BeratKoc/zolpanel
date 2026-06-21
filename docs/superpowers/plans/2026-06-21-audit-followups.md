# Audit Follow-ups (Low-Priority Fixes) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Genel denetimde bulunan düşük öncelikli (ama gerçek) sorunları gider: i18n hardcoded metinler + ölü anahtarlar, i18n parity testi, polling/perf cila, sayısal gösterim sağlamlığı, deploy/install sağlamlaştırma.

**Architecture:** Bağımsız 5 görev; her biri ayrı dosya kümesine dokunur, ayrı test/gözden geçirme çevrimi taşır.

**Tech Stack:** Next.js 15 + TS, next-intl (6 dil tr/en/zh/es/de/fr), node:test, bash (deploy.sh/install.sh).

## Global Constraints
- 6 dil her zaman senkron: yeni anahtar TÜM `messages/{tr,en,zh,es,de,fr}.json`'a aynı anahtar setiyle eklenir; silinen anahtar 6'sından da silinir. tr/en birincil; zh/es/de/fr gerçek çeviri (İngilizce kopya değil).
- Mevcut davranışı bozma; `npx tsc --noEmit`, `npm test`, `npm run build`, `npm run e2e` yeşil kalır. Windows EPERM → `rm -rf .next`.
- Lucide ikonlar, emoji yok. requireAuth/Caddy/SSL davranışı değişmez.
- Commit yazarı `BeratKoc <ahmetberatkoc0@gmail.com>`; **Co-Authored-By trailer EKLENMEZ** (kullanıcı Claude atfı istemiyor).

---

### Task 1: i18n — hardcoded metinleri çevir + ölü anahtarları sil

**Files:** Modify `components/ui.tsx`, `components/LanguageSwitcher.tsx`, `app/(panel)/layout.tsx`, `app/(panel)/logs/page.tsx`, `app/(panel)/processes/page.tsx`, `components/domains/AddDomainModal.tsx`, `components/domains/EditDomainModal.tsx`; Modify `messages/{tr,en,zh,es,de,fr}.json`.

**Interfaces:** Yeni anahtarlar `common.close`, `common.menu`, `dashboard.max`. Var olan kullanılacak: `common.language`, `processes.colRestarts`, `processes.colUptime`.

- [ ] **Step 1:** 6 dile yeni anahtarlar ekle (mevcut `common`/`dashboard` namespace'lerine):
  - `common.close`: tr "Kapat", en "Close", de "Schließen", es "Cerrar", fr "Fermer", zh "关闭"
  - `common.menu`: tr "Menü", en "Menu", de "Menü", es "Menú", fr "Menu", zh "菜单"
  - `dashboard.max`: tr "maks", en "max", de "max", es "máx", fr "max", zh "最大"
- [ ] **Step 2:** Ölü anahtarları 6 dilden de SİL: `settings.reloadCaddy`, `settings.caddyReloaded`, `dashboard.caddyReload` (kaldırılan reload butonundan kalan; kodda `t(...)` çağrısı yok — silmeden önce `grep -rn "reloadCaddy\|caddyReloaded\|caddyReload" app components` ile teyit et, çağrı çıkarsa silme).
- [ ] **Step 3:** `components/ui.tsx` Modal: `aria-label="kapat"` → `useTranslations()` ekle, `aria-label={t('common.close')}`. (Modal zaten client; X butonu satırı.)
- [ ] **Step 4:** `components/LanguageSwitcher.tsx`: `aria-label="language"` → `t('common.language')` (anahtar var; `useTranslations` ekle/kullan).
- [ ] **Step 5:** `app/(panel)/layout.tsx`: hamburger `aria-label="menu"` → `t('common.menu')`.
- [ ] **Step 6:** `app/(panel)/logs/page.tsx`: `toLocaleTimeString('tr-TR', ...)` ve `toLocaleDateString('tr-TR', ...)` → aktif locale ile. `import { useLocale } from 'next-intl'`; `const locale = useLocale();` ve `'tr-TR'` yerine `locale`.
- [ ] **Step 7:** `app/(panel)/processes/page.tsx`: masaüstü tablo başlığındaki sabit `<span>Restart</span>` / `<span>Uptime</span>` → `{t('processes.colRestarts')}` / `{t('processes.colUptime')}` (anahtarlar zaten mobil `data-label`'da kullanılıyor).
- [ ] **Step 8:** `AddDomainModal.tsx` + `EditDomainModal.tsx`: placeholder `"ornek.com"` → `"example.com"`, `"ornek.net, ornek.org"` → `"example.net, example.org"` (nötr örnek; i18n değil, literal değişimi).
- [ ] **Step 9:** `npx tsc --noEmit` + `npm test` + `npm run build` + `npm run e2e` PASS. (e2e Türkçe çalışır; başlık/aria değişiklikleri mevcut testleri bozmamalı — bozarsa testteki seçiciyi değil, tutarlıysa kontrol et.)
- [ ] **Step 10: Commit** `git add -A && git commit -m "i18n: translate hardcoded close/menu/lang/date/table strings, drop dead keys"`

---

### Task 2: i18n parity + kullanılan-anahtar unit testi

**Files:** Create `lib/i18n.test.ts`.

**Interfaces:** node:test; `messages/*.json` ve kaynak taraması.

- [ ] **Step 1: Test yaz** `lib/i18n.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync, readdirSync } from 'fs';
import path from 'path';

const LOCALES = ['tr', 'en', 'zh', 'es', 'de', 'fr'];
const root = path.join(__dirname, '..');

function flatten(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? flatten(v as Record<string, unknown>, `${prefix}${k}.`)
      : [`${prefix}${k}`]);
}
function loadKeys(locale: string): Set<string> {
  return new Set(flatten(JSON.parse(readFileSync(path.join(root, 'messages', `${locale}.json`), 'utf8'))));
}

test('6 dil aynı anahtar setine sahip (parity)', () => {
  const ref = loadKeys('en');
  for (const loc of LOCALES) {
    const k = loadKeys(loc);
    const missing = [...ref].filter((x) => !k.has(x));
    const extra = [...k].filter((x) => !ref.has(x));
    assert.deepStrictEqual({ loc, missing, extra }, { loc, missing: [], extra: [] });
  }
});

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return /\.(ts|tsx)$/.test(e.name) ? [p] : [];
  });
}

test('kodda kullanılan literal t(\x27...\x27) anahtarları en.json\x27da mevcut', () => {
  const en = loadKeys('en');
  const files = [...walk(path.join(root, 'app')), ...walk(path.join(root, 'components'))];
  const re = /[^a-zA-Z]t\(\s*['"]([a-zA-Z0-9_.]+)['"]/g;
  const missing: string[] = [];
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    let m;
    while ((m = re.exec(src))) {
      if (!en.has(m[1])) missing.push(`${path.basename(f)}: ${m[1]}`);
    }
  }
  assert.deepStrictEqual(missing, []);
});
```
- [ ] **Step 2:** `npm test` → iki yeni test PASS (Task 1 sonrası ham/eksik anahtar kalmamalı). Dinamik `t(\`nav.${id}\`)` regex'e takılmaz (literal değil) — bilinçli.
- [ ] **Step 3: Commit** `git add lib/i18n.test.ts && git commit -m "test(i18n): locale parity + used-key coverage"`

---

### Task 3: Frontend polling/perf cilası

**Files:** Modify `app/(panel)/logs/page.tsx`, `app/(panel)/processes/page.tsx`.

- [ ] **Step 1:** Her iki sayfadaki 5sn polling `setInterval` callback'inin başına `if (document.hidden) return;` ekle (Domainler sayfasındaki kalıbın aynısı) — sekme arka plandayken istek atma.
- [ ] **Step 2:** `logs/page.tsx`: filtre değişiminde çift fetch'i tekille — `useEffect(() => { load(); }, [filter])` ZATEN anlık yüklüyor; polling `useEffect`'i ilk render'da ekstra `load()` çağırmasın, yalnız interval kursun (cleanup'ta temizle). (İlk yükleme `[filter]` effect'inden gelir.) Eğer ayrı bir mount-time `load()` yoksa dokunma.
- [ ] **Step 3:** `npx tsc --noEmit` + `npm run build` + `npm run e2e` PASS.
- [ ] **Step 4: Commit** `git add "app/(panel)/logs/page.tsx" "app/(panel)/processes/page.tsx" && git commit -m "perf(ui): pause logs/processes polling when tab hidden; dedupe logs fetch"`

---

### Task 4: Sayısal gösterim sağlamlığı + rateLimit eviction

**Files:** Modify `app/(panel)/dashboard/page.tsx`, `app/(panel)/settings/page.tsx`, `components/processes/shared.tsx`, `lib/server/rateLimit.ts`.

- [ ] **Step 1: `formatBytes`** (3 dosyada): `if (!bytes) return ...` → `if (bytes == null || Number.isNaN(bytes) || bytes < 0) return '—';` (0 geçerli değer olarak gösterilsin; NaN/undefined `—`). Üç dosyada da tutarlı `'—'` döndür. (dashboard ve settings'te `formatBytes`; processes/shared.tsx'te de `formatBytes` var.)
- [ ] **Step 2: `formatUptime`** (`components/processes/shared.tsx`): negatif uptime'ı kırp — `const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));`.
- [ ] **Step 3: Docker `B` birimi** (`lib/server/memoryTracker.ts` `getDockerMemory`): regex `/([\d.]+)([KMG]iB)/` → `/([\d.]+)(B|[KMG]iB)/` ve `if (unit === 'B') memoryMB = val / (1024 * 1024);` ekle (idle container 0 yerine gerçek değer).
- [ ] **Step 4: `rateLimit`** (`lib/server/rateLimit.ts`): süresi dolan kaydı okurken sil — mevcut "yeni pencere" dalında `hits.set(...)` öncesi/yerine `if (rec && now > rec.reset) { hits.delete(key); }` ile expired girdiyi temizle (Map sınırsız büyümesin). Davranış aynı kalmalı (expired → izin ver).
- [ ] **Step 5:** `npx tsc --noEmit` + `npm test` + `npm run build` PASS.
- [ ] **Step 6: Commit** `git add -A && git commit -m "fix(display): formatBytes NaN guard, clamp uptime, docker B unit, rateLimit eviction"`

---

### Task 5: Deploy/install sağlamlaştırma

**Files:** Create `.env.example`; Modify `deploy.sh`, `ecosystem.config.cjs`.

- [ ] **Step 1: `.env.example`** oluştur (sunucudaki gerçek anahtar setiyle, açıklamalı, secret'sız):
```env
# Zolpanel ortam değişkenleri (.env olarak kopyalayın)
JWT_SECRET=        # ZORUNLU — node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
JWT_EXPIRES=24h
PORT=3999
NODE_ENV=production
CADDYFILE_PATH=/etc/caddy/Caddyfile
DB_DIR=/opt/zolpanel/db/data
PROTECTED_DOMAINS=   # panel domaini (panelin dokunmayacağı blok)
```
- [ ] **Step 2: `ecosystem.config.cjs`** .env parse'ında değerin etrafındaki tırnağı soy: `env[k.trim()] = v.join('=').trim();` → sonuna `.replace(/^["']|["']$/g, '')` ekle (tırnaklı .env'lerde sağlamlık).
- [ ] **Step 3: `deploy.sh`** `npm install ... && npm run build` SONRASI, pm2 restart ÖNCESİ iki guard ekle (sunucuda çalışır):
  - `.env` + JWT_SECRET kontrolü: `ssh "$SRV" "grep -q '^JWT_SECRET=.\\+' $DEST/.env || { echo 'HATA: .env/JWT_SECRET yok'; exit 1; }"`
  - better-sqlite3 native doğrulaması: `ssh "$SRV" "cd $DEST && node -e \"require('better-sqlite3')\" || { echo 'HATA: better-sqlite3 yüklenemedi'; exit 1; }"`
  (Her ikisi de başarısızsa deploy `set -e` ile durur — bozuk deploy'u erken yakalar.)
- [ ] **Step 4:** `bash -n deploy.sh` + `node -e "require('./ecosystem.config.cjs')"` (parse hatası yok) PASS.
- [ ] **Step 5: Commit** `git add .env.example deploy.sh ecosystem.config.cjs && git commit -m "harden(deploy): .env.example, JWT/sqlite preflight checks, ecosystem quote-strip"`

---

## Self-Review (yazar)
- **Kapsam:** i18n hardcoded+dead→T1, parity test→T2, polling/perf→T3, sayısal+rateLimit→T4, deploy/install→T5. Denetimdeki tüm düşük-öncelik maddeleri kapsanıyor (PROTECTED_DOMAINS fallback ve systemctl-root canlıda doğru çalıştığı için kapsam dışı; not edildi).
- **6 dil tutarlılığı:** T1 yeni/silinen anahtarlar 6 dosyada; T2 testi bunu zorunlu kılar (parity + used-key).
- **Davranış güvenliği:** T3/T4 yalnız UI/yardımcı; T5 deploy guard'ları erken-fail (canlıyı bozmaz); ecosystem tırnak-soyma geriye uyumlu (tırnaksız değer değişmez).
- **Placeholder yok:** her adımda somut dosya/değişiklik; i18n değerleri verili.
- **Tip/isim tutarlılığı:** common.close/menu, dashboard.max, processes.colRestarts/colUptime, common.language — gerçek/eklenen anahtarlarla eşleşir.
