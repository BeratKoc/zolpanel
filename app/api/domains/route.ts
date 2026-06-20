import {
  addLog,
  DomainDoc,
  getAllDomains,
  getDomainByName,
  getDomainByPort,
  getProxyDomains,
  insertDomain,
} from '@/lib/server/db';
import { requireAuth, unauthorized } from '@/lib/auth';
import { createDomainSchema } from '@/lib/validation';
import { addDomainToConfig, isCaddyRunning } from '@/lib/server/caddy';
import { findNextAvailablePort } from '@/lib/server/portManager';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  if (!(await requireAuth(req))) return unauthorized();
  return Response.json(getAllDomains());
}

export async function POST(req: Request) {
  if (!(await requireAuth(req))) return unauthorized();
  const parsed = createDomainSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const input = parsed.data;

  // better-sqlite3 senkron → port tahsis yarışı yok; mutex'e gerek kalmadı.
  if (getDomainByName(input.domain)) {
    return Response.json({ error: 'Bu domain zaten mevcut' }, { status: 409 });
  }
  let assignedPort: number | null = null;
  if (input.type === 'proxy') {
    assignedPort = input.port ?? null;
    if (!assignedPort) {
      const proxies = getProxyDomains();
      assignedPort = await findNextAvailablePort(proxies.map((p) => p.port).filter(Boolean) as number[]);
    } else if (getDomainByPort(assignedPort)) {
      return Response.json({ error: `Port ${assignedPort} zaten kullanımda` }, { status: 409 });
    }
  }
  const now = new Date().toISOString();
  const doc: Omit<DomainDoc, '_id'> = {
    domain: input.domain, type: input.type,
    port: input.type === 'proxy' ? assignedPort : null,
    rootPath: input.type === 'static' ? ((input as any).rootPath || `/var/www/${input.domain}`) : null,
    routes: input.type === 'advanced' ? (input as any).routes : null,
    aliases: input.aliases, appType: input.appType || 'other', notes: input.notes || '',
    status: 'active', sslStatus: 'pending', createdAt: now, updatedAt: now,
  };
  const saved = insertDomain(doc);
  try {
    if (await isCaddyRunning()) {
      await addDomainToConfig(saved);
      // sslStatus 'pending' kalır; sslTracker gerçek sertifika durumunu (Caddy
      // public CA sertifikası aldığında) ~60sn içinde 'active' yapar.
    } else addLog(input.domain, 'warn', 'Caddy çalışmıyor');
  } catch (e: any) {
    addLog(input.domain, 'error', 'Caddy config hatası: ' + e.message);
  }
  addLog(input.domain, 'info', `Domain oluşturuldu (${input.type})`);
  return Response.json(saved, { status: 201 });
}
