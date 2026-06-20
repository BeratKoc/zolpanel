import { requireAuth, unauthorized } from '@/lib/auth';
import { reloadCaddy } from '@/lib/server/caddy';

export const runtime = 'nodejs';

// Caddy reload
export async function POST(req: Request) {
  if (!(await requireAuth(req))) return unauthorized();
  try {
    await reloadCaddy();
    return Response.json({ message: 'Caddy yeniden yüklendi' });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
