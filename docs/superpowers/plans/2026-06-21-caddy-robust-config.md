# Caddy-Native (c): Robust Transactional Config Management — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Panelin Caddy yapılandırma yönetimini incremental "oku-düzenle-ekle" yaklaşımından, **DB'den tam yeniden üretilen işaretli managed-bölge + `caddy validate` kapısı + atomik yazım + otomatik rollback** mimarisine taşımak. Substring/parse kırılganlığını tamamen bitirir, unmanaged blokları (panel.zolvix.app) birebir korur, (b)'deki zengin per-domain direktiflerin önünü açar. Admin API (localhost:2019) sadece okuma/doğrulama için.

**Architecture:** Caddyfile KALICI KAYNAK kalır (Caddy boot davranışı değişmez → güvenli rollback). `lib/server/caddy.ts`'e `syncCaddyConfig()`: Caddyfile = `[unmanaged region (verbatim)] + [MANAGED markers] + [aktif DB domainlerinden tam üretilen bloklar]`. Her domain değişikliğinde tek kod yolu: DB yaz → `syncCaddyConfig()`. Yazım transactional: temp dosyaya yaz → `caddy validate` → geçerliyse yedekle+atomik replace+reload → reload hatası → yedeği geri yükle.

**Tech Stack:** Next.js 15 + TS, better-sqlite3, Caddy (`caddy validate`, admin API read), `node:test`, Playwright.

## Global Constraints
- **Caddyfile boot kaynağı DEĞİŞMEZ** (systemctl caddy /etc/caddy/Caddyfile'dan boot eder). Admin API yalnızca READ/verify.
- **Unmanaged bloklar (PROTECTED_DOMAINS + DB'de olmayan her blok) BİREBİR korunur** — panel.zolvix.app, mapper.ahmetberatkoc.com asla kaybolmaz.
- **Yazmadan önce `caddy validate` ZORUNLU**; geçersizse canlıya DOKUNULMAZ (throw + log). Reload başarısızsa **yedek geri yüklenir**.
- Yalnızca **aktif** (status==='active') domainler Caddy'ye yazılır (offline → yazılmaz, mevcut davranış).
- Token-match (`removeDomainBlock`), brace-aware parse KORUNUR (migration/extraction'da kullanılır).
- ≥768 desktop / mobil davranış değişmez (bu backend). Mevcut e2e + unit yeşil kalır.
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. Windows: build EPERM → `rm -rf .next` retry.
- Managed bölge işaretleri (sabit): başlangıç `# >>> zolpanel-managed (otomatik üretildi — elle düzenleme) >>>`, bitiş `# <<< zolpanel-managed <<<`.

---

### Task 1: `syncCaddyConfig` — managed-bölge tam üretim + transactional yazım (+ unit testler)

**Files:**
- Modify: `lib/server/caddy.ts`
- Create: `lib/server/caddy-sync.test.ts`

**Interfaces:**
- Produces: `export async function syncCaddyConfig(domains: DomainDoc[]): Promise<void>` — verilen domain listesinden (genelde tüm aktif domainler) Caddyfile'ı transactional yeniden üretir. Saf yardımcılar: `extractUnmanaged(content, managedDomains): string`, `buildManagedRegion(activeDomains): string`, `composeCaddyfile(unmanaged, managed): string` (test edilebilir, fs/exec'siz).
- Consumes: mevcut `buildDomainBlock`, `removeDomainBlock`, `PROTECTED_DOMAINS`, `readCaddyfile`/`writeCaddyfile`/`reloadCaddy`.

- [ ] **Step 1: Failing testler** — `lib/server/caddy-sync.test.ts` (db.ts stub'lanır, fs/exec yok — saf composer fonksiyonları test edilir):
```ts
import { test } from 'node:test';
import assert from 'node:assert';
// db.ts'i stub'la (nedb yok)
const dbPath = require.resolve('./db.ts');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { addLog: () => {} } } as any;
import { extractUnmanaged, buildManagedRegion, composeCaddyfile, MANAGED_START, MANAGED_END } from './caddy';

const LIVE = `zolvix.app, www.zolvix.app {
    reverse_proxy localhost:3000
}

panel.zolvix.app {
    reverse_proxy 127.0.0.1:3999
}

ahmetberatkoc.com {
    reverse_proxy localhost:3002
}

mapper.ahmetberatkoc.com {
    reverse_proxy localhost:3001
}
`;
// DB'nin sahip olduğu (managed) domainler: zolvix.app, ahmetberatkoc.com
const MANAGED_NAMES = ['zolvix.app', 'ahmetberatkoc.com'];

test('extractUnmanaged: managed bloklar çıkar, unmanaged (panel + mapper) korunur', () => {
  const u = extractUnmanaged(LIVE, MANAGED_NAMES);
  assert.ok(/panel\.zolvix\.app\s*\{/.test(u), 'panel.zolvix.app korunmalı');
  assert.ok(/mapper\.ahmetberatkoc\.com\s*\{/.test(u), 'mapper korunmalı');
  assert.ok(!/^zolvix\.app,/m.test(u), 'managed zolvix.app çıkarılmalı');
  assert.ok(!/^ahmetberatkoc\.com\s*\{/m.test(u), 'managed ahmetberatkoc çıkarılmalı');
});

test('composeCaddyfile: managed bölge işaretli ve idempotent', () => {
  const u = extractUnmanaged(LIVE, MANAGED_NAMES);
  const managed = buildManagedRegion([
    { domain:'zolvix.app', type:'proxy', port:3000, aliases:['www.zolvix.app'] } as any,
    { domain:'ahmetberatkoc.com', type:'proxy', port:3002, aliases:[] } as any,
  ]);
  const out1 = composeCaddyfile(u, managed);
  assert.ok(out1.includes(MANAGED_START) && out1.includes(MANAGED_END), 'işaretler olmalı');
  assert.ok(/panel\.zolvix\.app/.test(out1) && /zolvix\.app, www\.zolvix\.app/.test(out1));
  // idempotent: zaten-işaretli içerikten tekrar extract+compose aynı unmanaged'i verir
  const u2 = extractUnmanaged(out1, MANAGED_NAMES);
  assert.ok(/panel\.zolvix\.app/.test(u2) && !/zolpanel-managed/.test(u2), 'ikinci turda managed bölge unmanaged sayılmaz');
});

test('buildManagedRegion: offline domain dışarıda (yalnız verilenler)', () => {
  const managed = buildManagedRegion([{ domain:'a.com', type:'proxy', port:3001, aliases:[] } as any]);
  assert.ok(managed.includes('a.com') && managed.includes('reverse_proxy localhost:3001'));
});
```
Run: `npm test` → FAIL (fonksiyonlar yok).

- [ ] **Step 2: `caddy.ts`'e ekle** (saf fonksiyonlar — fs/exec yok):
```ts
export const MANAGED_START = '# >>> zolpanel-managed (otomatik üretildi — elle düzenleme) >>>';
export const MANAGED_END = '# <<< zolpanel-managed <<<';

// Caddyfile'dan unmanaged bölgeyi döndürür: önceki managed bölge (işaretler arası)
// atılır; eski (işaretsiz) sürümde managedNames'e ait bloklar token-match ile çıkarılır.
export function extractUnmanaged(content: string, managedNames: string[]): string {
  // 1) varsa işaretli managed bölgeyi sök
  const s = content.indexOf(MANAGED_START);
  const e = content.indexOf(MANAGED_END);
  let base = content;
  if (s !== -1 && e !== -1 && e > s) {
    base = (content.slice(0, s) + content.slice(e + MANAGED_END.length)).trim() + '\n';
  }
  // 2) (ilk migrasyon) işaretsiz eski managed blokları token-match ile çıkar
  for (const name of managedNames) base = removeDomainBlock(base, name);
  return base.trim() ? base.trim() + '\n' : '';
}

export function buildManagedRegion(activeDomains: DomainConfig[]): string {
  const blocks = activeDomains.map((d) => buildDomainBlock(d)).filter(Boolean).join('');
  return `${MANAGED_START}\n${blocks.trimEnd()}\n${MANAGED_END}\n`;
}

export function composeCaddyfile(unmanaged: string, managedRegion: string): string {
  const u = unmanaged.trim();
  return (u ? u + '\n\n' : '') + managedRegion;
}
```

- [ ] **Step 3: `syncCaddyConfig` (transactional, fs/exec):**
```ts
import { execFile } from 'child_process';

function caddyValidate(path: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile('caddy', ['validate', '--adapter', 'caddyfile', '--config', path], (err, _o, stderr) =>
      err ? reject(new Error('caddy validate: ' + (stderr || err.message))) : resolve());
  });
}

export async function syncCaddyConfig(domains: DomainConfig[]): Promise<void> {
  const path = CADDYFILE_PATH();
  const active = domains.filter((d) => !PROTECTED_DOMAINS.includes(d.domain));
  const current = readCaddyfile();
  const unmanaged = extractUnmanaged(current, active.map((d) => d.domain).concat(PROTECTED_DOMAINS.length ? [] : []));
  // NOT: PROTECTED bloklar unmanaged'da kalır (managedNames'e dahil edilmez).
  const next = composeCaddyfile(unmanaged, buildManagedRegion(active));
  if (next.trim() === current.trim()) return; // değişiklik yok

  const tmp = path + '.zolpanel.tmp';
  const bak = path + '.zolpanel.bak';
  fs.writeFileSync(tmp, next, 'utf-8');
  try {
    await caddyValidate(tmp);                 // GEÇERSİZSE buradan throw → canlıya dokunulmaz
  } catch (e) {
    fs.unlinkSync(tmp);
    addLog('system', 'error', 'Caddy config geçersiz, uygulanmadı: ' + (e as Error).message);
    throw e;
  }
  fs.copyFileSync(path, bak);                 // yedek
  fs.renameSync(tmp, path);                   // atomik replace
  try {
    await reloadCaddy();
  } catch (e) {
    fs.copyFileSync(bak, path);               // rollback
    await reloadCaddy().catch(() => {});
    addLog('system', 'error', 'Reload başarısız, önceki config geri yüklendi');
    throw e;
  }
  addLog('system', 'info', 'Caddy config senkronize edildi (managed bölge)');
}
```
> ÖNEMLİ: `extractUnmanaged`'a `managedNames` olarak SADECE DB domainlerinin adlarını ver (PROTECTED_DOMAINS'i VERME — onlar unmanaged kalmalı). `active` zaten PROTECTED'ı filtreler.

- [ ] **Step 4:** `npm test` → 3 yeni test PASS + mevcut caddy/pm2/validation/portManager testleri PASS. `npx tsc --noEmit` temiz.

- [ ] **Step 5: Commit**
```
git add lib/server/caddy.ts lib/server/caddy-sync.test.ts
git commit -m "feat(caddy): transactional syncCaddyConfig (managed region regen + validate + rollback)"
```

---

### Task 2: Route'ları `syncCaddyConfig`'e geçir (tek kod yolu)

**Files:**
- Modify: `app/api/domains/route.ts`, `app/api/domains/[id]/route.ts`, `lib/server/sslTracker.ts`
- Modify: `lib/server/db.ts` (gerekiyorsa `getActiveDomains` zaten var)

**Interfaces:** Consumes `syncCaddyConfig` + `getActiveDomains` (db.ts'te mevcut).

- [ ] **Step 1:** `app/api/domains/route.ts` POST: domain insert sonrası `addDomainToConfig(saved)` ÇAĞRISINI `if (await isCaddyRunning()) await syncCaddyConfig(getActiveDomains());` ile değiştir (DB'den tüm aktif domainleri çekip senkronize et). SSL 'pending' yorumu korunur.
- [ ] **Step 2:** `app/api/domains/[id]/route.ts` PUT (status değişimi) ve DELETE: `addDomainToConfig`/`removeDomainFromConfig` çağrılarını, DB güncellemesi/silmesi SONRASI `if (await isCaddyRunning()) await syncCaddyConfig(getActiveDomains());` ile değiştir. (Artık tek yol: DB'yi değiştir → tam senkron.)
- [ ] **Step 3:** `sslTracker.ts`: değişmez (sadece DB sslStatus yazıyor, Caddy'ye dokunmuyor) — DOKUNMA.
- [ ] **Step 4:** Eski `addDomainToConfig`/`removeDomainFromConfig` artık kullanılmıyorsa: `@deprecated` yorumu bırak veya kaldır (kullanım kalmadıysa kaldır; testte referans yoksa). `buildDomainBlock`/`removeDomainBlock`/`parseCaddyfile` KALIR.
- [ ] **Step 5:** `npx tsc --noEmit` temiz; `npm run build` başarılı; `npm run e2e` → mevcut tüm e2e PASS (domains CRUD desktop/mobil — test ortamında Caddy yok, `isCaddyRunning()` false → syncCaddyConfig çağrılmaz, DB davranışı aynı; testler etkilenmez).
- [ ] **Step 6: Commit**
```
git add app/api/domains lib/server
git commit -m "feat(caddy): domain routes use syncCaddyConfig (single regen path)"
```

---

### Task 3: Admin API okuma/doğrulama yardımcısı (READ-only)

**Files:**
- Create: `lib/server/caddyAdmin.ts`
- Modify: `app/api/system/caddy/config/route.ts` (opsiyonel: admin API'den canlı config özetini de döndür)

**Interfaces:** Produces `caddyAdminLoaded(): Promise<boolean>` ve `caddyHasDomain(domain): Promise<boolean>` (localhost:2019'dan READ).

- [ ] **Step 1:** `caddyAdmin.ts`:
```ts
// Caddy admin API (localhost:2019) — yalnızca OKUMA/doğrulama. Config'i DEĞİŞTİRMEZ.
const ADMIN = process.env.CADDY_ADMIN || 'http://127.0.0.1:2019';
export async function caddyAdminAvailable(): Promise<boolean> {
  try { const r = await fetch(ADMIN + '/config/', { signal: AbortSignal.timeout(3000) }); return r.ok; }
  catch { return false; }
}
export async function caddyHasDomain(domain: string): Promise<boolean> {
  try {
    const r = await fetch(ADMIN + '/config/', { signal: AbortSignal.timeout(3000) });
    if (!r.ok) return false;
    return JSON.stringify(await r.json()).includes(domain);
  } catch { return false; }
}
```
- [ ] **Step 2:** (opsiyonel) `system/caddy/config` GET: mevcut Caddyfile içeriğine ek olarak `adminAvailable: await caddyAdminAvailable()` alanı döndür (UI ileride "Caddy admin canlı" rozetinde kullanır). requireAuth korunur.
- [ ] **Step 3:** `npx tsc --noEmit` + `npm run build` temiz. (Bu task'ta yeni test şart değil — saf fetch wrapper; test ortamında admin API yok, fonksiyonlar false döner.)
- [ ] **Step 4: Commit**
```
git add lib/server/caddyAdmin.ts app/api/system/caddy/config/route.ts
git commit -m "feat(caddy): admin API read helpers (status verify, non-mutating)"
```

---

### Task 4: Yerel doğrulama + DİKKATLİ canlı deploy (dry-run + tüm-site health + rollback)

**Files:** (doğrulama + deploy; kod değişmez)

- [ ] **Step 1: Tam suit:** `npx tsc --noEmit && npm test && npm run e2e` → hepsi PASS.
- [ ] **Step 2: push (CI):** `git push` → GitHub Actions yeşil.
- [ ] **Step 3: Kod deploy (Caddyfile'a DOKUNMADAN):** `bash deploy.sh` → /opt/zolpanel'e kod + build + pm2 restart + health. (Deploy Caddyfile'ı DEĞİŞTİRMEZ; yeni kod sadece SONRAKİ domain işleminde senkron yapar.)
- [ ] **Step 4: Canlı DRY-RUN (reload YOK):** Sunucuda node ile, gerçek DB + gerçek Caddyfile'a karşı `syncCaddyConfig`'in ÜRETECEĞİ içeriği bir TEMP dosyaya üret, `caddy validate` et, ve mevcut Caddyfile ile diff al — **4 bloğun da (zolvix.app, panel.zolvix.app, ahmetberatkoc.com, mapper) korunduğunu** doğrula. Canlı reload YAPMA. (Komut: `ssh ... "cd /opt/zolpanel && node --import tsx -e '...extractUnmanaged/compose...üret, /tmp/cf.test'e yaz, caddy validate, grep 4 domain'"`.)
- [ ] **Step 5: Canlı tetikleme testi (kontrollü):** Panel API'den **dummy bir domain** ekle (`zz-test.local`, proxy:3998) → `syncCaddyConfig` tetiklenir → `caddy validate` geçer, reload olur. Doğrula: `curl 127.0.0.1:3999/api/health` ok; **panel.zolvix.app/zolvix.app/ahmetberatkoc.com hâlâ 200/307** (tüm-site health); Caddyfile'da managed işaretler + 4 gerçek blok + zz-test var. Sonra dummy domaini **sil** → tekrar senkron → zz-test gider, 4 blok kalır. `systemctl is-active caddy` = active.
- [ ] **Step 6: Rollback hazır:** Herhangi bir sitede sorun → `ssh ... "cp /etc/caddy/Caddyfile.zolpanel.bak /etc/caddy/Caddyfile && systemctl reload caddy"` (syncCaddyConfig her uygulamada `.zolpanel.bak` bırakır). Ayrıca deploy yedeği `/tmp/zolpanel-bak-*.tgz`.
- [ ] **Step 7:** Ledger güncelle; (c) tamam.

---

## Self-Review (yazar)
- **Substring riski:** `syncCaddyConfig` artık incremental edit yapmıyor; managed bölge tam üretiliyor, unmanaged işaretle/extract korunuyor → kök sorun biter. ✓
- **Canlı güvenlik:** `caddy validate` kapısı + atomik replace + reload-fail rollback + dry-run + tüm-site health. ✓
- **Boot davranışı:** değişmiyor (Caddyfile kaynak) → rollback anında. Admin API yalnız READ. ✓
- **(b)'yi açar:** buildManagedRegion/buildDomainBlock zengin direktif üretebilir (sonraki plan). ✓
- **Tip tutarlılığı:** `syncCaddyConfig(DomainConfig[])`, `getActiveDomains()` `DomainDoc[]` döner (DomainConfig ile uyumlu — DomainDoc ⊃ DomainConfig). `extractUnmanaged`/`buildManagedRegion`/`composeCaddyfile` Task 1'de tanımlı, Task 4 dry-run'da kullanılır.
- **Açık not:** Tam Caddy-Admin-API-JSON-source migrasyonu (boot kaynağını değiştirmek) bilinçli olarak ERTELENDİ — canlı çoklu-site riskini, kullanıcı ulaşılamazken almamak için. Döndüğünde ayrıca değerlendirilebilir.
