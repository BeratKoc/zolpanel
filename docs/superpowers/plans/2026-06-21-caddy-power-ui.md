# Caddy-Native (b): Power Features in UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Domain başına Caddy'nin gücünü UI'dan "tıkla-yapılandır" yapmak — **özel response header'lar, path redirect'leri, basic-auth (bcrypt), IP allow/deny** — DB'de `caddyExtras` olarak sakla, `buildDomainBlock` ile Caddy direktiflerine çevir, (c)'nin transactional `syncCaddyConfig` + `caddy validate` kapısından geçir.

**Architecture:** `DomainDoc.caddyExtras?: CaddyExtras` (DB'de `caddyExtras TEXT` JSON kolonu). `buildDomainBlock` bu ekstraları domain bloğunun içine emit eder (her tip: proxy/static/advanced). API create/update `caddyExtras`'ı Zod ile doğrular; **basic-auth düz şifreyi server'da bcrypt'ler** (asla düz saklanmaz). UI: Add/Edit modalinde paylaşımlı `CaddyExtrasEditor`. Caddy'ye yazım (c)'deki `syncCaddyConfig` ile — hatalı direktif `caddy validate`'te reddedilir, canlı bozulmaz.

**Tech Stack:** Next.js 15 + TS, better-sqlite3, Zod, bcryptjs, lucide-react, next-intl, Playwright.

## Global Constraints
- Tüm `caddyExtras` Caddyfile'a `buildDomainBlock` → `syncCaddyConfig` ile gider; **`caddy validate` kapısı** hatalı direktifi canlıdan önce yakalar (geçersizse uygulanmaz). MASTER §11 anti-patterns geçerli.
- **basic-auth şifresi ASLA düz saklanmaz** — API'de `bcrypt.hash` ile hash'lenip `passwordHash` olarak saklanır; Caddy `basic_auth` bcrypt hash'i kabul eder. UI düz şifre gönderir, server hash'ler. Mevcut hash varsa ve UI boş şifre gönderirse korunur.
- Tüm girdiler Zod ile doğrulanır (header key/value, CIDR formatı, redirect path, basic-auth kullanıcı adı). Injection (newline/`{`/`}`) reddedilir.
- Yeni UI metinleri **6 dilde** (tr/en/zh/es/de/fr). İkonlar **Lucide** (emoji yok). Form: görünür label + alan-altı hata.
- `≥768` desktop davranışı korunur; editör mobilde de düzgün (responsive sınıflar). Mevcut unit+e2e yeşil kalır.
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. Windows: build EPERM → `rm -rf .next` retry.

### CaddyExtras tipi (tüm task'larda aynı)
```ts
export interface CaddyHeader { key: string; value: string; }
export interface CaddyRedirect { from: string; to: string; permanent: boolean; }
export interface CaddyBasicAuth { username: string; passwordHash: string; }
export interface CaddyIpRules { mode: 'allow' | 'deny'; cidrs: string[]; }
export interface CaddyExtras {
  headers?: CaddyHeader[];
  redirects?: CaddyRedirect[];
  basicAuth?: CaddyBasicAuth[];
  ipRules?: CaddyIpRules | null;
}
```

---

### Task 1: DB — `caddyExtras` kolonu + tipler + CRUD

**Files:** Modify `lib/server/db.ts`; Test `lib/server/db-caddyextras.test.ts` (opsiyonel — saf mapping zor; tsc + e2e yeterli olabilir, aşağıda).

**Interfaces:** Produces `CaddyExtras` (+ alt tipler) export; `DomainDoc.caddyExtras?: CaddyExtras`; insert/update/rowToDomain `caddyExtras`'ı taşır.

- [ ] **Step 1:** `db.ts`'e `CaddyExtras` ve alt tipleri ekle (yukarıdaki blok). `DomainDoc`'a `caddyExtras?: CaddyExtras;` alanı ekle.
- [ ] **Step 2:** `createTables`'daki domains tablosuna `caddyExtras TEXT` ekle (yeni kurulumlar için). MEVCUT DB için migration: `initDb`/`open` içinde `createTables` sonrası şunu çağır:
```ts
function migrate(conn: DB): void {
  // SQLite: yoksa kolon ekle (varsa hata fırlatır → yut).
  try { conn.exec("ALTER TABLE domains ADD COLUMN caddyExtras TEXT"); } catch { /* zaten var */ }
}
```
`open()` içinde `createTables(conn); migrate(conn);` sırayla.
- [ ] **Step 3:** `DomainRow`'a `caddyExtras: string | null;` ekle. `rowToDomain`'a: `caddyExtras: r.caddyExtras ? (JSON.parse(r.caddyExtras) as CaddyExtras) : undefined,`.
- [ ] **Step 4:** `insertDomain`: INSERT kolon listesine `caddyExtras` ekle, value `d.caddyExtras ? JSON.stringify(d.caddyExtras) : null`. `updateDomain`: `if (patch.caddyExtras !== undefined) set('caddyExtras', patch.caddyExtras ? JSON.stringify(patch.caddyExtras) : null);`.
- [ ] **Step 5:** `npx tsc --noEmit` temiz; `npm run build`; `npm test` (mevcut 18) + `npm run e2e` (19) PASS (kolon eklemek mevcut davranışı bozmaz).
- [ ] **Step 6: Commit** `git add lib/server/db.ts && git commit -m "feat(caddy-ui): caddyExtras column + types + CRUD"`

---

### Task 2: `buildDomainBlock` — caddyExtras → Caddy direktifleri (+ unit testler)

**Files:** Modify `lib/server/caddy.ts`; Test `lib/server/caddy-extras.test.ts`.

**Interfaces:** Consumes `CaddyExtras` (Task 1). `DomainConfig`'e `caddyExtras?: CaddyExtras` ekle (zaten `Partial<Pick<DomainDoc,...>>` — `caddyExtras`'ı da dahil et). `buildDomainBlock` ekstraları bloğa gömer.

- [ ] **Step 1: Failing testler** `lib/server/caddy-extras.test.ts` (db stub'lı, saf):
```ts
import { test } from 'node:test';
import assert from 'node:assert';
const dbPath = require.resolve('./db.ts');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { addLog: () => {} } } as never;
import { buildDomainBlock } from './caddy';

test('header emit', () => {
  const b = buildDomainBlock({ domain:'a.com', type:'proxy', port:3000, aliases:[], caddyExtras:{ headers:[{key:'X-Foo',value:'bar'}] } } as never);
  assert.match(b, /header \{[\s\S]*X-Foo "bar"[\s\S]*\}/);
});
test('redirect emit (kalıcı 301)', () => {
  const b = buildDomainBlock({ domain:'a.com', type:'proxy', port:3000, aliases:[], caddyExtras:{ redirects:[{from:'/old',to:'/new',permanent:true}] } } as never);
  assert.match(b, /redir \/old \/new 301/);
});
test('ip deny emit', () => {
  const b = buildDomainBlock({ domain:'a.com', type:'proxy', port:3000, aliases:[], caddyExtras:{ ipRules:{mode:'deny',cidrs:['1.2.3.4','10.0.0.0/8']} } } as never);
  assert.match(b, /@zolpanel_ipblock/);
  assert.match(b, /respond @zolpanel_ipblock 403/);
});
test('basic_auth emit (hash)', () => {
  const b = buildDomainBlock({ domain:'a.com', type:'proxy', port:3000, aliases:[], caddyExtras:{ basicAuth:[{username:'admin',passwordHash:'$2a$14$abc'}] } } as never);
  assert.match(b, /basic_auth \{[\s\S]*admin \$2a\$14\$abc[\s\S]*\}/);
});
test('ekstra yoksa eski çıktı (regresyon)', () => {
  const b = buildDomainBlock({ domain:'a.com', type:'proxy', port:3000, aliases:[] } as never);
  assert.ok(b.includes('reverse_proxy localhost:3000') && !b.includes('header {'));
});
```
Run `npm test` → FAIL.

- [ ] **Step 2:** `caddy.ts`'e ekle (pure):
```ts
function caddyExtrasBody(x?: CaddyExtras, indent = '    '): string {
  if (!x) return '';
  const lines: string[] = [];
  // IP allow/deny (matcher + respond)
  if (x.ipRules && x.ipRules.cidrs.length > 0) {
    const cidrs = x.ipRules.cidrs.map((c) => c.trim()).filter(Boolean).join(' ');
    if (x.ipRules.mode === 'deny') {
      lines.push(`@zolpanel_ipblock remote_ip ${cidrs}`);
    } else {
      lines.push(`@zolpanel_ipblock not remote_ip ${cidrs}`);
    }
    lines.push(`respond @zolpanel_ipblock 403`);
  }
  // basic_auth
  if (x.basicAuth && x.basicAuth.length > 0) {
    const users = x.basicAuth.map((u) => `        ${u.username} ${u.passwordHash}`).join('\n');
    lines.push(`basic_auth {\n${users}\n    }`);
  }
  // headers
  if (x.headers && x.headers.length > 0) {
    const hs = x.headers.map((h) => `        ${h.key} "${h.value.replace(/"/g, '\\"')}"`).join('\n');
    lines.push(`header {\n${hs}\n    }`);
  }
  // redirects
  if (x.redirects && x.redirects.length > 0) {
    for (const r of x.redirects) lines.push(`redir ${r.from} ${r.to} ${r.permanent ? 301 : 302}`);
  }
  return lines.map((l) => indent + l).join('\n');
}
```
Sonra `buildDomainBlock`'ta her tip için, blok gövdesine ekstra satırları enjekte et. Proxy örneği:
```ts
  if (type === 'proxy') {
    const extra = caddyExtrasBody(domainConfig.caddyExtras);
    return `${allDomains} {\n${extra ? extra + '\n' : ''}    reverse_proxy localhost:${port}\n    encode gzip\n}\n\n`;
  }
```
Aynı şekilde `static` ve `advanced` bloklarına da `extra ? extra + '\n' : ''` ekle (blok açılışından hemen sonra). `DomainConfig` tipine `caddyExtras?: CaddyExtras` ekle.
> Caddy otomatik direktif sıralaması: `@matcher`/`respond`/`basic_auth`/`header`/`redir` geçerli direktifler; `caddy validate` doğruluğu garantiler. Sıra sorun olursa validate yakalar.

- [ ] **Step 3:** `npm test` → 5 yeni test PASS + mevcutlar. `npx tsc --noEmit` temiz.
- [ ] **Step 4: Commit** `git add lib/server/caddy.ts lib/server/caddy-extras.test.ts && git commit -m "feat(caddy-ui): buildDomainBlock emits headers/redirects/ip-rules/basic-auth"`

---

### Task 3: Zod doğrulama + API (basic-auth hash) 

**Files:** Modify `lib/validation.ts`, `app/api/domains/route.ts`, `app/api/domains/[id]/route.ts`; Test `lib/validation.test.ts` (ekle).

**Interfaces:** Produces `caddyExtrasSchema` (Zod). API create/update `caddyExtras` kabul eder; basic-auth düz şifreyi bcrypt'ler.

- [ ] **Step 1: `lib/validation.ts`** ekle:
```ts
const headerKey = z.string().regex(/^[A-Za-z0-9-]+$/, 'Geçersiz header adı').max(100);
const headerVal = z.string().max(500).regex(/^[^\n\r{}]*$/, 'Geçersiz değer');
const caddyPath = z.string().regex(/^\/[A-Za-z0-9._*/-]*$/, 'Geçersiz path').max(200);
const cidr = z.string().regex(/^[0-9a-fA-F:.]+(\/\d{1,3})?$/, 'Geçersiz IP/CIDR').max(64);
export const caddyExtrasSchema = z.object({
  headers: z.array(z.object({ key: headerKey, value: headerVal })).max(30).optional(),
  redirects: z.array(z.object({ from: caddyPath, to: z.string().min(1).max(300), permanent: z.boolean() })).max(30).optional(),
  // UI düz şifre yollar; server hash'ler (passwordHash burada DEĞİL)
  basicAuth: z.array(z.object({ username: z.string().regex(/^[A-Za-z0-9._-]+$/).max(50), password: z.string().min(1).max(200).optional(), passwordHash: z.string().optional() })).max(20).optional(),
  ipRules: z.object({ mode: z.enum(['allow','deny']), cidrs: z.array(cidr).max(100) }).nullable().optional(),
}).optional();
```
- [ ] **Step 2:** create + update domain şemalarına `caddyExtras: caddyExtrasSchema` ekle (createDomainSchema'nın her variant'ına + updateDomainSchema'ya).
- [ ] **Step 3: basic-auth hashleme helper** (`lib/server/db.ts` veya yeni `lib/server/caddyExtras.ts`):
```ts
import bcrypt from 'bcryptjs';
// UI'dan gelen {username, password?} listesini, saklanacak {username, passwordHash} listesine çevir.
// password verildiyse bcrypt'le; verilmediyse mevcut hash'i koru (prev parametresi).
export async function normalizeBasicAuth(
  incoming: { username: string; password?: string; passwordHash?: string }[] | undefined,
  prev: { username: string; passwordHash: string }[] | undefined,
): Promise<{ username: string; passwordHash: string }[] | undefined> {
  if (!incoming) return undefined;
  const out = [];
  for (const u of incoming) {
    if (u.password) out.push({ username: u.username, passwordHash: await bcrypt.hash(u.password, 14) });
    else {
      const old = prev?.find((p) => p.username === u.username);
      if (old) out.push(old); // şifre değişmedi
    }
  }
  return out;
}
```
- [ ] **Step 4:** `app/api/domains/route.ts` POST ve `[id]/route.ts` PUT: Zod parse sonrası, `caddyExtras` varsa `basicAuth`'u `normalizeBasicAuth(input.caddyExtras.basicAuth, prev?.caddyExtras?.basicAuth)` ile dönüştürüp doc'a yaz (PUT'ta prev = mevcut domain). Sonra mevcut `syncCaddyConfig(getAllDomains())` zaten devreye girer (Caddy'ye yazar, validate eder). `caddyExtras`'ı insertDomain/updateDomain'e ilet.
- [ ] **Step 5: test** `lib/validation.test.ts`'e: injection header value (`X-Foo: "a\nevil"`) → reject; geçersiz CIDR → reject; geçerli extras → accept. `npm test` PASS.
- [ ] **Step 6:** tsc + build + e2e PASS. **Commit** `git add lib app && git commit -m "feat(caddy-ui): Zod validation + basic-auth bcrypt hashing in API"`

---

### Task 4: UI — `CaddyExtrasEditor` + Add/Edit modal entegrasyonu + i18n

**Files:** Create `components/domains/CaddyExtrasEditor.tsx`; Modify `components/domains/AddDomainModal.tsx`, `components/domains/EditDomainModal.tsx`; Modify `messages/{tr,en,zh,es,de,fr}.json`.

**Interfaces:** Consumes `CaddyExtras` tipi. `CaddyExtrasEditor` props: `value: CaddyExtras; onChange: (v: CaddyExtras) => void;`.

- [ ] **Step 1:** `CaddyExtrasEditor.tsx` (`'use client'`): 4 katlanır bölüm (Lucide ikonlu başlıklar):
  - **Header'lar:** key+value satırları, ekle/sil (Plus/Trash2). Hazır güvenlik-başlığı şablonu butonu opsiyonel.
  - **Yönlendirmeler:** from (path) + to (URL/path) + "kalıcı (301)" checkbox; ekle/sil.
  - **Basic-Auth:** username + password (password type; placeholder "değiştirmemek için boş bırak"); ekle/sil. (Düz şifre gönderilir; server hash'ler.)
  - **IP Kuralı:** mod (allow/deny) select + CIDR listesi (virgülle/textarea). 
  Her satır responsive (`.route-row` benzeri sınıf kullan veya `flex-wrap`). Form alanları `FormField` ile.
- [ ] **Step 2:** `AddDomainModal` + `EditDomainModal`: forma `caddyExtras` state ekle; `<CaddyExtrasEditor value={...} onChange={...} />` render et (bir "Gelişmiş Caddy" başlığı altında). Submit payload'una `caddyExtras` ekle. EditModal mevcut `domain.caddyExtras`'ı initial state yapar; basic-auth için mevcut kullanıcıları (passwordHash'siz, sadece username) gösterir, password alanı boş.
- [ ] **Step 3: i18n** — yeni anahtarlar `domains` namespace'ine 6 dilde: `caddyAdvanced, headers, headerKey, headerValue, addHeader, redirects, redirectFrom, redirectTo, permanent, addRedirect, basicAuth, baUsername, baPassword, baPasswordKeep, addUser, ipRules, ipMode, ipAllow, ipDeny, ipCidrs, ipCidrsHint`. (tr kaynak + 5 çeviri.)
- [ ] **Step 4:** `npx tsc --noEmit` + `npm run build` + `npm test` (i18n namespace bütünlüğü) + `npm run e2e` PASS.
- [ ] **Step 5: Commit** `git add components messages && git commit -m "feat(caddy-ui): CaddyExtrasEditor + Add/Edit integration + i18n (6 langs)"`

---

### Task 5: E2E + final doğrulama + DİKKATLİ canlı deploy

**Files:** Modify `e2e/domains.spec.ts` (veya yeni `e2e/caddy-extras.spec.ts`).

- [ ] **Step 1:** E2E: login → domain ekle modalinde bir header (`X-Test: 1`) ekle → kaydet → domain listesinde görünür; Edit'te aç → header korunmuş. (Test env'de Caddy yok; DB'ye yazılması + UI round-trip doğrulanır.) `npm run e2e` PASS.
- [ ] **Step 2: Tam suit** `npx tsc --noEmit && npm test && npm run e2e` → hepsi PASS. `git push` → CI yeşil.
- [ ] **Step 3: Kod deploy** `bash deploy.sh` (Caddyfile dokunulmaz; health + caddy validate).
- [ ] **Step 4: Canlı kontrollü test** — sunucuda node ile dummy domain `zz-extra.local` (proxy:3998) + `caddyExtras: { headers:[{key:'X-Zol',value:'1'}] }` ekleyip `syncCaddyConfig(getAllDomains())` çağır → `caddy validate` geçer, reload olur. Doğrula: Caddyfile'da `X-Zol "1"` var, **5 gerçek site hâlâ 200/307**, caddy active. Sonra dummy'i sil → sync → temizlenir, siteler sağlam. (basic-auth için ayrı dummy ile `curl -u` 401/200 testi opsiyonel.)
- [ ] **Step 5: Rollback hazır:** `.zolpanel.bak` + `/tmp/zolpanel-bak-*.tgz`. Sorunlu site → bak geri yükle + reload.

---

## Self-Review (yazar)
- **Kapsam:** header→T2/T4, redirect→T2/T4, basic-auth(hash)→T2/T3/T4, ip-allow/deny→T2/T4; DB→T1; validate-gate güvenliği→(c) mevcut + T5. Tümü kapsandı.
- **Güvenlik:** basic-auth düz şifre server'da bcrypt(14); injection Zod ile (header/CIDR/path regex); hatalı direktif `caddy validate`'te reddedilir (canlı korunur). 
- **Tip tutarlılığı:** `CaddyExtras` (+alt tipler) T1'de tanımlı, T2/T3/T4 kullanır; `caddyExtrasBody`/`normalizeBasicAuth` imzaları sabit; `DomainConfig.caddyExtras` + `DomainDoc.caddyExtras` opsiyonel.
- **Caddy versiyon riski:** `basic_auth` (v2.8+) — sunucu caddy'si eskiyse `basicauth` gerekebilir; `caddy validate` yakalar → o durumda T5'te direktif adını sunucu sürümüne göre ayarla (validate hatası net söyler). 
- **Migration:** `ALTER TABLE ... ADD COLUMN caddyExtras` try/catch ile idempotent.
