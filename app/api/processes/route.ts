import { requireAuth, unauthorized } from '@/lib/auth';
import { isPm2Available, listProcesses } from '@/lib/server/pm2';

export const runtime = 'nodejs';

// Tüm processleri listele
export async function GET(req: Request) {
  if (!(await requireAuth(req))) return unauthorized();
  try {
    if (!(await isPm2Available())) {
      return Response.json({ available: false, processes: [] });
    }
    return Response.json({ available: true, processes: await listProcesses() });
  } catch (e: any) {
    return Response.json({ error: 'Process listesi alınamadı', detail: e.message }, { status: 500 });
  }
}
