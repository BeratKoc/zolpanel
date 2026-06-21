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
