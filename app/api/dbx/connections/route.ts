import { requireAuth, unauthorized } from '@/lib/auth';
import { discoverConnections } from '@/lib/server/dbExplorer/discover';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  if (!(await requireAuth(req))) return unauthorized();
  try {
    const connections = await discoverConnections();
    return Response.json(connections);
  } catch (e: unknown) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
