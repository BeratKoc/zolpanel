# System Updates + Disk Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Panelden OS paket güncellemelerini gör/uygula (apt) + disk kullanımını gör + Docker temizliği (prune) yap.

**Architecture:** Saf, test-edilebilir çıktı-parser'ları (apt-upgradable, df, docker-df) + backend exec wrapper + Next route'ları + frontend sayfası. Uzun/yıkıcı işlemler (upgrade, prune) onay + streamli çıktı.

**Tech Stack:** Next.js 15 route handlers (nodejs), `child_process.execFile` (apt-get/apt/df/docker), TypeScript, node:test, next-intl (6 dil), Playwright.

## Global Constraints
- apt upgrade / docker prune **yıkıcı/uzun** → UI onayı + sunucu tarafı timeout (upgrade 600s, prune 120s). Hepsi `requireAuth`.
- Yalnız okuma uçları (list-upgradable, df, docker-df) hızlı; yazma uçları (upgrade, prune) onay-arkasında.
- Commit yazarı `BeratKoc <ahmetberatkoc0@gmail.com>`; **Co-Authored-By YOK**.
- Test `npm test`; build `npm run build` (Win EPERM→`rm -rf .next`); `npx tsc --noEmit` temiz; 6-dil i18n parity.
- Mevcut: `requireAuth`/`unauthorized`; `api` `request`; nav + lucide. **Canlı doğrulama SADECE okuma** (df/list-upgradable/docker-df) — apt upgrade/prune kullanıcının bilinçli aksiyonu (servisleri etkileyebilir).

## Dosya yapısı
- `lib/server/maintenance/parse.ts` — `parseAptUpgradable`/`parseDf`/`parseDockerDf` + tipler.
- `lib/server/maintenance/parse.test.ts` — unit testler.
- `lib/server/maintenance/exec.ts` — `aptUpdate`/`listUpgradable`/`aptUpgrade`/`diskUsage`/`dockerDf`/`dockerPrune` (execFile).
- `app/api/maintenance/updates/route.ts` (GET list, POST apply), `app/api/maintenance/disk/route.ts` (GET), `app/api/maintenance/prune/route.ts` (POST).
- `app/(panel)/maintenance/page.tsx`; nav; `lib/api-client.ts`; `messages/{6}.json`.

---

### Task 1: Saf parser'lar + testler

**Files:** Create `lib/server/maintenance/parse.ts`, `lib/server/maintenance/parse.test.ts`.

**Interfaces:** Produces `interface UpgradablePkg { name:string; current:string; candidate:string }`; `interface DiskFs { filesystem:string; size:number; used:number; avail:number; usePercent:number; mount:string }`; `interface DockerDfRow { type:string; total:string; active:string; size:string; reclaimable:string }`; `parseAptUpgradable(out:string):UpgradablePkg[]`; `parseDf(out:string):DiskFs[]` (df -B1 çıktısı); `parseDockerDf(out:string):DockerDfRow[]`.

- [ ] **Step 1: `lib/server/maintenance/parse.ts`:**
```ts
export interface UpgradablePkg { name: string; current: string; candidate: string; }
export interface DiskFs { filesystem: string; size: number; used: number; avail: number; usePercent: number; mount: string; }
export interface DockerDfRow { type: string; total: string; active: string; size: string; reclaimable: string; }

/** `apt list --upgradable` çıktısını ayrıştırır.
 *  Satır örn: "nginx/focal-updates 1.18.0-0ubuntu1.4 amd64 [upgradable from: 1.18.0-0ubuntu1.2]" */
export function parseAptUpgradable(out: string): UpgradablePkg[] {
  const pkgs: UpgradablePkg[] = [];
  for (const line of out.split('\n')) {
    const m = line.match(/^([^/\s]+)\/\S+\s+(\S+)\s+\S+\s+\[upgradable from:\s*([^\]]+)\]/);
    if (m) pkgs.push({ name: m[1], candidate: m[2], current: m[3].trim() });
  }
  return pkgs;
}

/** `df -B1` çıktısını ayrıştırır (1. satır başlık). */
export function parseDf(out: string): DiskFs[] {
  const rows: DiskFs[] = [];
  const lines = out.trim().split('\n').slice(1);
  for (const line of lines) {
    const c = line.split(/\s+/);
    if (c.length < 6) continue;
    const size = parseInt(c[1], 10), used = parseInt(c[2], 10), avail = parseInt(c[3], 10);
    if (!Number.isFinite(size)) continue;
    rows.push({ filesystem: c[0], size, used, avail, usePercent: parseInt(c[4], 10) || 0, mount: c.slice(5).join(' ') });
  }
  return rows;
}

/** `docker system df` (tablo) çıktısını ayrıştırır. */
export function parseDockerDf(out: string): DockerDfRow[] {
  const rows: DockerDfRow[] = [];
  const lines = out.trim().split('\n');
  for (const line of lines.slice(1)) {
    // TYPE may contain a space ("Build Cache") → son 4 kolon sabit; type = kalan baş.
    const m = line.match(/^(.*?)\s{2,}(\d+)\s+(\d+)\s+(\S+)\s+(.+)$/);
    if (m) rows.push({ type: m[1].trim(), total: m[2], active: m[3], size: m[4], reclaimable: m[5].trim() });
  }
  return rows;
}
```

- [ ] **Step 2: Failing test** — `lib/server/maintenance/parse.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert';
import { parseAptUpgradable, parseDf, parseDockerDf } from './parse';

test('parseAptUpgradable', () => {
  const out = [
    'Listing...',
    'nginx/focal-updates 1.18.0-0ubuntu1.4 amd64 [upgradable from: 1.18.0-0ubuntu1.2]',
    'curl/focal-security 7.68.0-1ubuntu2.7 amd64 [upgradable from: 7.68.0-1ubuntu2.6]',
  ].join('\n');
  const p = parseAptUpgradable(out);
  assert.strictEqual(p.length, 2);
  assert.deepStrictEqual(p[0], { name: 'nginx', candidate: '1.18.0-0ubuntu1.4', current: '1.18.0-0ubuntu1.2' });
});

test('parseDf', () => {
  const out = [
    'Filesystem     1B-blocks       Used  Available Use% Mounted on',
    '/dev/sda1     52000000000 20000000000 30000000000  40% /',
  ].join('\n');
  const d = parseDf(out);
  assert.strictEqual(d.length, 1);
  assert.deepStrictEqual({ fs: d[0].filesystem, used: d[0].used, pct: d[0].usePercent, mount: d[0].mount }, { fs: '/dev/sda1', used: 20000000000, pct: 40, mount: '/' });
});

test('parseDockerDf', () => {
  const out = [
    'TYPE            TOTAL     ACTIVE    SIZE      RECLAIMABLE',
    'Images          10        5         2GB       1GB (50%)',
    'Build Cache     20        0         500MB     500MB (100%)',
  ].join('\n');
  const r = parseDockerDf(out);
  assert.strictEqual(r.length, 2);
  assert.strictEqual(r[0].type, 'Images');
  assert.strictEqual(r[0].reclaimable, '1GB (50%)');
  assert.strictEqual(r[1].type, 'Build Cache');
});
```

- [ ] **Step 3:** `npm test` FAIL→PASS; `npx tsc --noEmit` temiz.
- [ ] **Step 4: Commit** `git add lib/server/maintenance/parse.ts lib/server/maintenance/parse.test.ts && git commit -m "feat(maintenance): apt/df/docker-df output parsers + tests"`

---

### Task 2: Backend exec + route'lar + api-client

**Files:** Create `lib/server/maintenance/exec.ts`, `app/api/maintenance/updates/route.ts`, `app/api/maintenance/disk/route.ts`, `app/api/maintenance/prune/route.ts`. Modify `lib/api-client.ts`.

**Interfaces:** Consumes Task 1 parsers; `requireAuth`. Produces: updates GET `{packages}` / POST `{output}` (apply); disk GET `{filesystems, docker}`; prune POST `{target:'images'|'system'|'builder'}` → `{output}`. api-client `updatesList/updatesApply/diskInfo/dockerPrune`.

- [ ] **Step 1: `lib/server/maintenance/exec.ts`:**
```ts
import { execFile } from 'node:child_process';
import { parseAptUpgradable, parseDf, parseDockerDf } from './parse';

function run(cmd: string, args: string[], timeout = 60000, env?: Record<string, string>): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout, maxBuffer: 8 * 1024 * 1024, env: { ...process.env, ...(env || {}) } },
      (e, out, se) => e ? reject(new Error(se || e.message)) : resolve(out));
  });
}
const APT_ENV = { DEBIAN_FRONTEND: 'noninteractive' };
export async function listUpgradable() {
  try { await run('apt-get', ['update'], 120000, APT_ENV); } catch { /* update hatası olsa da listele */ }
  return parseAptUpgradable(await run('apt', ['list', '--upgradable'], 60000, APT_ENV));
}
export function aptUpgrade(): Promise<string> { return run('apt-get', ['-y', 'upgrade'], 600000, APT_ENV); }
export async function diskUsage() {
  const filesystems = parseDf(await run('df', ['-B1', '-x', 'tmpfs', '-x', 'devtmpfs']));
  let docker: ReturnType<typeof parseDockerDf> = [];
  try { docker = parseDockerDf(await run('docker', ['system', 'df'])); } catch { /* docker yoksa boş */ }
  return { filesystems, docker };
}
export function dockerPrune(target: 'images' | 'system' | 'builder'): Promise<string> {
  const args = target === 'images' ? ['image', 'prune', '-af']
    : target === 'builder' ? ['builder', 'prune', '-af']
    : ['system', 'prune', '-af'];
  return run('docker', args, 120000);
}
```

- [ ] **Step 2: `app/api/maintenance/updates/route.ts`:** GET (requireAuth → `{packages: await listUpgradable()}`); POST (requireAuth → `{output: (await aptUpgrade()).slice(0,200000)}`). Hata → 500 + mesaj.
- [ ] **Step 3: `app/api/maintenance/disk/route.ts`:** GET (requireAuth → `await diskUsage()`).
- [ ] **Step 4: `app/api/maintenance/prune/route.ts`:** POST (requireAuth → `{target}` ∈ {images,system,builder} (yoksa 400) → `{output: (await dockerPrune(target)).slice(0,200000)}`).
- [ ] **Step 5: api-client:**
```ts
  updatesList: () => request('GET', '/maintenance/updates'),
  updatesApply: () => request('POST', '/maintenance/updates'),
  diskInfo: () => request('GET', '/maintenance/disk'),
  dockerPrune: (target: string) => request('POST', '/maintenance/prune', { target }),
```
- [ ] **Step 6:** `npx tsc --noEmit` + `npm run build` + `npm test` PASS.
- [ ] **Step 7: Commit** `git add lib/server/maintenance/exec.ts "app/api/maintenance" lib/api-client.ts && git commit -m "feat(maintenance): apt updates + disk + docker prune routes + api-client"`

---

### Task 3: Frontend bakım sayfası + nav + i18n

**Files:** Create `app/(panel)/maintenance/page.tsx`. Modify `app/(panel)/layout.tsx`, `messages/{6}.json`.

- [ ] **Step 1: i18n (6 dil)** — `maintenance` bloğu + `nav.maintenance`. Anahtarlar: `title, updates, upToDate, upgradable, package, current, candidate, applyUpdates, applyConfirm, applyOutput, disk, filesystem, used, available, usePercent, mount, dockerUsage, type, size, reclaimable, prune, pruneImages, pruneBuilder, pruneSystem, pruneConfirm, refresh, running`. `nav.maintenance`: tr "Bakım", en "Maintenance", zh "维护", es "Mantenimiento", de "Wartung", fr "Maintenance". Tüm 6 dilde parity.
- [ ] **Step 2: `app/(panel)/maintenance/page.tsx` ('use client')** — Üç bölüm:
  1. **Güncellemeler:** `api.updatesList()` → upgradable tablo (paket/current/candidate) veya "güncel". "Güncellemeleri uygula" → onay (uzun sürer uyarısı) → `api.updatesApply()` → çıktıyı `<pre>` modalda göster. Loading state.
  2. **Disk:** `api.diskInfo()` → filesystems tablosu (mount/used/avail/use% bar) + docker usage tablosu (type/size/reclaimable).
  3. **Docker temizlik:** "Image'leri temizle"/"Build cache temizle"/"Sistem temizle" butonları → onay → `api.dockerPrune(target)` → çıktı + disk yenile.
  - "Yenile" butonu hepsini tazeler. `useToast`. Mobil: tablolar overflow-x, butonlar wrap. Dark design.
- [ ] **Step 3: nav** — lucide `HardDriveDownload` (veya `RefreshCw`/`Wrench`); `NAV_ITEMS`'a `{ id:'maintenance', icon: Wrench, href:'/maintenance' }` (dns'ten sonra).
- [ ] **Step 4:** `npx tsc --noEmit` + `npm run build` + `npm test` (i18n parity) PASS.
- [ ] **Step 5: Commit** `git add "app/(panel)/maintenance" "app/(panel)/layout.tsx" lib/api-client.ts messages/tr.json messages/en.json messages/zh.json messages/es.json messages/de.json messages/fr.json && git commit -m "feat(maintenance): system updates + disk + docker prune page + nav + i18n"`

---

### Task 4: e2e + deploy

**Files:** Create `e2e/maintenance.spec.ts`.

- [ ] **Step 1: e2e** — login → "Bakım" nav → `/maintenance` → h2 görünür → üç bölüm başlığı (Güncellemeler/Disk/Docker) veya "Yenile" butonu görünür → doğrudan goto SSR çökmez → 360px taşma yok. (CI'da apt/docker olabilir/olmayabilir → hata toast'ı kabul, sayfa chrome'u doğrula.)
- [ ] **Step 2:** `npx tsc --noEmit`; `npm test`; `npm run e2e` (maintenance + mevcut PASS; backups stale→`rm -rf .next`+tekrar). `git push` → CI yeşil.
- [ ] **Step 3: Deploy** `bash deploy.sh` → health + caddy Valid.
- [ ] **Step 4: Canlı doğrulama (SADECE OKUMA).** `/maintenance` 200; disk kullanımı + upgradable liste + docker df okunur. **apt upgrade / prune YAPMA** (servisleri etkiler — kullanıcının bilinçli aksiyonu). `/api/maintenance/disk` no-auth→401.
- [ ] **Step 5: Ledger + tamam.**

## Self-Review (yazar)
- Kapsam: parser'lar→T1; exec+route'lar→T2; UI→T3; e2e+deploy→T4. Güvenlik: requireAuth her route, yıkıcı işlem onay+timeout, prune target allowlist. Tip tutarlılığı: `UpgradablePkg`/`DiskFs`/`DockerDfRow`/parser'lar T1↔T2↔T3. Canlı doğrulama read-only. Placeholder yok.
