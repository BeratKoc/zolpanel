# Next.js + TypeScript Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mevcut Express + React(Vite) + NeDB panelini, davranışı birebir koruyarak tek bir Next.js (App Router) + TypeScript uygulamasına taşımak ve Tier-1 güvenlik düzeltmelerini (Caddyfile injection→Zod, varsayılan şifre, JWT invalidation) bu esnada gömmek.

**Architecture:** Tek Next.js App Router uygulaması; API = route handlers (`app/api/**/route.ts`, Node.js runtime), sistem mantığı = `lib/server/*` (caddy/pm2/portManager/memoryTracker/db, framework-bağımsız saf TS). Arkaplan tracker `instrumentation.ts`'te boot'ta başlar. NeDB ve JWT-header auth korunur. Port 3999 sabit → Caddy değişmez.

**Tech Stack:** Next.js 15 (App Router), TypeScript, React 18, Zod, jsonwebtoken, bcryptjs, nedb, systeminformation, node:test.

**Kaynak referansı:** Mevcut kod `backend/` ve `frontend/` altında. Çoğu görev mevcut bir dosyayı yeni yola TS olarak taşır; "port et" dendiğinde mevcut dosyanın mantığı birebir korunur, yalnızca belirtilen değişiklikler uygulanır.

**Çalışma dizini:** Migration yeni bir kök dizinde toplanır: `app/`, `lib/`, `components/`, `instrumentation.ts` proje kökünde (`vps-panel-latest/`). Eski `backend/` ve `frontend/` cut-over'a (Task 20) kadar durur, sonra arşivlenir.

---

## Faz 0 — Scaffold

### Task 1: Next.js + TS iskeleti

**Files:**
- Create: `package.json` (kökte, eski ikisini birleştiren)
- Create: `tsconfig.json`, `next.config.ts`, `next-env.d.ts` (otomatik)
- Create: `app/layout.tsx`, `app/page.tsx` (geçici placeholder)
- Create: `.gitignore`

- [ ] **Step 1: Kök package.json oluştur**

```json
{
  "name": "zolpanel",
  "version": "3.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3999",
    "build": "next build",
    "start": "next start -p 3999",
    "test": "node --import tsx --test \"lib/**/*.test.ts\""
  },
  "dependencies": {
    "next": "^15.1.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "bcryptjs": "^2.4.3",
    "jsonwebtoken": "^9.0.2",
    "nedb": "^1.8.0",
    "systeminformation": "^5.22.7",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "@types/node": "^22.0.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@types/jsonwebtoken": "^9.0.0",
    "@types/bcryptjs": "^2.4.6",
    "@types/nedb": "^1.8.16"
  }
}
```

- [ ] **Step 2: tsconfig.json oluştur**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules", "backend", "frontend"]
}
```

- [ ] **Step 3: next.config.ts oluştur**

```ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // memoryTracker'ı instrumentation üzerinden başlatmak için
  experimental: { instrumentationHook: true }, // Next 15'te varsayılan açık; geriye dönük güvenlik
};

export default nextConfig;
```

- [ ] **Step 4: app/layout.tsx ve geçici app/page.tsx**

```tsx
// app/layout.tsx
export const metadata = { title: 'Zolpanel' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}
```

```tsx
// app/page.tsx (geçici — Task 17'de gerçek dashboard ile değişecek)
export default function Home() {
  return <div>Zolpanel scaffold OK</div>;
}
```

- [ ] **Step 5: .gitignore oluştur**

```
node_modules
.next
.env
*.bak
*.bak-*
db/data
backend/node_modules
frontend/node_modules
frontend/dist
```

- [ ] **Step 6: Kur ve build doğrula**

Run: `npm install && npm run build`
Expected: Next build başarılı, `.next/` oluşur, hata yok.

- [ ] **Step 7: Commit**

```bash
git add package.json tsconfig.json next.config.ts app/ .gitignore
git commit -m "chore: scaffold Next.js + TypeScript app"
```

---

## Faz 1 — lib/server portları (testlerle)

### Task 2: db.ts (NeDB + addLog + initAdmin rastgele şifre) — Güvenlik #2

**Files:**
- Create: `lib/server/db.ts`
- Reference: `backend/db/database.js`

- [ ] **Step 1: lib/server/db.ts yaz**

Mevcut `database.js` mantığı korunur; tipler eklenir; `initAdmin` artık sabit `admin123` yazmaz — rastgele şifre üretir, bir kez boot log'una basar; `tokenVersion: 0` alanı eklenir (Task 8 için).

```ts
import Datastore from 'nedb';
import path from 'path';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';

// Cut-over'da mevcut veriyi okumak için DB_DIR env ile dışarıdan verilebilir.
const dbPath = process.env.DB_DIR || path.join(process.cwd(), 'db', 'data');

export interface DomainRoute { path: string; port: number; type: 'http' | 'websocket'; }
export interface DomainDoc {
  _id?: string;
  domain: string;
  type: 'proxy' | 'static' | 'advanced';
  port: number | null;
  rootPath: string | null;
  routes: DomainRoute[] | null;
  aliases: string[];
  appType: string;
  notes: string;
  status: 'active' | 'offline';
  sslStatus: 'pending' | 'active';
  createdAt: string;
  updatedAt: string;
}
export interface UserDoc {
  _id?: string;
  username: string;
  password: string;
  tokenVersion: number;
  createdAt: string;
}
export interface LogDoc {
  _id?: string;
  domain: string;
  level: string;
  message: string;
  timestamp: string;
}

export const db = {
  domains: new Datastore<DomainDoc>({ filename: path.join(dbPath, 'domains.db'), autoload: true }),
  users: new Datastore<UserDoc>({ filename: path.join(dbPath, 'users.db'), autoload: true }),
  logs: new Datastore<LogDoc>({ filename: path.join(dbPath, 'logs.db'), autoload: true }),
};

db.domains.ensureIndex({ fieldName: 'domain', unique: true });
db.users.ensureIndex({ fieldName: 'username', unique: true });

export function addLog(domain: string | null, level: string, message: string): void {
  db.logs.insert({
    domain: domain || 'system',
    level: level || 'info',
    message,
    timestamp: new Date().toISOString(),
  } as LogDoc);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  db.logs.remove({ timestamp: { $lt: thirtyDaysAgo } }, { multi: true });
}

// İlk kurulumda admin oluştur — sabit şifre YOK, rastgele üret ve bir kez logla.
export async function initAdmin(): Promise<void> {
  return new Promise((resolve) => {
    db.users.findOne({ username: 'admin' }, async (_err, user) => {
      if (!user) {
        const generated = crypto.randomBytes(12).toString('base64url'); // ~16 karakter
        const hash = await bcrypt.hash(generated, 12);
        db.users.insert({
          username: 'admin',
          password: hash,
          tokenVersion: 0,
          createdAt: new Date().toISOString(),
        } as UserDoc);
        console.log('============================================================');
        console.log('  Zolpanel admin oluşturuldu.');
        console.log('  Kullanıcı: admin');
        console.log('  Şifre    : ' + generated);
        console.log('  >> Bu şifreyi kaydedin; ilk girişten sonra değiştirin.');
        console.log('============================================================');
      }
      resolve();
    });
  });
}
```

- [ ] **Step 2: Build/type kontrol**

Run: `npx tsc --noEmit`
Expected: `lib/server/db.ts` için tip hatası yok.

- [ ] **Step 3: Commit**

```bash
git add lib/server/db.ts
git commit -m "feat: port db layer to TS, random admin password (#2)"
```

---

### Task 3: caddy.ts + birim testler

**Files:**
- Create: `lib/server/caddy.ts`
- Create: `lib/server/caddy.test.ts`
- Reference: `backend/services/caddy.js` (token-match + PROTECTED + route dedup + brace-aware parse — HEPSİ KORUNUR)

- [ ] **Step 1: caddy.ts yaz**

`backend/services/caddy.js`'i birebir TS'e taşı. Değişiklikler: `import { addLog } from './db'`; fonksiyon imzalarına tip ekle; `buildDomainBlock(domainConfig: Partial<DomainDoc> & {domain:string})`; export'lar aynı (test için `removeDomainBlock`, `buildDomainBlock`, `parseCaddyfile` dahil). Mantık (PROTECTED_DOMAINS, headerTokens, removeDomainBlock token-match, buildDomainBlock route dedup, brace-aware parseCaddyfile) **değiştirilmeden** korunur.

- [ ] **Step 2: caddy.test.ts yaz (node:test) — mevcut scratchpad testini uyarla**

```ts
import { test } from 'node:test';
import assert from 'node:assert';
import { removeDomainBlock, buildDomainBlock, parseCaddyfile } from './caddy';
import fs from 'fs';
import os from 'os';
import path from 'path';

const REAL = `
zolvix.app, www.zolvix.app {
    handle /api/* { reverse_proxy localhost:8000 }
    handle /* {
        reverse_proxy localhost:3000 {
            transport http { read_timeout 0 write_timeout 0 }
        }
    }
    encode gzip
}

panel.zolvix.app {
    reverse_proxy 127.0.0.1:3999
    encode gzip
}

ahmetberatkoc.com, www.ahmetberatkoc.com {
    reverse_proxy localhost:3002
    encode gzip
}

mapper.ahmetberatkoc.com {
    reverse_proxy localhost:3001
}
`;

test('zolvix.app kaldırılınca panel.zolvix.app korunur (token-match)', () => {
  const out = removeDomainBlock(REAL, 'zolvix.app');
  assert.ok(!/^zolvix\.app,/m.test(out), 'zolvix.app gitmeli');
  assert.ok(/panel\.zolvix\.app\s*\{/.test(out), 'panel.zolvix.app korunmalı');
});

test('ahmetberatkoc.com kaldırılınca mapper korunur', () => {
  const out = removeDomainBlock(REAL, 'ahmetberatkoc.com');
  assert.ok(!/^ahmetberatkoc\.com,/m.test(out));
  assert.ok(/mapper\.ahmetberatkoc\.com\s*\{/.test(out));
});

test('advanced route dedup: tek handle /*', () => {
  const block = buildDomainBlock({
    domain: 'x.com', type: 'advanced',
    routes: [
      { path: '/api/*', port: 8000, type: 'http' },
      { path: '/*', port: 3000, type: 'websocket' },
      { path: '/*', port: 3000, type: 'http' },
    ],
  } as any);
  assert.strictEqual((block.match(/handle \/\* \{/g) || []).length, 1);
});

test('parseCaddyfile nested brace doğru parse eder', () => {
  const tmp = path.join(os.tmpdir(), 'caddytest-' + process.pid + '.txt');
  fs.writeFileSync(tmp, REAL);
  process.env.CADDYFILE_PATH = tmp;
  const parsed = parseCaddyfile();
  fs.unlinkSync(tmp);
  const names = parsed.map((d) => d.domain);
  assert.strictEqual(parsed.length, 4);
  assert.ok(names.includes('mapper.ahmetberatkoc.com'));
});
```

> Not: `node --test` TS'i doğrudan koşmaz. `package.json` test scriptini `node --import tsx --test "**/*.test.ts"` yap ve devDependency'e `tsx` ekle. (Task 1 package.json'a `"tsx": "^4.19.0"` devDep ve test scriptini güncelle.)

- [ ] **Step 3: Testi koş**

Run: `npm test`
Expected: 4 test PASS.

- [ ] **Step 4: Commit**

```bash
git add lib/server/caddy.ts lib/server/caddy.test.ts package.json
git commit -m "feat: port caddy service to TS with unit tests (#6)"
```

---

### Task 4: pm2.ts + assertSafeName testi

**Files:**
- Create: `lib/server/pm2.ts`, `lib/server/pm2.test.ts`
- Reference: `backend/services/pm2.js` (execFile + assertSafeName KORUNUR)

- [ ] **Step 1: pm2.ts yaz** — `backend/services/pm2.js`'i TS'e taşı (`import { addLog } from './db'`, tipler). `assertSafeName`'i de export et (test için).

- [ ] **Step 2: pm2.test.ts yaz**

```ts
import { test } from 'node:test';
import assert from 'node:assert';
import { assertSafeName } from './pm2';

test('kötü process isimleri reddedilir', () => {
  for (const bad of ['evil; rm -rf /', 'a$(whoami)', 'b`id`', 'c && reboot', '']) {
    assert.throws(() => assertSafeName(bad), /Geçersiz process adı/);
  }
});
test('geçerli isimler kabul edilir', () => {
  for (const ok of ['vps-panel', 'my_app.1', 'Portfolio']) {
    assert.doesNotThrow(() => assertSafeName(ok));
  }
});
```

- [ ] **Step 3: Koş** — Run: `npm test` → Expected: PASS.
- [ ] **Step 4: Commit** — `git add lib/server/pm2.ts lib/server/pm2.test.ts && git commit -m "feat: port pm2 service to TS with injection test"`

---

### Task 5: portManager.ts

**Files:** Create `lib/server/portManager.ts`. Reference `backend/services/portManager.js`.

- [ ] **Step 1:** `portManager.js`'i TS'e taşı (mantık birebir; `findNextAvailablePort(reserved: number[]): Promise<number>`, `getUsedPorts`, `isPortInUse`).
- [ ] **Step 2:** Run: `npx tsc --noEmit` → tip hatası yok.
- [ ] **Step 3:** Commit — `git add lib/server/portManager.ts && git commit -m "feat: port portManager to TS"`

---

### Task 6: memoryTracker.ts

**Files:** Create `lib/server/memoryTracker.ts`. Reference `backend/services/memoryTracker.js`.

- [ ] **Step 1:** `memoryTracker.js`'i TS'e taşı. `startTracker()`'a dev-HMR çift başlatma koruması ekle:

```ts
declare global { var __zolpanelTracker: boolean | undefined; }

export function startTracker(): void {
  if (globalThis.__zolpanelTracker) return;
  globalThis.__zolpanelTracker = true;
  // ...mevcut setInterval(30sn) mantığı...
}
```

- [ ] **Step 2:** Run: `npx tsc --noEmit` → hata yok.
- [ ] **Step 3:** Commit — `git add lib/server/memoryTracker.ts && git commit -m "feat: port memoryTracker to TS with HMR guard"`

---

### Task 7: validation.ts (Zod) — Güvenlik #1

**Files:** Create `lib/validation.ts`, `lib/validation.test.ts`.

- [ ] **Step 1: lib/validation.ts yaz**

```ts
import { z } from 'zod';

const hostname = z.string().regex(/^[a-z0-9.-]+$/i, 'Geçersiz domain (sadece harf, rakam, nokta, tire)').max(253);
const port = z.coerce.number().int().min(1).max(65535);
const routePath = z.string().regex(/^\/[A-Za-z0-9._*/-]*$/, 'Geçersiz path').max(200);
const safeAbsPath = z.string().regex(/^\/[A-Za-z0-9._/-]+$/, 'Geçersiz yol').max(512);

export const routeSchema = z.object({
  path: routePath,
  port,
  type: z.enum(['http', 'websocket']),
});

export const createDomainSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('proxy'),
    domain: hostname,
    aliases: z.array(hostname).default([]),
    port: port.optional(),
    appType: z.string().max(40).optional(),
    notes: z.string().max(2000).optional(),
  }),
  z.object({
    type: z.literal('static'),
    domain: hostname,
    aliases: z.array(hostname).default([]),
    rootPath: safeAbsPath.optional(),
    appType: z.string().max(40).optional(),
    notes: z.string().max(2000).optional(),
  }),
  z.object({
    type: z.literal('advanced'),
    domain: hostname,
    aliases: z.array(hostname).default([]),
    routes: z.array(routeSchema).min(1),
    appType: z.string().max(40).optional(),
    notes: z.string().max(2000).optional(),
  }),
]);

export const updateDomainSchema = z.object({
  notes: z.string().max(2000).optional(),
  aliases: z.array(hostname).optional(),
  status: z.enum(['active', 'offline']).optional(),
  appType: z.string().max(40).optional(),
});

export const processNameSchema = z.string().regex(/^[A-Za-z0-9._-]{1,100}$/);
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(12).regex(/[A-Z]/, 'En az bir büyük harf').regex(/[0-9]/, 'En az bir rakam'),
});
export const loginSchema = z.object({ username: z.string().min(1).max(100), password: z.string().min(1) });
```

- [ ] **Step 2: lib/validation.test.ts yaz**

```ts
import { test } from 'node:test';
import assert from 'node:assert';
import { createDomainSchema } from './validation';

test('Caddyfile injection denemesi reddedilir', () => {
  const r = createDomainSchema.safeParse({
    type: 'proxy', domain: 'evil.com\n}\nhacked.com {', port: 3000,
  });
  assert.strictEqual(r.success, false);
});
test('port sayı olmalı', () => {
  const r = createDomainSchema.safeParse({ type: 'proxy', domain: 'ok.com', port: 'abc' });
  assert.strictEqual(r.success, false);
});
test('geçerli proxy domain kabul edilir', () => {
  const r = createDomainSchema.safeParse({ type: 'proxy', domain: 'app.ornek.com', port: 3000 });
  assert.strictEqual(r.success, true);
});
```

- [ ] **Step 3: Koş** — Run: `npm test` → Expected: PASS.
- [ ] **Step 4: Commit** — `git add lib/validation.ts lib/validation.test.ts && git commit -m "feat: Zod validation schemas, blocks Caddyfile injection (#1)"`

---

### Task 8: auth.ts (JWT + requireAuth + tokenVersion) — Güvenlik #3

**Files:** Create `lib/auth.ts`. Reference `backend/routes/auth.js` (JWT mantığı).

- [ ] **Step 1: lib/auth.ts yaz**

```ts
import jwt from 'jsonwebtoken';
import { db, UserDoc } from './server/db';

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES = process.env.JWT_EXPIRES || '8h';
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET tanımlı değil! .env kontrol edin.');
}

export interface TokenPayload { id: string; username: string; tv: number; }

export function signToken(user: UserDoc): string {
  return jwt.sign(
    { id: user._id, username: user.username, tv: user.tokenVersion ?? 0 },
    JWT_SECRET as string,
    { expiresIn: JWT_EXPIRES },
  );
}

function getUser(username: string): Promise<UserDoc | null> {
  return new Promise((resolve) => db.users.findOne({ username }, (_e, u) => resolve(u || null)));
}

// Route handler'larda kullanılır. Başarılıysa payload döner, değilse null.
export async function requireAuth(req: Request): Promise<TokenPayload | null> {
  const header = req.headers.get('authorization');
  const token = header && header.split(' ')[1];
  if (!token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET as string) as TokenPayload;
    const user = await getUser(payload.username);
    if (!user || (user.tokenVersion ?? 0) !== payload.tv) return null; // şifre değişti → eski token geçersiz
    return payload;
  } catch {
    return null;
  }
}

export function unauthorized(message = 'Yetkisiz') {
  return Response.json({ error: message }, { status: 401 });
}
```

- [ ] **Step 2:** Run: `npx tsc --noEmit` (test ortamında JWT_SECRET set ederek). Expected: tip hatası yok.
- [ ] **Step 3: Commit** — `git add lib/auth.ts && git commit -m "feat: auth helper with tokenVersion invalidation (#3)"`

---

## Faz 2 — API route handlers

### Task 9: instrumentation.ts (boot)

**Files:** Create `instrumentation.ts` (kökte).

- [ ] **Step 1:**

```ts
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { initAdmin } = await import('./lib/server/db');
    const { startTracker } = await import('./lib/server/memoryTracker');
    await initAdmin();
    startTracker();
    console.log('🚀 Zolpanel başladı — http://127.0.0.1:3999');
  }
}
```

- [ ] **Step 2:** Run: `npm run build` → build başarılı.
- [ ] **Step 3:** Commit — `git add instrumentation.ts && git commit -m "feat: boot initAdmin + memoryTracker via instrumentation"`

---

### Task 10: auth route handlers + rate limit

**Files:** Create `lib/server/rateLimit.ts`, `app/api/auth/login/route.ts`, `app/api/auth/verify/route.ts`, `app/api/auth/change-password/route.ts`.

- [ ] **Step 1: lib/server/rateLimit.ts (framework-bağımsız, in-memory)**

```ts
const hits = new Map<string, { count: number; reset: number }>();
export function rateLimit(key: string, max = 5, windowMs = 15 * 60 * 1000): boolean {
  const now = Date.now();
  const rec = hits.get(key);
  if (!rec || now > rec.reset) { hits.set(key, { count: 1, reset: now + windowMs }); return true; }
  rec.count += 1;
  return rec.count <= max;
}
export function resetLimit(key: string) { hits.delete(key); }
```

- [ ] **Step 2: app/api/auth/login/route.ts**

```ts
import bcrypt from 'bcryptjs';
import { db } from '@/lib/server/db';
import { addLog } from '@/lib/server/db';
import { signToken } from '@/lib/auth';
import { loginSchema } from '@/lib/validation';
import { rateLimit, resetLimit } from '@/lib/server/rateLimit';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (!rateLimit('login:' + ip)) {
    addLog('system', 'warn', `Brute force engellendi: ${ip}`);
    return Response.json({ error: 'Çok fazla deneme. 15 dakika sonra tekrar deneyin.' }, { status: 429 });
  }
  const body = await req.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: 'Kullanıcı adı ve şifre gerekli' }, { status: 400 });
  const { username, password } = parsed.data;

  const user = await new Promise<any>((res) => db.users.findOne({ username }, (_e, u) => res(u)));
  if (!user || !(await bcrypt.compare(password, user.password))) {
    addLog('system', 'warn', `Başarısız giriş: "${username}" - IP: ${ip}`);
    return Response.json({ error: 'Geçersiz kullanıcı adı veya şifre' }, { status: 401 });
  }
  resetLimit('login:' + ip);
  addLog('system', 'info', `Başarılı giriş: "${username}" - IP: ${ip}`);
  return Response.json({ token: signToken(user), username: user.username });
}
```

- [ ] **Step 3: app/api/auth/verify/route.ts**

```ts
import { requireAuth, unauthorized } from '@/lib/auth';
export const runtime = 'nodejs';
export async function GET(req: Request) {
  const user = await requireAuth(req);
  if (!user) return unauthorized('Geçersiz veya süresi dolmuş token');
  return Response.json({ valid: true, username: user.username });
}
```

- [ ] **Step 4: app/api/auth/change-password/route.ts** (tokenVersion artırır → eski tokenlar düşer)

```ts
import bcrypt from 'bcryptjs';
import { db, addLog } from '@/lib/server/db';
import { requireAuth, unauthorized } from '@/lib/auth';
import { changePasswordSchema } from '@/lib/validation';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (!auth) return unauthorized();
  const parsed = changePasswordSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const { currentPassword, newPassword } = parsed.data;

  const user = await new Promise<any>((res) => db.users.findOne({ username: auth.username }, (_e, u) => res(u)));
  if (!user) return Response.json({ error: 'Kullanıcı bulunamadı' }, { status: 404 });
  if (!(await bcrypt.compare(currentPassword, user.password))) {
    return Response.json({ error: 'Mevcut şifre yanlış' }, { status: 401 });
  }
  const hash = await bcrypt.hash(newPassword, 12);
  await new Promise<void>((res) =>
    db.users.update({ _id: user._id }, { $set: { password: hash, tokenVersion: (user.tokenVersion ?? 0) + 1 } }, {}, () => res()),
  );
  addLog('system', 'info', `Şifre değiştirildi: "${user.username}"`);
  return Response.json({ message: 'Şifre güncellendi. Lütfen tekrar giriş yapın.' });
}
```

- [ ] **Step 5: Manuel doğrula** — `npm run dev`, curl ile: login (yanlış şifre 5x → 429), doğru giriş → token; verify (token) → 200; change-password sonrası eski token verify → 401.
- [ ] **Step 6: Commit** — `git add lib/server/rateLimit.ts app/api/auth && git commit -m "feat: auth route handlers + rate limit + jwt invalidation"`

---

### Task 11: domains route handlers (Zod ile) — race condition düzeltmesi dahil

**Files:** Create `app/api/domains/route.ts`, `app/api/domains/[id]/route.ts`, `app/api/domains/utils/next-port/route.ts`. Reference `backend/routes/domains.js`.

- [ ] **Step 1: Promise yardımcıları + GET liste / POST ekle (`app/api/domains/route.ts`)**

`domains.js` mantığını async/await + Zod ile yeniden yaz. Port atama + insert'i **serileştirerek** race condition'ı azalt (basit modül-seviyesi mutex):

```ts
import { db, addLog, DomainDoc } from '@/lib/server/db';
import { requireAuth, unauthorized } from '@/lib/auth';
import { createDomainSchema } from '@/lib/validation';
import { addDomainToConfig, isCaddyRunning } from '@/lib/server/caddy';
import { findNextAvailablePort } from '@/lib/server/portManager';

export const runtime = 'nodejs';

const find = <T>(store: Nedb<T>, q: any): Promise<T[]> =>
  new Promise((res, rej) => store.find(q).sort({ createdAt: -1 }).exec((e, d) => (e ? rej(e) : res(d))));
const findOne = <T>(store: Nedb<T>, q: any): Promise<T | null> =>
  new Promise((res) => store.findOne(q, (_e, d) => res(d || null)));
const insert = <T>(store: Nedb<T>, doc: T): Promise<T> =>
  new Promise((res, rej) => store.insert(doc, (e, d) => (e ? rej(e) : res(d))));

export async function GET(req: Request) {
  if (!(await requireAuth(req))) return unauthorized();
  return Response.json(await find(db.domains, {}));
}

let creating: Promise<unknown> = Promise.resolve(); // basit serileştirme (tek-admin yeterli)

export async function POST(req: Request) {
  if (!(await requireAuth(req))) return unauthorized();
  const parsed = createDomainSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const input = parsed.data;

  const run = creating.then(async () => {
    if (await findOne(db.domains, { domain: input.domain })) {
      return { status: 409, body: { error: 'Bu domain zaten mevcut' } };
    }
    let assignedPort: number | null = null;
    if (input.type === 'proxy') {
      assignedPort = input.port ?? null;
      if (!assignedPort) {
        const proxies = await find<DomainDoc>(db.domains, { type: 'proxy' });
        assignedPort = await findNextAvailablePort(proxies.map((p) => p.port).filter(Boolean) as number[]);
      } else if (await findOne(db.domains, { port: assignedPort })) {
        return { status: 409, body: { error: `Port ${assignedPort} zaten kullanımda` } };
      }
    }
    const now = new Date().toISOString();
    const doc: DomainDoc = {
      domain: input.domain, type: input.type,
      port: input.type === 'proxy' ? assignedPort : null,
      rootPath: input.type === 'static' ? (input.rootPath || `/var/www/${input.domain}`) : null,
      routes: input.type === 'advanced' ? input.routes : null,
      aliases: input.aliases, appType: input.appType || 'other', notes: input.notes || '',
      status: 'active', sslStatus: 'pending', createdAt: now, updatedAt: now,
    };
    const saved = await insert(db.domains, doc);
    try {
      if (await isCaddyRunning()) {
        await addDomainToConfig(doc);
        setTimeout(() => db.domains.update({ _id: saved._id }, { $set: { sslStatus: 'active' } }, {}), 10000);
      } else addLog(input.domain, 'warn', 'Caddy çalışmıyor');
    } catch (e: any) {
      addLog(input.domain, 'error', 'Caddy config hatası: ' + e.message);
    }
    addLog(input.domain, 'info', `Domain oluşturuldu (${input.type})`);
    return { status: 201, body: saved };
  });
  creating = run.catch(() => {});
  const r = await run;
  return Response.json(r.body, { status: r.status });
}
```

> Not: `Nedb<T>` tipi için dosya başına `import type Nedb from 'nedb';` ekle.
> Not: SSL `setTimeout` davranışı bilinçli olarak KORUNUR (gerçek SSL durumu ayrı task #4).

- [ ] **Step 2: `[id]/route.ts` — GET tek / PUT (status→Caddy) / DELETE**

`domains.js`'in PUT (status değişince addDomainToConfig/removeDomainFromConfig) ve DELETE mantığını async/await + `updateDomainSchema` ile taşı. PROTECTED kontrolü zaten `caddy.ts`'te.

- [ ] **Step 3: `utils/next-port/route.ts`** — `findNextAvailablePort` ile boş port döndür (auth'lu).

- [ ] **Step 4: Manuel doğrula** — dev'de: domain ekle (proxy/static/advanced), durdur/başlat, sil; injection payload (domain içinde `}`) → 400.
- [ ] **Step 5: Commit** — `git add app/api/domains && git commit -m "feat: domains route handlers w/ Zod, serialized port alloc"`

---

### Task 12: processes route handlers

**Files:** Create `app/api/processes/route.ts`, `app/api/processes/[name]/stop|restart|delete|logs/route.ts`. Reference `backend/routes/processes.js`.

- [ ] **Step 1:** Mevcut route mantığını taşı; `name` paramını `processNameSchema` ile doğrula; `lib/server/pm2.ts` fonksiyonlarını çağır; her handler `requireAuth`.
- [ ] **Step 2: Manuel doğrula** — dev'de process listesi gelir; geçersiz isim → 400.
- [ ] **Step 3: Commit** — `git add app/api/processes && git commit -m "feat: processes route handlers"`

---

### Task 13: system route handlers

**Files:** Create `app/api/system/metrics|stats|logs|caddy/config|caddy/reload/route.ts` ve `app/api/health/route.ts`. Reference `backend/routes/system.js`.

- [ ] **Step 1:** Taşı (`systeminformation` metrics, logs GET/DELETE, stats, caddy config/reload); hepsi `requireAuth`. Ayrıca `app/api/health/route.ts` (auth'suz): `Response.json({ status: 'ok', app: 'Zolpanel', timestamp: new Date().toISOString() })` — cut-over doğrulaması bunu kullanır.
- [ ] **Step 2: Manuel doğrula** — `/api/system/metrics` token ile 200 + cpu/mem/disk döner.
- [ ] **Step 3: Commit** — `git add app/api/system && git commit -m "feat: system route handlers"`

---

## Faz 3 — Frontend (App Router sayfaları)

### Task 14: layout + global css + ui bileşenleri

**Files:** Modify `app/layout.tsx`; Create `app/globals.css` (eski `frontend/src/index.css`); Create `components/ui.tsx` (eski `frontend/src/components/ui.jsx`).

- [ ] **Step 1:** `index.css`'i `app/globals.css`'e taşı; `layout.tsx`'te `import './globals.css'`.
- [ ] **Step 2:** `ui.jsx` → `components/ui.tsx`: en üste `'use client'`; export'lara prop tipleri ekle (`Btn`, `Badge`, `StatusDot`, `Modal`, `FormField`, `Spinner`, `EmptyState`, `useToast`). Mantık birebir.
- [ ] **Step 3:** Run: `npx tsc --noEmit` → hata yok.
- [ ] **Step 4: Commit** — `git add app/layout.tsx app/globals.css components/ui.tsx && git commit -m "feat: port layout + ui components to TSX"`

---

### Task 15: api-client.ts (+401 auto-logout) — #7

**Files:** Create `lib/api-client.ts`. Reference `frontend/src/api.js`.

- [ ] **Step 1:** `api.js` mantığını taşı; `request()`'e 401'de otomatik logout ekle:

```ts
'use client';
const BASE = '/api';
function getToken() { return typeof window !== 'undefined' ? localStorage.getItem('token') : null; }

async function request(method: string, path: string, body?: unknown) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (res.status === 401) {
    localStorage.removeItem('token');
    if (typeof window !== 'undefined') window.location.href = '/login';
    throw new Error('Oturum sona erdi');
  }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'İstek başarısız');
  return data;
}

export const api = {
  login: (u: string, p: string) => request('POST', '/auth/login', { username: u, password: p }),
  verify: () => request('GET', '/auth/verify'),
  changePassword: (c: string, n: string) => request('POST', '/auth/change-password', { currentPassword: c, newPassword: n }),
  getDomains: () => request('GET', '/domains'),
  createDomain: (d: unknown) => request('POST', '/domains', d),
  updateDomain: (id: string, d: unknown) => request('PUT', `/domains/${id}`, d),
  deleteDomain: (id: string) => request('DELETE', `/domains/${id}`),
  getNextPort: () => request('GET', '/domains/utils/next-port'),
  getProcesses: () => request('GET', '/processes'),
  startProcess: (d: unknown) => request('POST', '/processes/start', d),
  stopProcess: (n: string) => request('POST', `/processes/${n}/stop`),
  restartProcess: (n: string) => request('POST', `/processes/${n}/restart`),
  deleteProcess: (n: string) => request('DELETE', `/processes/${n}`),
  getProcessLogs: (n: string, l?: number) => request('GET', `/processes/${n}/logs?lines=${l || 100}`),
  getMetrics: () => request('GET', '/system/metrics'),
  getStats: () => request('GET', '/system/stats'),
  getLogs: (p: Record<string, string> = {}) => request('GET', `/system/logs${Object.keys(p).length ? '?' + new URLSearchParams(p) : ''}`),
  clearLogs: (d?: string) => request('DELETE', `/system/logs${d ? '?domain=' + d : ''}`),
  reloadCaddy: () => request('POST', '/system/caddy/reload'),
  getCaddyConfig: () => request('GET', '/system/caddy/config'),
};
```

- [ ] **Step 2:** Run: `npx tsc --noEmit` → hata yok.
- [ ] **Step 3: Commit** — `git add lib/api-client.ts && git commit -m "feat: api client w/ 401 auto-logout (#7)"`

---

### Task 16: login sayfası + auth gate

**Files:** Create `app/login/page.tsx`; Create `components/AuthGate.tsx`. Reference `frontend/src/pages/Login.jsx`, `frontend/src/App.jsx`.

- [ ] **Step 1:** `Login.jsx` → `app/login/page.tsx` (`'use client'`, tipler, `api.login` sonrası token kaydet → `/`).
- [ ] **Step 2:** `AuthGate.tsx` (`'use client'`): mount'ta `api.verify()`; başarısızsa `/login`'e yönlendir; başarılıysa children. Panel sayfaları bununla sarılır.
- [ ] **Step 3:** Manuel doğrula — `/login` çalışır, yanlış şifre hata gösterir.
- [ ] **Step 4: Commit** — `git add app/login components/AuthGate.tsx && git commit -m "feat: login page + auth gate"`

---

### Task 17: panel sayfaları + navigasyon

**Files:** Create `app/(panel)/layout.tsx` (nav + AuthGate), `app/(panel)/dashboard/page.tsx` (veya `app/page.tsx`'i değiştir), `domains/page.tsx`, `processes/page.tsx`, `logs/page.tsx`, `settings/page.tsx`. Reference `frontend/src/pages/*.jsx` + `App.jsx` (nav).

- [ ] **Step 1:** `(panel)/layout.tsx`: `App.jsx`'teki sidebar/nav'ı App Router'a taşı — `NAV_ITEMS` `next/link` ile gerçek route'lara; `usePathname` ile aktif; logout butonu; `<AuthGate>` ile sar. `'use client'`.
- [ ] **Step 2:** Her sayfayı port et (`Dashboard/Domains/Processes/Logs/Settings.jsx` → ilgili `page.tsx`): en üste `'use client'`, `import { api } from '@/lib/api-client'`, `import {...} from '@/components/ui'`, state'lere tip. **Advanced domain UI (route editörü) zaten `Domains.jsx`'te mevcut — birebir taşınır.** Mantık değişmez.
- [ ] **Step 3:** `app/page.tsx`'i dashboard'a yönlendir (`redirect('/dashboard')`) veya dashboard'u köke koy.
- [ ] **Step 4: Manuel doğrula** — dev'de tüm sayfalar açılır, nav çalışır, geri tuşu çalışır, veri gelir.
- [ ] **Step 5: Commit** — `git add app && git commit -m "feat: port all panel pages to App Router with real routing"`

---

## Faz 4 — Deploy & Cut-over

### Task 18: ecosystem + deploy.sh güncelle

**Files:** Create `ecosystem.config.cjs`; Modify `deploy.sh`.

- [ ] **Step 1: ecosystem.config.cjs**

```js
const fs = require('fs');
const ENV_PATH = '/opt/zolpanel/.env';
const env = {};
if (fs.existsSync(ENV_PATH)) {
  fs.readFileSync(ENV_PATH, 'utf8').split('\n').map(l => l.trim())
    .filter(l => l && !l.startsWith('#')).forEach(l => { const [k, ...v] = l.split('='); if (k) env[k.trim()] = v.join('=').trim(); });
}
module.exports = { apps: [{ name: 'zolpanel', script: 'node_modules/next/dist/bin/next', args: 'start -p 3999', cwd: '/opt/zolpanel', env }] };
```

> Cut-over hedef dizini: `/opt/zolpanel` (yeni). Eski `/opt/vps-panel` dokunulmadan durur (geri dönüş).

- [ ] **Step 2: deploy.sh güncelle** — yeni app dizinini gönder (`.next`, `node_modules`, `.env`, `db/data` hariç), sunucuda `npm install` + `npm run build` + pm2 restart `zolpanel`; sonunda health + caddy validate. DEST=`/opt/zolpanel`, pm2 adı `zolpanel`.
- [ ] **Step 3: Commit** — `git add ecosystem.config.cjs deploy.sh && git commit -m "chore: pm2 + deploy.sh for Next app"`

---

### Task 19: local build + davranış paritesi doğrulama

- [ ] **Step 1:** Run: `npm run build && npm test` → build başarılı, tüm birim testler PASS.
- [ ] **Step 2:** `npm run start` (prod modu lokal) → şu kontrol listesini doğrula:
  - [ ] login (yanlış 5x → 429), doğru giriş → token
  - [ ] dashboard metrics/stats gelir
  - [ ] domain ekle (proxy/static/advanced), durdur/başlat, sil — Caddyfile beklenen şekilde değişir (lokalde CADDYFILE_PATH'i geçici dosyaya yönlendir)
  - [ ] injection payload (domain/port'ta) → 400
  - [ ] processes listesi, log görüntüleme
  - [ ] şifre değiştir → eski token 401
  - [ ] 401'de otomatik /login
- [ ] **Step 3:** Sorun yoksa devam; varsa düzelt + commit.

---

### Task 20: Sunucu cut-over

- [ ] **Step 1: Yedek** — `ssh root@191.44.68.81 "cp -r /opt/vps-panel /opt/vps-panel.pre-next-$(date +%s)"` ve `tar` ile `db/data` yedeği.
- [ ] **Step 2: Deploy** — `bash deploy.sh all` (DEST=/opt/zolpanel). Sunucuda `.env`'i `/opt/zolpanel/.env`'e kopyala (eski `/opt/vps-panel/backend/.env`'den), `DB_DIR=/opt/zolpanel/db/data` ayarla.
- [ ] **Step 3: Veri taşı** — eski `/opt/vps-panel/backend/db/data/*.db` → `/opt/zolpanel/db/data/`. (users.db'ye `tokenVersion` alanı yoksa requireAuth `?? 0` ile uyumlu.)
- [ ] **Step 4: pm2 geçiş** — yeni `zolpanel` process'i başlat (eski `vps-panel`'i durdur). `pm2 save`.
- [ ] **Step 5: Doğrula** — `curl 127.0.0.1:3999/api/health`... (Next'te health route eklenir, Task 13'e dahil), `panel.zolvix.app` → 200, login çalışır, `zolvix.app` etkilenmedi, `caddy validate` Valid.
- [ ] **Step 6: Rollback planı** — sorun olursa pm2 `vps-panel`'i geri başlat (eski kod + .env duruyor).
- [ ] **Step 7: Commit/temizlik** — başarılıysa eski `backend/`+`frontend/` repo'dan arşiv klasörüne taşı; `git commit -m "chore: complete Next.js migration cutover"`.

---

## Self-Review Notları (yazar kontrolü)

- **Spec kapsamı:** §3 yapı→Task1-17; §4 eşleme→ilgili tasklar; §5 auth→Task8,10; §6 tracker→Task6,9; §7 güvenlik→#1 Task7/11, #2 Task2, #3 Task8/10; §8 deploy→Task18,20; §9 fazlar→Faz0-4; §10 test→Task3,4,7,19. Tümü kapsandı.
- **Health endpoint:** Task 13'e `app/api/health/route.ts` eklenecek (cut-over doğrulaması buna dayanıyor).
- **tsx devDep:** Task 1 package.json'a `tsx` eklenmeli (Task 3 notu). 
- **Tip tutarlılığı:** `DomainDoc`, `UserDoc`, `TokenPayload`, `requireAuth(req): Promise<TokenPayload|null>`, `signToken(user)`, `assertSafeName` — tüm tasklarda aynı imzalarla kullanıldı.
