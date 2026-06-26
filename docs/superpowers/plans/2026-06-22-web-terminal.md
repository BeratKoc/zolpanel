# Web Terminal (Tarayıcı PTY) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Panelden sunucuya/container'a gerçek interaktif terminal (node-pty + xterm.js), HTTP streaming üzerinden, kaynak-güvenli (max-session + idle-timeout + cleanup).

**Architecture:** Saf, test-edilebilir bir session yöneticisi (DI ile sahte spawner) çekirdek; node-pty spawner ve Next API route'ları (POST create / GET stream / POST input / POST resize / DELETE) onu sarar; çıkış HTTP `ReadableStream`, giriş POST (WebSocket yok → `next start`'a oturur). Frontend xterm.js.

**Tech Stack:** Next.js 15 route handlers (nodejs runtime), node-pty (native), @xterm/xterm + @xterm/addon-fit, TypeScript, node:test, next-intl (6 dil), Playwright.

## Global Constraints
- `next start` (custom server yok) → native WebSocket YOK; çıkış `ReadableStream`, giriş POST.
- Hepsi `requireAuth` (Bearer token; `TokenPayload.id` = sahiplik anahtarı). Session-sahipliği zorunlu. Session açılışında **audit log** (`console.log('[audit] terminal ...')` → pm2 loglarında).
- **Kaynak güvenliği (bu oturumdaki sızıntı dersi):** max eşzamanlı session = **5** (aşılırsa 429), idle-timeout = **10 dk**, stream kapanınca/disconnect'te pty **öldür + Map'ten sil**.
- node-pty `spawn(file, argsArray, opts)` — argümanlar **dizi** (shell yok). Container hedefi `assertSafeContainerRef` + `listContainers` ile doğrulanır.
- Session yöneticisi node-pty'ye bağımlı OLMAYACAK (DI spawner) → `npm test` Windows/CI'da native modül olmadan geçer.
- Commit yazarı `BeratKoc <ahmetberatkoc0@gmail.com>`; **Co-Authored-By YOK**.
- Test: `npm test` (= `node --import tsx --test "lib/**/*.test.ts"`). Build: `npm run build` (Windows EPERM → `rm -rf .next`). `npx tsc --noEmit` temiz.
- **DEPLOY BEKLEMEDE:** SSH erişimi kapalı (iptables olayı). T4 build+test+push+CI-yeşil yapar; **deploy + canlı doğrulama SSH geri gelince** (node-pty native derlemesi kontrollü izlenerek).
- Mevcut: `requireAuth(req): Promise<TokenPayload|null>` (`{id,username,tv}`), `unauthorized()` (`@/lib/auth`); `listContainers()` + `assertSafeContainerRef(ref)` (`@/lib/server/docker`); nav `app/(panel)/layout.tsx` (`NAV_ITEMS` + lucide ikon).

## Dosya yapısı
- `lib/server/terminal/session.ts` — `PtyLike`, `TermSession`, `TerminalManager` (saf, DI). 
- `lib/server/terminal/session.test.ts` — unit testler (sahte spawner).
- `lib/server/terminal/pty.ts` — node-pty spawner (host/container) + doğrulama + singleton manager + idle-reaper.
- `app/api/terminal/route.ts` (POST), `app/api/terminal/[id]/stream/route.ts` (GET), `.../[id]/input/route.ts` (POST), `.../[id]/resize/route.ts` (POST), `app/api/terminal/[id]/route.ts` (DELETE).
- `components/terminal/Terminal.tsx` + `app/(panel)/terminal/page.tsx`.
- `app/(panel)/layout.tsx` — nav'a Terminal.
- `lib/api-client.ts` — `terminalCreate/terminalInput/terminalResize/terminalDelete`.
- `messages/{tr,en,zh,es,de,fr}.json` — terminal anahtarları.
- `package.json` — node-pty, @xterm/xterm, @xterm/addon-fit.

---

### Task 1: Session yöneticisi (saf, DI spawner) + unit testler

**Files:**
- Create: `lib/server/terminal/session.ts`
- Create: `lib/server/terminal/session.test.ts`

**Interfaces:**
- Produces: `interface PtyLike { onData(cb:(d:string)=>void):void; onExit(cb:()=>void):void; write(d:string):void; resize(c:number,r:number):void; kill():void }`; `type SpawnFn = () => PtyLike`; `interface TermSession { id:string; userId:string; target:string; pty:PtyLike; lastActivity:number }`; `class TerminalManager` with `count()`, `create(userId,target,spawn,now):TermSession` (throws `TerminalLimitError` at cap), `get(id,userId):TermSession|null`, `touch(id,now)`, `kill(id)`, `reapIdle(now,idleMs?):string[]`; consts `MAX_SESSIONS=5`, `IDLE_MS=600000`; `class TerminalLimitError extends Error`.

- [ ] **Step 1: `lib/server/terminal/session.ts` yaz:**

```ts
export interface PtyLike {
  onData(cb: (data: string) => void): void;
  onExit(cb: () => void): void;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(): void;
}

export type SpawnFn = () => PtyLike;

export interface TermSession {
  id: string;
  userId: string;
  target: string;
  pty: PtyLike;
  lastActivity: number;
}

export const MAX_SESSIONS = 5;
export const IDLE_MS = 10 * 60 * 1000;

export class TerminalLimitError extends Error {
  constructor() { super('Çok fazla aktif terminal oturumu (maks ' + MAX_SESSIONS + ')'); this.name = 'TerminalLimitError'; }
}

export class TerminalManager {
  private sessions = new Map<string, TermSession>();
  constructor(private genId: () => string) {}

  count(): number { return this.sessions.size; }

  create(userId: string, target: string, spawn: SpawnFn, now: number): TermSession {
    if (this.sessions.size >= MAX_SESSIONS) throw new TerminalLimitError();
    const pty = spawn();
    const id = this.genId();
    const s: TermSession = { id, userId, target, pty, lastActivity: now };
    this.sessions.set(id, s);
    return s;
  }

  get(id: string, userId: string): TermSession | null {
    const s = this.sessions.get(id);
    if (!s || s.userId !== userId) return null;
    return s;
  }

  touch(id: string, now: number): void {
    const s = this.sessions.get(id);
    if (s) s.lastActivity = now;
  }

  kill(id: string): void {
    const s = this.sessions.get(id);
    if (!s) return;
    try { s.pty.kill(); } catch { /* zaten ölmüş olabilir */ }
    this.sessions.delete(id);
  }

  reapIdle(now: number, idleMs: number = IDLE_MS): string[] {
    const killed: string[] = [];
    for (const [id, s] of this.sessions) {
      if (now - s.lastActivity > idleMs) { this.kill(id); killed.push(id); }
    }
    return killed;
  }
}
```

- [ ] **Step 2: Failing test** — `lib/server/terminal/session.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert';
import { TerminalManager, TerminalLimitError, MAX_SESSIONS, type PtyLike } from './session';

function fakePty(): PtyLike & { written: string[]; resized: [number, number][]; killed: boolean } {
  return {
    written: [], resized: [], killed: false,
    onData() {}, onExit() {},
    write(d) { this.written.push(d); },
    resize(c, r) { this.resized.push([c, r]); },
    kill() { this.killed = true; },
  };
}

function mgr() {
  let n = 0;
  return new TerminalManager(() => `id${++n}`);
}

test('create + get (sahiplik)', () => {
  const m = mgr();
  const p = fakePty();
  const s = m.create('u1', 'host', () => p, 1000);
  assert.strictEqual(s.id, 'id1');
  assert.strictEqual(m.get('id1', 'u1')?.id, 'id1');
  assert.strictEqual(m.get('id1', 'u2'), null); // başkasının oturumu
  assert.strictEqual(m.get('yok', 'u1'), null);
});

test('max session cap → TerminalLimitError', () => {
  const m = mgr();
  for (let i = 0; i < MAX_SESSIONS; i++) m.create('u1', 'host', fakePty, 0);
  assert.throws(() => m.create('u1', 'host', fakePty, 0), TerminalLimitError);
  assert.strictEqual(m.count(), MAX_SESSIONS);
});

test('write/resize doğru pty\'ye gider; touch lastActivity günceller', () => {
  const m = mgr();
  const p = fakePty();
  const s = m.create('u1', 'host', () => p, 1000);
  s.pty.write('ls\n'); s.pty.resize(120, 40);
  assert.deepStrictEqual(p.written, ['ls\n']);
  assert.deepStrictEqual(p.resized, [[120, 40]]);
  m.touch(s.id, 5000);
  assert.strictEqual(m.get(s.id, 'u1')?.lastActivity, 5000);
});

test('kill pty.kill çağırır + Map\'ten siler', () => {
  const m = mgr();
  const p = fakePty();
  const s = m.create('u1', 'host', () => p, 0);
  m.kill(s.id);
  assert.strictEqual(p.killed, true);
  assert.strictEqual(m.count(), 0);
  assert.strictEqual(m.get(s.id, 'u1'), null);
});

test('reapIdle yalnız idle olanları öldürür', () => {
  const m = mgr();
  const pOld = fakePty(); const pNew = fakePty();
  m.create('u1', 'host', () => pOld, 0);       // lastActivity=0
  const sNew = m.create('u1', 'host', () => pNew, 1000000);
  const killed = m.reapIdle(1000000, 600000);  // now=1e6, idle>10dk → pOld (0) ölür, pNew kalır
  assert.strictEqual(killed.length, 1);
  assert.strictEqual(pOld.killed, true);
  assert.strictEqual(pNew.killed, false);
  assert.strictEqual(m.count(), 1);
  assert.ok(m.get(sNew.id, 'u1'));
});
```

- [ ] **Step 3: Test fail doğrula** — Run: `npm test` → FAIL (`session` modülü yok).
- [ ] **Step 4: Test geçer** — `session.ts` Step 1'de yazıldı. Run: `npm test` (yeni 5 test PASS), `npx tsc --noEmit` temiz.
- [ ] **Step 5: Commit**

```bash
git add lib/server/terminal/session.ts lib/server/terminal/session.test.ts
git commit -m "feat(terminal): pure session manager (DI spawner) + unit tests"
```

---

### Task 2: node-pty spawner + API route'ları

**Files:**
- Modify: `package.json` (node-pty ekle)
- Create: `lib/server/terminal/pty.ts`
- Create: `app/api/terminal/route.ts`, `app/api/terminal/[id]/stream/route.ts`, `app/api/terminal/[id]/input/route.ts`, `app/api/terminal/[id]/resize/route.ts`, `app/api/terminal/[id]/route.ts`

**Interfaces:**
- Consumes: Task 1 `TerminalManager`/`PtyLike`/`SpawnFn`/`TerminalLimitError`; `requireAuth`/`unauthorized`; `listContainers`/`assertSafeContainerRef`.
- Produces: REST: `POST /api/terminal` `{target}`→`{sessionId}`; `GET /api/terminal/[id]/stream`→octet-stream; `POST /api/terminal/[id]/input` `{data}`; `POST /api/terminal/[id]/resize` `{cols,rows}`; `DELETE /api/terminal/[id]`. Singleton `terminalManager`.

- [ ] **Step 1: node-pty bağımlılığı ekle** — Run: `npm install node-pty@^1.0.0` (native; sunucu/CI'da derlenir, Windows'ta prebuilt). `package.json` dependencies'e girer. (Eğer kurulum Windows'ta başarısız olursa raporla — BLOCKED.)

- [ ] **Step 2: `lib/server/terminal/pty.ts` yaz** (singleton manager + idle-reaper + spawner):

```ts
import * as nodePty from 'node-pty';
import { randomUUID } from 'node:crypto';
import { listContainers, assertSafeContainerRef } from '../docker';
import { TerminalManager, type PtyLike, type SpawnFn } from './session';

// HMR/çoklu-import'ta tek instance (better-sqlite3 singleton kalıbı gibi).
const g = globalThis as unknown as { __zolTerminal?: TerminalManager; __zolTermReaper?: ReturnType<typeof setInterval> };
export const terminalManager: TerminalManager = g.__zolTerminal ?? (g.__zolTerminal = new TerminalManager(() => randomUUID()));
if (!g.__zolTermReaper) {
  g.__zolTermReaper = setInterval(() => terminalManager.reapIdle(Date.now()), 60_000);
}

/** target='host' → bash; aksi halde container adı (doğrulanır) → docker exec. Async doğrulama sonrası sync SpawnFn döner. */
export async function makeSpawner(target: string): Promise<SpawnFn> {
  if (target !== 'host') {
    assertSafeContainerRef(target);
    const all = await listContainers();
    if (!all.some(c => c.name === target)) throw new Error('Container bulunamadı: ' + target);
  }
  return (): PtyLike => {
    const opts = { name: 'xterm-color', cols: 80, rows: 24, cwd: process.env.HOME || '/root', env: process.env as Record<string, string> };
    const p = target === 'host'
      ? nodePty.spawn('bash', [], opts)
      : nodePty.spawn('docker', ['exec', '-it', target, 'sh', '-c', 'exec bash 2>/dev/null || exec sh'], opts);
    return {
      onData: (cb) => { p.onData(cb); },
      onExit: (cb) => { p.onExit(() => cb()); },
      write: (d) => p.write(d),
      resize: (c, r) => { try { p.resize(c, r); } catch { /* boyut hatasını yut */ } },
      kill: () => p.kill(),
    };
  };
}
```

- [ ] **Step 3: `app/api/terminal/route.ts` (POST create) yaz:**

```ts
import { requireAuth, unauthorized } from '@/lib/auth';
import { terminalManager, makeSpawner } from '@/lib/server/terminal/pty';
import { TerminalLimitError } from '@/lib/server/terminal/session';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (!auth) return unauthorized();
  try {
    const { target = 'host' } = await req.json() as { target?: string };
    const spawn = await makeSpawner(target);
    let session;
    try {
      session = terminalManager.create(auth.id, target, spawn, Date.now());
    } catch (e) {
      if (e instanceof TerminalLimitError) return Response.json({ error: e.message }, { status: 429 });
      throw e;
    }
    console.log(`[audit] terminal açıldı: user=${auth.username} target=${target} session=${session.id}`);
    return Response.json({ sessionId: session.id });
  } catch (e: unknown) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
```

- [ ] **Step 4: `app/api/terminal/[id]/stream/route.ts` (GET, ReadableStream) yaz:**

```ts
import { requireAuth, unauthorized } from '@/lib/auth';
import { terminalManager } from '@/lib/server/terminal/pty';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (!auth) return unauthorized();
  const { id } = await params;
  const session = terminalManager.get(id, auth.id);
  if (!session) return Response.json({ error: 'Oturum bulunamadı' }, { status: 404 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      session.pty.onData((data) => {
        try { controller.enqueue(encoder.encode(data)); } catch { /* kapalı */ }
      });
      session.pty.onExit(() => {
        try { controller.close(); } catch { /* zaten kapalı */ }
        terminalManager.kill(id);
      });
    },
    cancel() {
      terminalManager.kill(id); // istemci stream'i kapattı → pty öldür (kaynak güvenliği)
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
```

- [ ] **Step 5: input + resize + delete route'larını yaz.**

`app/api/terminal/[id]/input/route.ts`:

```ts
import { requireAuth, unauthorized } from '@/lib/auth';
import { terminalManager } from '@/lib/server/terminal/pty';

export const runtime = 'nodejs';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (!auth) return unauthorized();
  const { id } = await params;
  const session = terminalManager.get(id, auth.id);
  if (!session) return Response.json({ error: 'Oturum bulunamadı' }, { status: 404 });
  const { data = '' } = await req.json() as { data?: string };
  session.pty.write(data);
  terminalManager.touch(id, Date.now());
  return Response.json({ ok: true });
}
```

`app/api/terminal/[id]/resize/route.ts`:

```ts
import { requireAuth, unauthorized } from '@/lib/auth';
import { terminalManager } from '@/lib/server/terminal/pty';

export const runtime = 'nodejs';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (!auth) return unauthorized();
  const { id } = await params;
  const session = terminalManager.get(id, auth.id);
  if (!session) return Response.json({ error: 'Oturum bulunamadı' }, { status: 404 });
  const { cols = 80, rows = 24 } = await req.json() as { cols?: number; rows?: number };
  session.pty.resize(Math.max(1, Math.min(500, cols)), Math.max(1, Math.min(300, rows)));
  terminalManager.touch(id, Date.now());
  return Response.json({ ok: true });
}
```

`app/api/terminal/[id]/route.ts`:

```ts
import { requireAuth, unauthorized } from '@/lib/auth';
import { terminalManager } from '@/lib/server/terminal/pty';

export const runtime = 'nodejs';

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (!auth) return unauthorized();
  const { id } = await params;
  if (!terminalManager.get(id, auth.id)) return Response.json({ error: 'Oturum bulunamadı' }, { status: 404 });
  terminalManager.kill(id);
  return Response.json({ ok: true });
}
```

- [ ] **Step 6: tsc + build** — Run: `npx tsc --noEmit` temiz; `npm run build` PASS (Windows EPERM → `rm -rf .next`). `npm test` (Task 1 testleri hâlâ geçer; node-pty native modül route'larda, testlerde değil).

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json lib/server/terminal/pty.ts "app/api/terminal"
git commit -m "feat(terminal): node-pty spawner + REST routes (create/stream/input/resize/delete)"
```

---

### Task 3: Frontend — xterm Terminal bileşeni + sayfa + nav + i18n

**Files:**
- Modify: `package.json` (@xterm/xterm + @xterm/addon-fit)
- Create: `components/terminal/Terminal.tsx`, `app/(panel)/terminal/page.tsx`
- Modify: `app/(panel)/layout.tsx` (nav), `lib/api-client.ts`, `messages/{tr,en,zh,es,de,fr}.json`

**Interfaces:**
- Consumes: Task 2 route'ları; `api` client; `useToast` (`@/components/ui`).
- Produces: `/terminal` sayfası + nav "Terminal" öğesi.

- [ ] **Step 1: Bağımlılıklar** — Run: `npm install @xterm/xterm@^5.5.0 @xterm/addon-fit@^0.10.0`.

- [ ] **Step 2: api-client'a ekle** (`lib/api-client.ts`, uygun yere):

```ts
  terminalCreate: (target: string) => request('POST', '/terminal', { target }),
  terminalInput: (id: string, data: string) => request('POST', `/terminal/${encodeURIComponent(id)}/input`, { data }),
  terminalResize: (id: string, cols: number, rows: number) => request('POST', `/terminal/${encodeURIComponent(id)}/resize`, { cols, rows }),
  terminalDelete: (id: string) => request('DELETE', `/terminal/${encodeURIComponent(id)}`),
```

- [ ] **Step 3: i18n anahtarları (6 dil)** — her `messages/<loc>.json` köküne `"terminal"` bloğu ekle:
  - tr: `"terminal": { "title": "Terminal", "host": "Sunucu (host)", "container": "Container", "target": "Hedef", "connect": "Bağlan", "reconnect": "Yeniden bağlan", "disconnected": "Oturum kapandı", "limit": "Çok fazla açık terminal oturumu" }`
  - en: `"terminal": { "title": "Terminal", "host": "Server (host)", "container": "Container", "target": "Target", "connect": "Connect", "reconnect": "Reconnect", "disconnected": "Session closed", "limit": "Too many open terminal sessions" }`
  - zh: `"terminal": { "title": "终端", "host": "服务器 (host)", "container": "容器", "target": "目标", "connect": "连接", "reconnect": "重新连接", "disconnected": "会话已关闭", "limit": "打开的终端会话过多" }`
  - es: `"terminal": { "title": "Terminal", "host": "Servidor (host)", "container": "Contenedor", "target": "Destino", "connect": "Conectar", "reconnect": "Reconectar", "disconnected": "Sesión cerrada", "limit": "Demasiadas sesiones de terminal abiertas" }`
  - de: `"terminal": { "title": "Terminal", "host": "Server (Host)", "container": "Container", "target": "Ziel", "connect": "Verbinden", "reconnect": "Neu verbinden", "disconnected": "Sitzung geschlossen", "limit": "Zu viele offene Terminal-Sitzungen" }`
  - fr: `"terminal": { "title": "Terminal", "host": "Serveur (hôte)", "container": "Conteneur", "target": "Cible", "connect": "Se connecter", "reconnect": "Reconnecter", "disconnected": "Session fermée", "limit": "Trop de sessions de terminal ouvertes" }`

- [ ] **Step 4: `components/terminal/Terminal.tsx` yaz** (xterm + fetch-stream):

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { api } from '@/lib/api-client';
import { useToast } from '@/components/ui';

export function TerminalView({ target }: { target: string }) {
  const t = useTranslations();
  const { show } = useToast();
  const hostRef = useRef<HTMLDivElement>(null);
  const [closed, setClosed] = useState(false);
  const [reconnectKey, setReconnectKey] = useState(0);

  useEffect(() => {
    if (!hostRef.current) return;
    let aborted = false;
    let sessionId = '';
    const term = new XTerm({
      fontFamily: 'var(--font-mono), monospace', fontSize: 13, cursorBlink: true,
      theme: { background: '#0d0d0d', foreground: '#e8e8e8' },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(hostRef.current);
    fit.fit();

    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : '';

    async function boot() {
      try {
        const res = await api.terminalCreate(target) as { sessionId: string; error?: string };
        if (aborted) return;
        sessionId = res.sessionId;
        term.onData((d) => { api.terminalInput(sessionId, d).catch(() => {}); });
        const doResize = () => {
          fit.fit();
          api.terminalResize(sessionId, term.cols, term.rows).catch(() => {});
        };
        window.addEventListener('resize', doResize);
        doResize();
        (term as unknown as { __cleanupResize?: () => void }).__cleanupResize = () => window.removeEventListener('resize', doResize);

        // Çıkış stream'i — fetch reader (Authorization header'lı; EventSource değil)
        const stream = await fetch(`/api/dbx-noop`.replace('/api/dbx-noop', `/api/terminal/${encodeURIComponent(sessionId)}/stream`), {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!stream.body) throw new Error('stream yok');
        const reader = stream.body.getReader();
        const decoder = new TextDecoder();
        while (!aborted) {
          const { value, done } = await reader.read();
          if (done) break;
          term.write(decoder.decode(value, { stream: true }));
        }
        if (!aborted) setClosed(true);
      } catch (e: unknown) {
        if (!aborted) { show(e instanceof Error ? e.message : String(e), 'error'); setClosed(true); }
      }
    }
    boot();

    return () => {
      aborted = true;
      (term as unknown as { __cleanupResize?: () => void }).__cleanupResize?.();
      if (sessionId) api.terminalDelete(sessionId).catch(() => {});
      term.dispose();
    };
  }, [target, reconnectKey, show, t]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div ref={hostRef} style={{ flex: 1, minHeight: 0, background: '#0d0d0d', borderRadius: 'var(--radius)', padding: '8px', overflow: 'hidden' }} />
      {closed && (
        <div style={{ padding: '8px', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12px', color: 'var(--text-muted)' }}>
          {t('terminal.disconnected')}
          <button type="button" onClick={() => { setClosed(false); setReconnectKey(k => k + 1); }}
            style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius)', padding: '5px 12px', cursor: 'pointer', fontSize: '12px' }}>
            {t('terminal.reconnect')}
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: `app/(panel)/terminal/page.tsx` yaz** (hedef seçici + TerminalView):

```tsx
'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api-client';
import { TerminalView } from '@/components/terminal/Terminal';

export default function TerminalPage() {
  const t = useTranslations();
  const [target, setTarget] = useState('host');
  const [containers, setContainers] = useState<string[]>([]);

  useEffect(() => {
    api.listContainers?.().then((cs: { name: string; state?: string }[]) => {
      setContainers(cs.filter(c => c.state === 'running').map(c => c.name));
    }).catch(() => {});
  }, []);

  return (
    <div className="page" style={{ animation: 'fadeIn 0.2s ease', display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px', flexShrink: 0, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 600 }}>{t('terminal.title')}</h2>
        <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          {t('terminal.target')}
          <select value={target} onChange={e => setTarget(e.target.value)}
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text-primary)', fontSize: '12px', padding: '4px 8px' }}>
            <option value="host">{t('terminal.host')}</option>
            {containers.map(c => <option key={c} value={c}>{t('terminal.container')}: {c}</option>)}
          </select>
        </label>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <TerminalView key={target} target={target} />
      </div>
    </div>
  );
}
```

> Not: `api.listContainers` mevcut değilse, `lib/api-client.ts`'e ekle: `listContainers: () => request('GET', '/docker/containers')` — mevcut docker route'una göre yolu doğrula; yoksa hedef seçiciyi yalnız "host" ile sınırla (container listesi boş kalır, host çalışır).

- [ ] **Step 6: Nav'a Terminal ekle** (`app/(panel)/layout.tsx`): lucide import'una `SquareTerminal` ekle; `NAV_ITEMS`'a (örn `logs`'tan önce) `{ id: 'terminal', icon: SquareTerminal, href: '/terminal' }` ekle. `nav.terminal` i18n anahtarı 6 dile: tr "Terminal", en "Terminal", zh "终端", es "Terminal", de "Terminal", fr "Terminal".

- [ ] **Step 7: tsc + build + test** — Run: `npx tsc --noEmit` temiz; `npm run build` PASS; `npm test` (i18n parity + used-key PASS — `terminal.*` + `nav.terminal` 6 dilde).

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json components/terminal "app/(panel)/terminal" "app/(panel)/layout.tsx" lib/api-client.ts messages/tr.json messages/en.json messages/zh.json messages/es.json messages/de.json messages/fr.json
git commit -m "feat(terminal): xterm.js terminal page + nav + i18n"
```

---

### Task 4: e2e + build/test/push/CI (deploy SSH'a bağlı)

**Files:**
- Create: `e2e/terminal.spec.ts`

- [ ] **Step 1: e2e** — `e2e/terminal.spec.ts` (helpers'taki `login` kullan):

```ts
import { test, expect } from '@playwright/test';
import { login } from './helpers';

test('terminal: sayfa açılır, hedef seçici görünür', async ({ page }) => {
  await login(page);
  await page.getByRole('link', { name: 'Terminal' }).click();
  await page.waitForURL('**/terminal');
  await expect(page.locator('h2').filter({ hasText: 'Terminal' })).toBeVisible({ timeout: 10_000 });
  // xterm canvas/textarea mount oldu mu (node-pty CI'da derliyse session açılır; açılmasa da sayfa+seçici görünür)
  await expect(page.locator('select')).toBeVisible();
  // 360px mobil taşma yok
  await page.setViewportSize({ width: 360, height: 720 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
  expect(overflow).toBeTruthy();
});
```

- [ ] **Step 2: Tüm doğrulamalar** — Run: `npx tsc --noEmit`; `npm test` (hepsi PASS); `npm run e2e` (terminal + mevcut PASS; lone `backups.spec.ts` Windows-stale-server ise `rm -rf .next` + tek tekrar). `git push origin main` → CI yeşil bekle. **CI'da node-pty native derlenir** (better-sqlite3 zaten derlendiği için toolchain mevcut); CI yeşil = derleme + build + testler tamam.

- [ ] **Step 3: DEPLOY — SSH erişimi GELİNCE (şu an bekemede).** SSH geri geldiğinde: `bash deploy.sh`. node-pty sunucuda derlenecek → deploy çıktısında derleme hatası olmadığını DOĞRULA. Health `{"status":"ok"}` + caddy "Valid". Deploy node-pty derlemesinde patlarsa: sunucuda `cd /opt/zolpanel && npm rebuild node-pty` veya build-essential/python kontrolü.

- [ ] **Step 4: Canlı doğrulama (SSH gelince).** Panel → Terminal → host'ta `ls`, `docker ps`, interaktif `top` sonra `q`; bir container seç → `docker exec` shell. Max-session (6. sekme → 429) + idle-timeout (10 dk → "oturum kapandı") gözlemle. Mobil görünüm.

- [ ] **Step 5: Ledger + alt-proje tamam (deploy hariç, SSH'a bağlı).**

---

## Self-Review (yazar)
- **Spec coverage:** session yönetimi+kaynak güvenliği→T1; node-pty spawner+route'lar (create/stream/input/resize/delete)+auth+audit+limit→T2; xterm frontend+nav+i18n→T3; e2e+CI (+deploy gated)→T4. Host+container exec→T2 makeSpawner. Tüm spec maddeleri kapsandı.
- **Placeholder yok:** Tüm kod tam. (T3 Step 5 not: `api.listContainers` yoksa fallback açık.)
- **Tip tutarlılığı:** `PtyLike`/`SpawnFn`/`TermSession`/`TerminalManager`/`TerminalLimitError` T1'de; T2 pty.ts + route'lar aynen kullanır. `terminalCreate/Input/Resize/Delete` T3'te tanımlı+kullanılır. `auth.id` sahiplik anahtarı tutarlı.
- **Kaynak güvenliği:** max-session(429)+idle-reaper(10dk)+stream-cancel/exit→kill — T1 test + T2 route'larda. (Bu oturumdaki sızıntı/loop derslerine doğrudan cevap.)
- **WebSocket yok:** çıkış ReadableStream + giriş POST → `next start` uyumlu, sidecar/Caddy-WS yok.
- **Native dep riski:** node-pty CI/sunucuda derlenir (better-sqlite3 toolchain'i mevcut); Windows'ta prebuilt. Kurulum patlarsa T2 Step1 BLOCKED raporlar. Unit testler node-pty'ye bağımlı değil (DI).
- **Deploy gated:** SSH kapalı → T4 yalnız CI-yeşile kadar; deploy/canlı SSH gelince.
