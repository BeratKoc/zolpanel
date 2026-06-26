import { requireAuth, unauthorized } from '@/lib/auth';
import { ufwStatus, ufwEnable, ufwDisable } from '@/lib/server/firewall/exec';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  if (!(await requireAuth(req))) return unauthorized();
  try {
    const body = await req.json() as { enable: boolean };
    if (body.enable) {
      await ufwEnable();
    } else {
      await ufwDisable();
    }
    return Response.json({ status: await ufwStatus() });
  } catch (e: unknown) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
