import { domainStats } from '@/lib/server/db';
import { requireAuth, unauthorized } from '@/lib/auth';

export const runtime = 'nodejs';

// Genel istatistikler (dashboard için)
export async function GET(req: Request) {
  if (!(await requireAuth(req))) return unauthorized();
  try {
    return Response.json(domainStats());
  } catch {
    return Response.json({ error: 'İstatistikler alınamadı' }, { status: 500 });
  }
}
