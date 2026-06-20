import { db, DomainDoc } from '@/lib/server/db';
import { requireAuth, unauthorized } from '@/lib/auth';

export const runtime = 'nodejs';

const findDomains = (q: any): Promise<DomainDoc[]> =>
  new Promise((res, rej) => db.domains.find(q, (e: Error | null, d: DomainDoc[]) => (e ? rej(e) : res(d))));

// Genel istatistikler (dashboard için)
export async function GET(req: Request) {
  if (!(await requireAuth(req))) return unauthorized();
  try {
    const domains = await findDomains({});
    return Response.json({
      total: domains.length,
      active: domains.filter((d) => d.status === 'active').length,
      offline: domains.filter((d) => d.status === 'offline').length,
      proxy: domains.filter((d) => d.type === 'proxy').length,
      static: domains.filter((d) => d.type === 'static').length,
      sslActive: domains.filter((d) => d.sslStatus === 'active').length,
    });
  } catch {
    return Response.json({ error: 'İstatistikler alınamadı' }, { status: 500 });
  }
}
