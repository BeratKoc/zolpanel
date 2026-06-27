import { requireAuth, unauthorized } from '@/lib/auth';
import { diskUsage } from '@/lib/server/maintenance/exec';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  if (!(await requireAuth(req))) return unauthorized();
  try {
    return Response.json(await diskUsage());
  } catch (e: unknown) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
