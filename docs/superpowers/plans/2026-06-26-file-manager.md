# File Manager (Dosya Yöneticisi) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Panelden host dosya sistemini web'den yönet — gez/indir/yükle/düzenle(metin)/sil/yeniden-adlandır/yeni-klasör — path-traversal güvenlik guard'larıyla.

**Architecture:** Saf, test-edilebilir `safePath`/`formatSize` çekirdeği; Next API route'ları (`fs/promises` ile, panel root çalışır → host dosyaları doğrudan) onu sarar; frontend bir dosya-yöneticisi sayfası. JSON op'lar `api` client; binary indir + multipart yükle raw `fetch`+Bearer.

**Tech Stack:** Next.js 15 route handlers (nodejs), node `fs/promises`, TypeScript, node:test, next-intl (6 dil), Playwright.

## Global Constraints
- Panel root çalışır → host FS'e tam erişim beklenir (cPanel-tarzı root panel). Ama her yol **`safePath` ile normalize + null-byte reddi + mutlak-yol şartı**; izinli kök varsayılan `/` (tam erişim) fakat normalize edilir.
- Metin düzenleme yalnız metin + boyut sınırı (oku ≤2MB, yaz ≤5MB). Yükleme sınırı ≤200MB. İndirme stream. Yıkıcı (sil) onay + recursive flag.
- Hepsi `requireAuth` (`@/lib/auth`). Commit yazarı `BeratKoc <ahmetberatkoc0@gmail.com>`; **Co-Authored-By YOK**.
- Test: `npm test`. Build: `npm run build` (Windows EPERM → `rm -rf .next`). `npx tsc --noEmit` temiz. 6-dil i18n parity.
- Mevcut: `requireAuth(req)`→`{id,username,tv}`, `unauthorized()`; `api` client `request(method,path,body)` (JSON, Bearer). Binary/multipart için raw `fetch` + `Authorization: Bearer <localStorage token>`. nav: `app/(panel)/layout.tsx` `NAV_ITEMS` + lucide.

## Dosya yapısı
- `lib/server/files/path-safety.ts` — `safePath`, `formatSize`, tipler.
- `lib/server/files/path-safety.test.ts` — unit testler.
- `app/api/files/list/route.ts` (GET), `app/api/files/read/route.ts` (GET text), `app/api/files/download/route.ts` (GET binary), `app/api/files/save/route.ts` (POST), `app/api/files/mkdir/route.ts` (POST), `app/api/files/rename/route.ts` (POST), `app/api/files/upload/route.ts` (POST multipart), `app/api/files/route.ts` (DELETE).
- `app/(panel)/files/page.tsx` + `components/files/*` (gerekirse).
- `app/(panel)/layout.tsx` nav; `lib/api-client.ts` helpers; `messages/{tr,en,zh,es,de,fr}.json`.

---

### Task 1: Saf path-safety çekirdeği + unit testler

**Files:** Create `lib/server/files/path-safety.ts`, `lib/server/files/path-safety.test.ts`.

**Interfaces:** Produces `interface FileEntry { name:string; type:'file'|'dir'|'other'; size:number; mtime:number; mode:string }`; `class UnsafePathError extends Error`; `function safePath(input:string): string` (normalize + validate; geçersizde throw); `function formatSize(bytes:number): string`.

- [ ] **Step 1: `lib/server/files/path-safety.ts` yaz:**

```ts
import path from 'node:path';

export interface FileEntry {
  name: string;
  type: 'file' | 'dir' | 'other';
  size: number;
  mtime: number;
  mode: string;
}

export class UnsafePathError extends Error {
  constructor(msg = 'Geçersiz yol') { super(msg); this.name = 'UnsafePathError'; }
}

/** Girdi yolunu güvenli, normalize, MUTLAK bir POSIX yola çevirir.
 *  - boş / null-byte / mutlak-olmayan → UnsafePathError
 *  - `..` segmentleri normalize edilir; normalize sonrası kök '/' dışına çıkamaz. */
export function safePath(input: string): string {
  if (typeof input !== 'string' || input.length === 0) throw new UnsafePathError();
  if (input.includes('\0')) throw new UnsafePathError('Yol null-byte içeremez');
  if (!input.startsWith('/')) throw new UnsafePathError('Yol mutlak olmalı (/ ile başlamalı)');
  const normalized = path.posix.normalize(input);
  // normalize sonrası hâlâ mutlak olmalı ve '..' ile köke tırmanmamalı
  if (!normalized.startsWith('/') || normalized.includes('\0')) throw new UnsafePathError();
  return normalized;
}

/** İnsan-okur boyut. */
export function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let n = bytes, i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return (i === 0 ? n.toFixed(0) : n.toFixed(1)) + ' ' + u[i];
}
```

- [ ] **Step 2: Failing test** — `lib/server/files/path-safety.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert';
import { safePath, formatSize, UnsafePathError } from './path-safety';

test('safePath: geçerli mutlak yolu normalize eder', () => {
  assert.strictEqual(safePath('/etc/nginx/'), '/etc/nginx');
  assert.strictEqual(safePath('/var/www/../log'), '/var/log');
  assert.strictEqual(safePath('/'), '/');
});

test('safePath: geçersizleri reddeder', () => {
  assert.throws(() => safePath(''), UnsafePathError);
  assert.throws(() => safePath('relative/path'), UnsafePathError);
  assert.throws(() => safePath('/etc/\0/passwd'), UnsafePathError);
  // @ts-expect-error tip dışı
  assert.throws(() => safePath(null), UnsafePathError);
});

test('safePath: .. ile köke tırmanma normalize edilir (kök dışına çıkmaz)', () => {
  assert.strictEqual(safePath('/../../../etc'), '/etc'); // normalize köke sabitler
});

test('formatSize', () => {
  assert.strictEqual(formatSize(0), '0 B');
  assert.strictEqual(formatSize(1024), '1.0 KB');
  assert.strictEqual(formatSize(1536), '1.5 KB');
  assert.strictEqual(formatSize(-1), '—');
});
```

- [ ] **Step 3:** Run `npm test` → FAIL, sonra Step 1 ile PASS. `npx tsc --noEmit` temiz.
- [ ] **Step 4: Commit** `git add lib/server/files/path-safety.ts lib/server/files/path-safety.test.ts && git commit -m "feat(files): safe path + size helpers + unit tests"`

---

### Task 2: Dosya API route'ları

**Files:** Create the 8 route files under `app/api/files/...`. **Modify** `lib/api-client.ts`.

**Interfaces:** Consumes Task 1 `safePath`/`FileEntry`; `requireAuth`/`unauthorized`. Produces REST endpoints (aşağıda) + api-client `fileList/fileRead/fileSave/fileMkdir/fileRename/fileDelete` (JSON). Upload/download client'ta raw fetch.

- [ ] **Step 1: list** — `app/api/files/list/route.ts`:

```ts
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { requireAuth, unauthorized } from '@/lib/auth';
import { safePath, UnsafePathError, type FileEntry } from '@/lib/server/files/path-safety';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  if (!(await requireAuth(req))) return unauthorized();
  try {
    const dir = safePath(new URL(req.url).searchParams.get('path') || '/');
    const names = await fs.readdir(dir);
    const entries: FileEntry[] = [];
    for (const name of names) {
      try {
        const st = await fs.lstat(path.posix.join(dir, name));
        entries.push({
          name,
          type: st.isDirectory() ? 'dir' : st.isFile() ? 'file' : 'other',
          size: st.size,
          mtime: st.mtimeMs,
          mode: (st.mode & 0o777).toString(8).padStart(3, '0'),
        });
      } catch { /* erişilemeyen girdiyi atla */ }
    }
    entries.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1));
    return Response.json({ path: dir, entries });
  } catch (e) {
    const status = e instanceof UnsafePathError ? 400 : 500;
    return Response.json({ error: (e as Error).message }, { status });
  }
}
```

- [ ] **Step 2: read (text edit)** — `app/api/files/read/route.ts`: requireAuth → `safePath` → `fs.stat`; if `size > 2*1024*1024` → 413 `{error:'Dosya çok büyük (düzenleme ≤2MB)'}`; else `{ content: await fs.readFile(p,'utf8') }`. UnsafePathError→400, ENOENT→404, else 500.

- [ ] **Step 3: download (binary)** — `app/api/files/download/route.ts`: requireAuth → `safePath` → stat (dir → 400); stream file: `return new Response(nodeReadableToWeb(createReadStream(p)), { headers: { 'Content-Disposition': 'attachment; filename="'+encodeURIComponent(path.posix.basename(p))+'"', 'Content-Type':'application/octet-stream', 'Content-Length': String(size) } })`. Node stream→web: `import { Readable } from 'node:stream'; Readable.toWeb(createReadStream(p)) as unknown as ReadableStream`.

- [ ] **Step 4: save** — `app/api/files/save/route.ts` POST `{path, content}`: requireAuth → `safePath`; if `content.length > 5*1024*1024` → 413; `await fs.writeFile(p, content, 'utf8')` → `{ok:true}`.

- [ ] **Step 5: mkdir + rename** — `mkdir/route.ts` POST `{path}` → `fs.mkdir(safePath(path), {recursive:true})`; `rename/route.ts` POST `{from,to}` → `fs.rename(safePath(from), safePath(to))`. Hata→uygun status.

- [ ] **Step 6: upload (multipart)** — `app/api/files/upload/route.ts` POST: requireAuth → `const dir = safePath(searchParams.get('path')||'/')`; `const form = await req.formData(); const file = form.get('file') as File`; boyut > 200MB → 413; `await fs.writeFile(path.posix.join(dir, safeBaseName), Buffer.from(await file.arrayBuffer()))` — `safeBaseName = path.posix.basename(file.name)` (yol ayırıcı strip). `{ok:true}`.

- [ ] **Step 7: delete** — `app/api/files/route.ts` DELETE `{path, recursive?}`: requireAuth → `safePath` → `fs.rm(p, { recursive: !!recursive, force:false })` → `{ok:true}`. Kök `/` silme reddi: if `p === '/'` → 400.

- [ ] **Step 8: api-client** — `lib/api-client.ts`'e ekle:
```ts
  fileList: (p: string) => request('GET', `/files/list?path=${encodeURIComponent(p)}`),
  fileRead: (p: string) => request('GET', `/files/read?path=${encodeURIComponent(p)}`),
  fileSave: (p: string, content: string) => request('POST', '/files/save', { path: p, content }),
  fileMkdir: (p: string) => request('POST', '/files/mkdir', { path: p }),
  fileRename: (from: string, to: string) => request('POST', '/files/rename', { from, to }),
  fileDelete: (p: string, recursive: boolean) => request('DELETE', '/files', { path: p, recursive }),
```
(download/upload component'te raw fetch + Bearer.)

- [ ] **Step 9:** `npx tsc --noEmit` + `npm run build` PASS. `npm test` (Task 1 testleri geçer).
- [ ] **Step 10: Commit** `git add "app/api/files" lib/api-client.ts && git commit -m "feat(files): file API routes (list/read/download/save/mkdir/rename/upload/delete)"`

---

### Task 3: Frontend — Dosya yöneticisi sayfası + nav + i18n

**Files:** Create `app/(panel)/files/page.tsx` (+ components if needed). Modify `app/(panel)/layout.tsx`, `messages/{6}.json`.

- [ ] **Step 1: i18n (6 dil)** — `"files"` bloğu + `nav.files`. Anahtarlar: `title, name, size, modified, perms, upload, newFolder, edit, download, rename, delete, save, cancel, deleteConfirm, folderName, newName, empty, tooLarge`. tr örnek: `{ "title":"Dosyalar", "name":"Ad", "size":"Boyut", "modified":"Değişme", "perms":"İzin", "upload":"Yükle", "newFolder":"Yeni klasör", "edit":"Düzenle", "download":"İndir", "rename":"Yeniden adlandır", "delete":"Sil", "save":"Kaydet", "cancel":"İptal", "deleteConfirm":"{name} silinsin mi?", "folderName":"Klasör adı", "newName":"Yeni ad", "empty":"Boş klasör", "tooLarge":"Dosya çok büyük" }`. en/zh/es/de/fr karşılıkları (parity şart). `nav.files`: tr/es "Dosyalar"/"Archivos", en "Files", zh "文件", de "Dateien", fr "Fichiers".

- [ ] **Step 2: `app/(panel)/files/page.tsx` ('use client')** — state: `path` (default '/'), `entries`, `loading`, edit-modal (path+content), confirm-delete. `useEffect`+`load(path)` → `api.fileList(path)`. Breadcrumb (path segmentlerine tıkla → o dizine git). Tablo: ad (dir'e tıkla → gir; tabular boyut/mtime/mode; mobil `overflow-x:auto` sarmalı). Satır aksiyonları: dir → aç; file → Düzenle (`api.fileRead`→modal textarea→`api.fileSave`), İndir (raw fetch `/api/files/download?path=` + Bearer → blob → a[download]), Yeniden adlandır (prompt→`api.fileRename`), Sil (ConfirmDestructive→`api.fileDelete`). Toolbar: "Yeni klasör" (`api.fileMkdir`), "Yükle" (`<input type=file>` → FormData → raw fetch `/api/files/upload?path=` + Bearer). `useToast` hata/başarı. **`request`'in 2MB/200MB sınır hatalarını** toast'la göster.

- [ ] **Step 3: nav** — `app/(panel)/layout.tsx`: lucide `FolderOpen` import; `NAV_ITEMS`'a `{ id:'files', icon: FolderOpen, href:'/files' }` (terminal'den sonra). 

- [ ] **Step 4:** `npx tsc --noEmit` + `npm run build` + `npm test` (i18n parity) PASS.
- [ ] **Step 5: Commit** `git add "app/(panel)/files" "app/(panel)/layout.tsx" lib/api-client.ts messages/tr.json messages/en.json messages/zh.json messages/es.json messages/de.json messages/fr.json && git commit -m "feat(files): file manager page + nav + i18n"`

---

### Task 4: e2e + build/push/CI + deploy

**Files:** Create `e2e/files.spec.ts`.

- [ ] **Step 1: e2e** — login → "Dosyalar" nav → `/files` → h2 "Dosyalar" görünür → en az bir satır (kök `/` listelenir) görünür → doğrudan `page.goto('/files')` (SSR) çökmez → 360px taşma yok.
- [ ] **Step 2:** `npx tsc --noEmit`; `npm test`; `npm run e2e` (files + mevcut PASS; lone backups=stale-server → `rm -rf .next`+tekrar). `git push` → CI yeşil.
- [ ] **Step 3: Deploy** `bash deploy.sh` → health ok + caddy Valid.
- [ ] **Step 4: Canlı doğrulama** — `/files` 200, kök listelenir; bir metin dosyası düzenle (salt-okunur test: oku), klasör oluştur/sil (geçici). Path-traversal: `?path=relative` → 400.
- [ ] **Step 5: Ledger + tamam.**

## Self-Review (yazar)
- Kapsam: path-safety→T1; route'lar→T2; UI→T3; e2e+deploy→T4. Güvenlik: safePath her route'ta (T2), null-byte/relative reddi (T1 test), kök-sil reddi, upload basename-strip. Tip tutarlılığı: `FileEntry`/`safePath`/`formatSize` T1↔T2↔T3. Placeholder yok (T1 tam kod; T2 route'lar somut imza+kilit kod; T3 davranış net). xterm gibi SSR tuzağı yok (sayfa saf React).
