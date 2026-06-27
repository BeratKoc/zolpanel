import { requireAuth, unauthorized } from '@/lib/auth';
import { listUpgradable, aptUpgrade } from '@/lib/server/maintenance/exec';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  if (!(await requireAuth(req))) return unauthorized();
  try {
    return Response.json({ packages: await listUpgradable() });
  } catch (e: unknown) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!(await requireAuth(req))) return unauthorized();
  try {
    return Response.json({ output: (await aptUpgrade()).slice(0, 200000) });
  } catch (e: unknown) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
