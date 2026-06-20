import type Nedb from 'nedb';
import { db, addLog, DomainDoc } from '@/lib/server/db';
import { requireAuth, unauthorized } from '@/lib/auth';
import { createDomainSchema } from '@/lib/validation';
import { addDomainToConfig, isCaddyRunning } from '@/lib/server/caddy';
import { findNextAvailablePort } from '@/lib/server/portManager';

export const runtime = 'nodejs';

const find = <T>(store: Nedb<T>, q: any): Promise<T[]> =>
  new Promise((res, rej) => store.find(q).sort({ createdAt: -1 }).exec((e: Error | null, d: T[]) => (e ? rej(e) : res(d))));
const findOne = <T>(store: Nedb<T>, q: any): Promise<T | null> =>
  new Promise((res) => store.findOne(q, (_e: Error | null, d: T | null) => res(d || null)));
const insert = <T>(store: Nedb<T>, doc: T): Promise<T> =>
  new Promise((res, rej) => store.insert(doc, (e: Error | null, d: T) => (e ? rej(e) : res(d))));

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
      rootPath: input.type === 'static' ? ((input as any).rootPath || `/var/www/${input.domain}`) : null,
      routes: input.type === 'advanced' ? (input as any).routes : null,
      aliases: input.aliases, appType: input.appType || 'other', notes: input.notes || '',
      status: 'active', sslStatus: 'pending', createdAt: now, updatedAt: now,
    };
    const saved = await insert(db.domains, doc);
    try {
      if (await isCaddyRunning()) {
        await addDomainToConfig(doc);
        // sslStatus 'pending' kalır; sslTracker gerçek sertifika durumunu (Caddy
        // public CA sertifikası aldığında) ~60sn içinde 'active' yapar.
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
