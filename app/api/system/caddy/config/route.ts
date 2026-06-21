import { requireAuth, unauthorized } from '@/lib/auth';
import { readCaddyfile } from '@/lib/server/caddy';
import { caddyAdminAvailable } from '@/lib/server/caddyAdmin';

export const runtime = 'nodejs';

// Caddyfile içeriğini getir
export async function GET(req: Request) {
  if (!(await requireAuth(req))) return unauthorized();
  try {
    const [content, adminAvailable] = await Promise.all([
      Promise.resolve(readCaddyfile()),
      caddyAdminAvailable(),
    ]);
    return Response.json({ content, adminAvailable });
  } catch {
    return Response.json({ error: 'Caddyfile okunamadı' }, { status: 500 });
  }
}
