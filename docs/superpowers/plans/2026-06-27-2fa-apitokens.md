# 2FA (TOTP) + API Tokens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.
> Task #27 "Env/Secrets + 2FA/API" → somut güvenlik kısmı: **2FA (TOTP) login + API tokens**. Bağımsız "env-vault" düşük-değer (deploy/apps zaten env taşıyor) → ERTELENDİ.

**Goal:** Login'e opsiyonel TOTP 2FA ekle + panel otomasyonu için API token'ları (oluştur/listele/iptal); API token ile de auth.

**Architecture:** Saf TOTP (RFC 6238) + base32 + API-token hash helper'ları (test-edilebilir, RFC vektörü); 2FA secret'ı settings-kv'de şifreli (per-user), API token'ları yeni `api_tokens` tablosunda (sha256 hash). Login route'una **opt-in** 2FA adımı; `requireAuth` **ek olarak** API token kabul eder (JWT korunur).

**Tech Stack:** Next.js 15 route handlers (nodejs), node:crypto (HMAC-SHA1 TOTP), better-sqlite3, TypeScript, node:test, next-intl (6 dil), Playwright.

## Global Constraints
- **2FA OPT-IN:** varsayılan kapalı → mevcut login DEĞİŞMEZ. 2FA yalnız kullanıcı etkinleştirip doğruladıktan sonra zorunlu olur. **API token auth EK:** JWT'li auth aynen çalışır; `zpat_` önekli token'lar ayrıca kabul edilir.
- TOTP secret AES-GCM şifreli (mevcut `encryptSecret`) settings-kv'de `totp:<username>` anahtarında. API token **düz saklanmaz** — yalnız sha256 hash; düz token oluşturmada bir kez gösterilir.
- Hepsi `requireAuth` (2FA setup/token route'ları). Commit yazarı `BeratKoc <ahmetberatkoc0@gmail.com>`; **Co-Authored-By YOK**.
- Test `npm test` (TOTP RFC vektörü tutmalı); build `npm run build` (Win EPERM→`rm -rf .next`); `npx tsc --noEmit` temiz; 6-dil i18n parity.
- Mevcut: `getUserByName`/`getDb`/settings-kv (`@/lib/server/db`); `encryptSecret`/`decryptSecret` (`@/lib/server/secrets`); `requireAuth`/`signToken`/`TokenPayload`/`unauthorized` (`@/lib/auth`); login `app/api/auth/login/route.ts` (bcrypt + rateLimit); `api` `request`.

## Dosya yapısı
- `lib/server/auth/totp.ts` — `base32Decode`/`generateTotp`/`verifyTotp`/`randomBase32Secret`/`otpauthUri`.
- `lib/server/auth/apitoken.ts` — `generateApiToken`/`hashApiToken`.
- `lib/server/auth/totp.test.ts` + `lib/server/auth/apitoken.test.ts`.
- `lib/server/db.ts` — `api_tokens` tablosu + `insertApiToken`/`listApiTokens`/`getApiTokenByHash`/`deleteApiToken`/`touchApiToken`.
- `lib/server/auth/twofactor.ts` — per-user TOTP store (settings-kv): `get2faState`/`set2faSecret`/`enable2fa`/`disable2fa`/`is2faEnabled`.
- `app/api/auth/2fa/route.ts` (GET status, POST setup, PUT verify-enable, DELETE disable), `app/api/auth/tokens/route.ts` (GET list, POST create, ) + `app/api/auth/tokens/[id]/route.ts` (DELETE).
- Modify: `app/api/auth/login/route.ts` (2fa adımı), `lib/auth.ts` (requireAuth API token kabul).
- `app/(panel)/settings/page.tsx` (2FA + API tokens kartları), `app/login/page.tsx` (TOTP kod adımı), `lib/api-client.ts`, `messages/{6}.json`.

---

### Task 1: Saf TOTP + API-token helper'ları + testler

**Files:** Create `lib/server/auth/totp.ts`, `lib/server/auth/apitoken.ts`, `lib/server/auth/totp.test.ts`, `lib/server/auth/apitoken.test.ts`.

**Interfaces:** Produces `base32Decode(s:string):Buffer`; `generateTotp(secretBase32:string, timeMs:number, opts?:{digits?:number;period?:number}):string`; `verifyTotp(secretBase32:string, code:string, timeMs:number, window?:number):boolean`; `randomBase32Secret(len?:number):string`; `otpauthUri(user:string, secretBase32:string):string`; `generateApiToken():{token:string;hash:string}`; `hashApiToken(token:string):string`.

- [ ] **Step 1: `lib/server/auth/totp.ts`:**
```ts
import crypto from 'node:crypto';

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Decode(s: string): Buffer {
  const clean = s.replace(/=+$/, '').toUpperCase().replace(/\s/g, '');
  let bits = '';
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx === -1) continue;
    bits += idx.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

function hotp(key: Buffer, counter: number, digits: number): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);
  return (code % 10 ** digits).toString().padStart(digits, '0');
}

export function generateTotp(secretBase32: string, timeMs: number, opts: { digits?: number; period?: number } = {}): string {
  const digits = opts.digits ?? 6, period = opts.period ?? 30;
  const counter = Math.floor(timeMs / 1000 / period);
  return hotp(base32Decode(secretBase32), counter, digits);
}

/** Saat kaymasına karşı ±window periyot kontrol eder. */
export function verifyTotp(secretBase32: string, code: string, timeMs: number, window = 1): boolean {
  const digits = code.length, period = 30;
  const key = base32Decode(secretBase32);
  const base = Math.floor(timeMs / 1000 / period);
  for (let w = -window; w <= window; w++) {
    if (hotp(key, base + w, digits) === code) return true;
  }
  return false;
}

export function randomBase32Secret(len = 20): string {
  const bytes = crypto.randomBytes(len);
  let bits = '';
  for (const b of bytes) bits += b.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i + 5 <= bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)];
  return out;
}

export function otpauthUri(user: string, secretBase32: string): string {
  return `otpauth://totp/Zolpanel:${encodeURIComponent(user)}?secret=${secretBase32}&issuer=Zolpanel`;
}
```

- [ ] **Step 2: `lib/server/auth/apitoken.ts`:**
```ts
import crypto from 'node:crypto';
export function hashApiToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
export function generateApiToken(): { token: string; hash: string } {
  const token = 'zpat_' + crypto.randomBytes(24).toString('base64url');
  return { token, hash: hashApiToken(token) };
}
```

- [ ] **Step 3: testler** — `lib/server/auth/totp.test.ts` (RFC 6238 vektörü; secret ASCII "12345678901234567890" = base32 "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", 6 hane, SHA1):
```ts
import { test } from 'node:test';
import assert from 'node:assert';
import { generateTotp, verifyTotp, base32Decode, randomBase32Secret } from './totp';

const SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'; // "12345678901234567890"

test('base32Decode ASCII secret', () => {
  assert.strictEqual(base32Decode(SECRET).toString('ascii'), '12345678901234567890');
});
test('generateTotp RFC 6238 vektörleri (SHA1, 6 hane)', () => {
  assert.strictEqual(generateTotp(SECRET, 59 * 1000), '287082');           // T=59 → ...287082
  assert.strictEqual(generateTotp(SECRET, 1111111109 * 1000), '081804');   // → ...081804
  assert.strictEqual(generateTotp(SECRET, 1234567890 * 1000), '005924');   // → ...005924
});
test('verifyTotp doğru kodu kabul, yanlışı red', () => {
  const t = 1111111109 * 1000;
  assert.strictEqual(verifyTotp(SECRET, '081804', t), true);
  assert.strictEqual(verifyTotp(SECRET, '000000', t), false);
});
test('verifyTotp pencere (±1 periyot)', () => {
  const t = 1111111109 * 1000;
  assert.strictEqual(verifyTotp(SECRET, generateTotp(SECRET, t - 30000), t), true); // önceki periyot
});
test('randomBase32Secret uzunluk + alfabe', () => {
  const s = randomBase32Secret();
  assert.match(s, /^[A-Z2-7]+$/);
  assert.ok(s.length >= 30);
});
```
> NOT: RFC 6238 8-haneli örnekler verir (94287082 vb.); 6 hane = son 6 hane (94287082→287082, 07081804→081804, 89005924→005924). Beklenen değerler yukarıda buna göre.

`lib/server/auth/apitoken.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert';
import { generateApiToken, hashApiToken } from './apitoken';
test('generateApiToken: zpat_ önekli, hash tutarlı', () => {
  const { token, hash } = generateApiToken();
  assert.match(token, /^zpat_[A-Za-z0-9_-]+$/);
  assert.strictEqual(hash, hashApiToken(token));
  assert.notStrictEqual(token, hash);
});
test('farklı token farklı hash', () => {
  assert.notStrictEqual(generateApiToken().token, generateApiToken().token);
});
```

- [ ] **Step 4:** `npm test` FAIL→PASS — **RFC vektörü tutmazsa TOTP yanlış, düzelt** (vektörü değiştirme). `npx tsc --noEmit` temiz.
- [ ] **Step 5: Commit** `git add lib/server/auth/totp.ts lib/server/auth/apitoken.ts lib/server/auth/totp.test.ts lib/server/auth/apitoken.test.ts && git commit -m "feat(auth): TOTP (RFC6238) + API token helpers + tests"`

---

### Task 2: db tablo + 2FA store + auth entegrasyonu + route'lar + api-client

**Files:** Modify `lib/server/db.ts`, `lib/auth.ts`, `app/api/auth/login/route.ts`. Create `lib/server/auth/twofactor.ts`, `app/api/auth/2fa/route.ts`, `app/api/auth/tokens/route.ts`, `app/api/auth/tokens/[id]/route.ts`. Modify `lib/api-client.ts`.

**Interfaces:** Consumes Task 1 + secrets + settings-kv. Produces 2FA + token routes + `requireAuth` API-token desteği + login 2FA adımı. api-client `twofaStatus/twofaSetup/twofaEnable/twofaDisable/tokensList/tokenCreate/tokenDelete`.

- [ ] **Step 1: db.ts `api_tokens` tablosu + fonksiyonlar.** Şemaya: `CREATE TABLE IF NOT EXISTS api_tokens (id TEXT PRIMARY KEY, name TEXT NOT NULL, tokenHash TEXT NOT NULL UNIQUE, createdAt TEXT NOT NULL, lastUsed TEXT);`. Fonksiyonlar (mevcut `getDb()` deseni): `insertApiToken({id,name,tokenHash,createdAt})`, `listApiTokens(): {id,name,createdAt,lastUsed}[]` (hash HARİÇ), `getApiTokenByHash(hash): {id,name}|null`, `deleteApiToken(id)`, `touchApiToken(id, iso)`.

- [ ] **Step 2: `lib/server/auth/twofactor.ts`** (settings-kv tabanlı, per-user): `is2faEnabled(user):boolean` (settings `totp:<user>` → JSON.enabled); `set2faSecret(user, base32)` (JSON `{secret:encryptSecret(base32), enabled:false}` → setSetting); `get2faSecret(user):string|null` (decrypt); `enable2fa(user)` (enabled=true); `disable2fa(user)` (deleteSetting). 

- [ ] **Step 3: `lib/auth.ts` requireAuth API-token desteği.** `requireAuth` başına: token `zpat_` ile başlıyorsa → `getApiTokenByHash(hashApiToken(token))` → varsa `touchApiToken` + synthetic payload `{id:'apitoken:'+rec.id, username:'api:'+rec.name, tv:0}` döndür; yoksa null. Aksi halde mevcut JWT akışı. (Mevcut JWT auth AYNEN korunur.)

- [ ] **Step 4: login route 2FA adımı.** `app/api/auth/login/route.ts`: şifre doğrulandıktan SONRA, `is2faEnabled(username)` ise: body'de `totp` yoksa → `Response.json({ twoFactorRequired: true })` (token YOK, rateLimit reset ETME); `totp` varsa `verifyTotp(get2faSecret(username), totp, Date.now())` → geçersizse 401 `{error:'Geçersiz 2FA kodu'}`; geçerliyse devam (token ver). 2FA kapalıysa akış AYNEN. (loginSchema'ya opsiyonel `totp` ekle — `app/lib/validation` `loginSchema`'ya `totp: z.string().optional()`.)

- [ ] **Step 5: route'lar** (hepsi requireAuth; **kullanıcı = auth.username**):
  - `2fa/route.ts`: GET → `{enabled: is2faEnabled(auth.username)}`; POST (setup) → `const secret=randomBase32Secret(); set2faSecret(auth.username, secret)` → `{secret, otpauth: otpauthUri(auth.username, secret)}` (henüz enabled değil); PUT (verify-enable) `{code}` → `verifyTotp(get2faSecret(auth.username), code, Date.now())` → geçerliyse `enable2fa` + `{ok:true}`, değilse 400; DELETE → `disable2fa` → `{ok:true}`.
  - `tokens/route.ts`: GET → `{tokens: listApiTokens()}`; POST `{name}` → `const {token,hash}=generateApiToken(); insertApiToken({id:randomUUID(),name,tokenHash:hash,createdAt:now})` → `{token}` (BİR KEZ; bir daha gösterilmez).
  - `tokens/[id]/route.ts`: DELETE → `deleteApiToken(id)` → `{ok:true}`.
- [ ] **Step 6: api-client:**
```ts
  twofaStatus: () => request('GET', '/auth/2fa'),
  twofaSetup: () => request('POST', '/auth/2fa'),
  twofaEnable: (code: string) => request('PUT', '/auth/2fa', { code }),
  twofaDisable: () => request('DELETE', '/auth/2fa'),
  tokensList: () => request('GET', '/auth/tokens'),
  tokenCreate: (name: string) => request('POST', '/auth/tokens', { name }),
  tokenDelete: (id: string) => request('DELETE', `/auth/tokens/${encodeURIComponent(id)}`),
```
Ayrıca `api.login`'i 2FA destekleyecek şekilde güncelle: `login: (u,p,totp?) => request('POST','/auth/login',{username:u,password:p,...(totp?{totp}:{})})`.
- [ ] **Step 7:** `npx tsc --noEmit` + `npm run build` + `npm test` PASS.
- [ ] **Step 8: Commit** `git add lib/server/db.ts lib/auth.ts "app/api/auth" lib/server/auth/twofactor.ts lib/validation.ts lib/api-client.ts && git commit -m "feat(auth): 2FA store + api_tokens table + login 2fa step + requireAuth api-token support"`

---

### Task 3: Frontend — Settings 2FA + API tokens kartları + login TOTP adımı + i18n

**Files:** Modify `app/(panel)/settings/page.tsx`, `app/login/page.tsx`, `lib/api-client.ts` (login), `messages/{6}.json`.

- [ ] **Step 1: i18n (6 dil)** — `twofa` + `apitokens` blokları. twofa: `title, status, enabled, disabled, enable, disable, setupScan, secret, otpauth, enterCode, verify, verified, invalidCode, disableConfirm`. apitokens: `title, create, name, namePlaceholder, created, lastUsed, never, revoke, revokeConfirm, tokenOnce, copy, empty`. login: `totpPrompt, totpCode`. Tüm 6 dilde parity.
- [ ] **Step 2: Settings sayfası** (`app/(panel)/settings/page.tsx`): iki yeni `Section`:
  1. **2FA:** `twofaStatus()` → enabled rozeti. Kapalıysa "Etkinleştir" → `twofaSetup()` → secret + otpauth URI göster (kullanıcı authenticator'a girer) + kod input + "Doğrula" → `twofaEnable(code)` → enabled. Açıksa "Devre dışı bırak" (onay) → `twofaDisable()`.
  2. **API Tokens:** `tokensList()` → tablo (name/created/lastUsed) + Revoke (onay→`tokenDelete`). "Oluştur" → name input → `tokenCreate(name)` → dönen token'ı BİR KEZ göster (kopyala butonu + "tekrar gösterilmez" uyarısı).
  - `useToast`. Mobil uyumlu.
- [ ] **Step 3: Login sayfası 2FA adımı** (`app/login/page.tsx`): submit → `api.login(u,p)`; yanıt `{twoFactorRequired:true}` ise → TOTP kod input göster (`totpCode`) + tekrar `api.login(u,p,code)`; başarılıysa token kaydet. Hata mesajları toast/inline.
- [ ] **Step 4:** `npx tsc --noEmit` + `npm run build` + `npm test` (i18n parity) PASS.
- [ ] **Step 5: Commit** `git add "app/(panel)/settings/page.tsx" app/login/page.tsx lib/api-client.ts messages/tr.json messages/en.json messages/zh.json messages/es.json messages/de.json messages/fr.json && git commit -m "feat(auth): settings 2FA + API tokens UI + login TOTP step + i18n"`

---

### Task 4: e2e + deploy

**Files:** Create `e2e/twofa.spec.ts`.

- [ ] **Step 1: e2e** — login (mevcut, 2FA kapalı → AYNEN çalışmalı — bu regresyon testi kritik) → Ayarlar → 2FA bölümü görünür ("Etkinleştir" butonu) + API Tokens bölümü görünür ("Oluştur"). Doğrudan `/settings` SSR çökmez. 360px taşma yok. (2FA enable akışını uçtan e2e'de TOTP üretmek gerektirir; opsiyonel — chrome doğrulaması yeterli.)
- [ ] **Step 2:** `npx tsc --noEmit`; `npm test` (TOTP RFC + hepsi); `npm run e2e` (twofa + **mevcut auth.spec login testi GEÇMELİ** — 2FA opt-in geriye-uyum kanıtı; backups stale→`rm -rf .next`+tekrar). `git push` → CI yeşil.
- [ ] **Step 3: Deploy** `bash deploy.sh` → health + caddy Valid.
- [ ] **Step 4: Canlı doğrulama** — **mevcut login hâlâ çalışıyor** (2FA kapalı, kritik); `/settings` 2FA+token bölümleri 200; `/api/auth/2fa` no-auth→401. (2FA-enable + API-token uçtan-uca kullanıcının authenticator'ıyla.) **Sunucuda 2FA'yı etkinleştirip kilitlenme YAPMA** — kullanıcının bilinçli aksiyonu.
- [ ] **Step 5: Ledger + tamam.**

## Self-Review (yazar)
- Kapsam: TOTP+token helpers→T1; db+2fa-store+auth-entegrasyon+route'lar→T2; UI→T3; e2e+deploy→T4. **Geriye-uyum (kritik):** 2FA opt-in (default kapalı→login değişmez), API-token auth ek (JWT korunur) — T2 + T4 regresyon testi. Güvenlik: TOTP RFC-vektör doğru, secret şifreli, API token yalnız hash saklanır + bir kez gösterilir, requireAuth her route. Tip tutarlılığı: totp/apitoken helper'ları + db fonksiyonları + twofactor store T1↔T2↔T3. Placeholder yok. NOT: db.ts `getDb()` + validation.ts loginSchema implementer tarafından gerçek isimle eşlenir.
