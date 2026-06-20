import { requireAuth, unauthorized } from '@/lib/auth';
import { readCaddyfile } from '@/lib/server/caddy';

export const runtime = 'nodejs';

// Caddyfile içeriğini getir
export async function GET(req: Request) {
  if (!(await requireAuth(req))) return unauthorized();
  try {
    return Response.json({ content: readCaddyfile() });
  } catch {
    return Response.json({ error: 'Caddyfile okunamadı' }, { status: 500 });
  }
}
