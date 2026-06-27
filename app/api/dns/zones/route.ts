import { requireAuth, unauthorized } from '@/lib/auth';
import { cloudflare } from '@/lib/server/dns/cloudflare';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  if (!(await requireAuth(req))) return unauthorized();
  try {
    const zones = await cloudflare.listZones();
    return Response.json({ zones });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}
