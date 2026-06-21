# Caddy-Native (a): HTTPS/Domain Experience — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Domain ekleyince sertifika durumunu **canlı** (issuing→active→error) göstermek: domains listesi pending/error varken kısa aralıkla otomatik yenilenir, SSL rozeti net 3 durum + **sertifika bilgisi (issuer/bitiş)** + hata durumunda **yeniden-dene** butonu. "Pürüzsüz HTTPS" hissi.

**Architecture:** Mevcut `ssl.ts` (127.0.0.1:443'e SNI ile TLS handshake) cert'i zaten inceliyor; onu issuer+bitiş döndürecek şekilde genişlet. `sslTracker` (60sn) DB'yi tazeliyor. Ek: **on-demand re-check endpoint** (`/api/domains/[id]/ssl`) + **client polling** (pending/error varken ~8sn). UI: DomainCard SSL rozeti 3 durum + expiry tooltip + retry. Caddy config'e dokunulmaz (sadece okuma/handshake).

**Tech Stack:** Next.js 15 + TS, better-sqlite3, Node `tls`, lucide-react, next-intl, Playwright.

## Global Constraints
- Caddy yapılandırması DEĞİŞMEZ (yalnız TLS handshake + DB sslStatus okuma/yazma). 
- Polling **hafif**: yalnızca en az bir domain `pending`|`error` iken çalışır; hepsi `active` olunca veya ~2.5dk üst sınırda durur. `prefers-reduced-motion` ve sayfa gizliyken (document.hidden) gereksiz istek atma.
- SSL durumu hem **renk hem ikon/metin** (MASTER §2 color-not-only): active=Lock/yeşil, pending=Clock/sarı, error=AlertTriangle/kırmızı.
- Yeni metinler 6 dilde. İkonlar Lucide. requireAuth tüm uçlarda.
- Mevcut unit/e2e yeşil kalır. Commit trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. Windows EPERM → `rm -rf .next`.

---

### Task 1: `ssl.ts` — sertifika bilgisi (issuer + bitiş) döndür

**Files:** Modify `lib/server/ssl.ts`; Test `lib/server/ssl.test.ts`.

**Interfaces:** Produces `export interface SslInfo { status: SslStatus; issuer?: string; validTo?: string }` ve `export function checkDomainSslInfo(domain, timeoutMs?): Promise<SslInfo>`. `checkDomainSsl` korunur (status döndürür, içeride info'yu çağırır). Saf `classifyCertInfo(cert, domain): SslInfo` export edilir (test için).

- [ ] **Step 1: Failing test** `lib/server/ssl.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert';
import { classifyCertInfo } from './ssl';

const future = new Date(Date.now() + 86400000 * 60).toUTCString();
const past = new Date(Date.now() - 86400000).toUTCString();

test('public CA + eşleşme + süre → active + issuer + validTo', () => {
  const r = classifyCertInfo({ valid_to: future, issuer: { O: "Let's Encrypt" }, subjectaltname: 'DNS:a.com', subject: { CN: 'a.com' } } as never, 'a.com');
  assert.strictEqual(r.status, 'active');
  assert.match(r.issuer ?? '', /Let's Encrypt/);
  assert.ok(r.validTo);
});
test('caddy internal CA → pending', () => {
  const r = classifyCertInfo({ valid_to: future, issuer: { CN: 'Caddy Local Authority' }, subjectaltname: 'DNS:a.com', subject: { CN: 'a.com' } } as never, 'a.com');
  assert.strictEqual(r.status, 'pending');
});
test('süresi dolmuş → error', () => {
  const r = classifyCertInfo({ valid_to: past, issuer: { O: "Let's Encrypt" }, subjectaltname: 'DNS:a.com', subject: { CN: 'a.com' } } as never, 'a.com');
  assert.strictEqual(r.status, 'error');
});
test('cert yok → pending', () => {
  assert.strictEqual(classifyCertInfo({} as never, 'a.com').status, 'pending');
});
```
Run `npm test` → FAIL.

- [ ] **Step 2:** `ssl.ts`: ekle/refactor:
```ts
export interface SslInfo { status: SslStatus; issuer?: string; validTo?: string; }

export function classifyCertInfo(cert: PeerCertificate, domain: string): SslInfo {
  if (!cert || Object.keys(cert).length === 0 || !cert.valid_to) return { status: 'pending' };
  const issuerRaw = (cert.issuer?.O || cert.issuer?.CN || '') as string;
  const issuer = `${str(cert.issuer?.O)} ${str(cert.issuer?.CN)}`;
  if (issuer.includes('caddy')) return { status: 'pending', issuer: issuerRaw, validTo: cert.valid_to };
  const target = domain.toLowerCase();
  const san = str(cert.subjectaltname);
  const cn = str(cert.subject?.CN);
  const nameMatches = san.split(',').some((e) => e.trim() === `dns:${target}`) || cn === target;
  const notExpired = new Date(cert.valid_to).getTime() > Date.now();
  const base = { issuer: issuerRaw || undefined, validTo: cert.valid_to };
  if (nameMatches && notExpired) return { status: 'active', ...base };
  return { status: 'error', ...base };
}

export function checkDomainSslInfo(domain: string, timeoutMs = 5000): Promise<SslInfo> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (r: SslInfo) => { if (settled) return; settled = true; try { socket.destroy(); } catch { /**/ } resolve(r); };
    const socket = tls.connect(
      { host: '127.0.0.1', port: 443, servername: domain, rejectUnauthorized: false, timeout: timeoutMs },
      () => finish(classifyCertInfo(socket.getPeerCertificate(), domain)),
    );
    socket.on('error', () => finish({ status: 'error' }));
    socket.on('timeout', () => finish({ status: 'error' }));
  });
}
```
Refactor `checkDomainSsl` to `return checkDomainSslInfo(domain, timeoutMs).then((r) => r.status);` (keep old classifyCert OR delete it — `sslTracker`/dry-run import `checkDomainSsl`/composers, not `classifyCert`; if `classifyCert` unused after refactor, remove it). Keep `checkDomainSsl` export (sslTracker uses it).

- [ ] **Step 3:** `npm test` → 4 new pass + existing. `npx tsc --noEmit` clean. `npm run build` ok.
- [ ] **Step 4: Commit** `git add lib/server/ssl.ts lib/server/ssl.test.ts && git commit -m "feat(https): checkDomainSslInfo returns issuer + expiry"`

---

### Task 2: On-demand SSL re-check endpoint + api-client

**Files:** Create `app/api/domains/[id]/ssl/route.ts`; Modify `lib/api-client.ts`.

**Interfaces:** Consumes `checkDomainSslInfo` (Task 1), `getDomainById`/`updateDomain` (db). Produces GET `/api/domains/:id/ssl` → `{ status, issuer?, validTo? }` (ve DB sslStatus'ı tazeler). api-client: `recheckSsl(id): Promise<{status,issuer?,validTo?}>`.

- [ ] **Step 1:** `app/api/domains/[id]/ssl/route.ts`:
```ts
import { requireAuth, unauthorized } from '@/lib/auth';
import { getDomainById, updateDomain } from '@/lib/server/db';
import { checkDomainSslInfo } from '@/lib/server/ssl';
export const runtime = 'nodejs';
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAuth(req))) return unauthorized();
  const { id } = await params;
  const dom = getDomainById(id);
  if (!dom) return Response.json({ error: 'Domain bulunamadı' }, { status: 404 });
  const info = await checkDomainSslInfo(dom.domain);
  updateDomain(id, { sslStatus: info.status === 'active' ? 'active' : info.status === 'pending' ? 'pending' : 'pending', updatedAt: new Date().toISOString() });
  return Response.json(info);
}
```
> Not: `sslStatus` DB tipi `'pending'|'active'` (error yok); error → DB'de 'pending' yaz (UI canlı info'dan 'error' gösterir). Bu sınırı korumak için yukarıdaki map.
- [ ] **Step 2:** `lib/api-client.ts` ekle: `recheckSsl: (id: string) => request('GET', \`/domains/${id}/ssl\`),`
- [ ] **Step 3:** `npx tsc --noEmit` + `npm run build` + `npm run e2e` (20) PASS.
- [ ] **Step 4: Commit** `git add app/api/domains lib/api-client.ts && git commit -m "feat(https): on-demand SSL re-check endpoint + client"`

---

### Task 3: Domains polling + zengin SSL rozeti + retry + i18n

**Files:** Modify `app/(panel)/domains/page.tsx`, `components/domains/DomainCard.tsx`; Modify `messages/{tr,en,zh,es,de,fr}.json`.

**Interfaces:** Consumes `api.recheckSsl` + `api.getDomains`. DomainCard'a `onRecheck?: (id) => void` prop'u eklenir.

- [ ] **Step 1: Polling** (`domains/page.tsx`): mevcut `load()`'a ek olarak, domain listesinde `sslStatus !== 'active'` olan varsa `useEffect` ile `setInterval(load, 8000)` kur; hepsi active olunca veya ~18 tur (~2.4dk) sonra temizle; `document.hidden` ise tik atma. (Mevcut load fonksiyonunu kullan; sadece sslStatus alanını günceller.)
- [ ] **Step 2: DomainCard SSL rozeti** (`DomainCard.tsx`): mevcut `Lock`(active)/`Clock`(pending) yerine 3 durum:
  - `active`: `<Lock>` yeşil + Badge "SSL"; `title` = bitiş tarihi (varsa). 
  - `pending`: `<Clock>` sarı + "Sertifika alınıyor" (`domains.sslPending`).
  - `error`: `<AlertTriangle>` kırmızı + "SSL hatası" (`domains.sslError`) + küçük **retry** IconBtn (`RotateCw`, aria-label `domains.sslRetry`) → `onRecheck(domain._id)`.
  (Lucide importları ekle: `AlertTriangle, RotateCw` — `Lock, Clock` zaten var.)
- [ ] **Step 3:** `domains/page.tsx`: `handleRecheck(id)` → `await api.recheckSsl(id); load();` ; DomainCard'a `onRecheck={handleRecheck}` geç.
- [ ] **Step 4: i18n** 6 dilde `domains` namespace: `sslPending` (tr "Sertifika alınıyor"), `sslError` (tr "SSL hatası"), `sslRetry` (tr "Yeniden dene"), `sslActiveTitle` (tr "Sertifika geçerli"). en: "Issuing certificate","SSL error","Retry","Certificate valid". (zh/es/de/fr çeviri.)
- [ ] **Step 5:** `npx tsc --noEmit` + `npm run build` + `npm test` (i18n bütünlük) + `npm run e2e` (20) PASS.
- [ ] **Step 6: Commit** `git add "app/(panel)/domains" components/domains messages && git commit -m "feat(https): live SSL polling + rich status badge + retry"`

---

### Task 4: E2E + doğrulama + deploy

**Files:** Modify `e2e/domains.spec.ts` (veya yeni spec).

- [ ] **Step 1: E2E** (mock'lu): `page.route('**/api/domains', GET → [domain with sslStatus:'pending'])` → liste pending rozeti gösterir ("Sertifika alınıyor"); `page.route('**/api/domains/*/ssl', GET → {status:'active',issuer:"Let's Encrypt",validTo:...})` ve error senaryosu için retry butonu görünür + tıklanınca recheck çağrılır. En az: pending rozet render + error→retry buton görünür. `npm run e2e` PASS.
- [ ] **Step 2: Tam suit** `npx tsc --noEmit && npm test && npm run e2e` → hepsi PASS. `git push` → CI yeşil.
- [ ] **Step 3: Deploy** `bash deploy.sh` (Caddy'ye dokunmaz).
- [ ] **Step 4: Canlı doğrulama** — sunucuda `/api/domains/<zolvix.app id>/ssl`'i (ya da node ile `checkDomainSslInfo('zolvix.app')`) çağır → `{status:'active', issuer: "Let's Encrypt..." , validTo: <gelecek tarih>}` dönmeli. panel/zolvix/ahmetberatkoc 200/307, caddy active.
- [ ] **Step 5: Ledger + (a) tamam.**

---

## Self-Review (yazar)
- **Kapsam:** issuer/expiry→T1, on-demand recheck→T2, polling+rozet+retry→T3, doğrulama→T4. Tümü kapsandı.
- **Caddy güvenliği:** hiç config yazımı yok — sadece TLS handshake + DB sslStatus. Risk düşük.
- **DB tipi sınırı:** `sslStatus` `'pending'|'active'` → 'error' DB'de 'pending' olarak tutulur; UI canlı `recheckSsl` info'sundan 'error' gösterir (rozet anlık). Polling de DB'den geldiği için error kalıcı görünmez — KABUL: error daha çok on-demand recheck'te anlık gösterilir; istenirse ileride DB'ye 'error' eklenir (şu an tip değişmez).
- **Tip tutarlılığı:** `SslInfo`/`checkDomainSslInfo`/`classifyCertInfo` T1; `recheckSsl` T2; DomainCard `onRecheck` T3.
- **Polling güvenliği:** sadece pending/error varken + document görünürken + üst sınırlı.
