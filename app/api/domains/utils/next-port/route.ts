import { db, DomainDoc } from '@/lib/server/db';
import { requireAuth, unauthorized } from '@/lib/auth';
import { findNextAvailablePort } from '@/lib/server/portManager';

export const runtime = 'nodejs';

const find = (q: any): Promise<DomainDoc[]> =>
  new Promise((res, rej) => db.domains.find(q).exec((e: Error | null, d: DomainDoc[]) => (e ? rej(e) : res(d))));

export async function GET(req: Request) {
  if (!(await requireAuth(req))) return unauthorized();
  try {
    const proxies = await find({ type: 'proxy' });
    const reservedPorts = proxies.map((p) => p.port).filter(Boolean) as number[];
    const port = await findNextAvailablePort(reservedPorts);
    return Response.json({ port });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
