import { requireAuth, unauthorized } from '@/lib/auth';
import { startProcess } from '@/lib/server/pm2';
import { processNameSchema } from '@/lib/validation';

export const runtime = 'nodejs';

// Process başlat (eski: POST /api/processes/start)
export async function POST(req: Request) {
  if (!(await requireAuth(req))) return unauthorized();
  const body = await req.json().catch(() => ({} as any));
  const { name, script, cwd } = body || {};

  if (!processNameSchema.safeParse(name).success) {
    return Response.json({ error: 'Geçersiz process adı' }, { status: 400 });
  }
  if (!script) {
    return Response.json({ error: 'name ve script gerekli' }, { status: 400 });
  }

  try {
    await startProcess(name, script, cwd || '/var/www');
    return Response.json({ message: `${name} başlatıldı` });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
