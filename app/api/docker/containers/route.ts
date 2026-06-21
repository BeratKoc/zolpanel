import { requireAuth, unauthorized } from '@/lib/auth';
import { listContainers } from '@/lib/server/docker';
export const runtime = 'nodejs';
export async function GET(req: Request) {
  if (!(await requireAuth(req))) return unauthorized();
  try { return Response.json(await listContainers()); }
  catch (e: any) { return Response.json({ error: e.message }, { status: 500 }); }
}
