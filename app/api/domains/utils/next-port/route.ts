import { getProxyDomains } from '@/lib/server/db';
import { requireAuth, unauthorized } from '@/lib/auth';
import { findNextAvailablePort } from '@/lib/server/portManager';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  if (!(await requireAuth(req))) return unauthorized();
  try {
    const proxies = getProxyDomains();
    const reservedPorts = proxies.map((p) => p.port).filter(Boolean) as number[];
    const port = await findNextAvailablePort(reservedPorts);
    return Response.json({ port });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
