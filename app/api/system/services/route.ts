import { requireAuth, unauthorized } from '@/lib/auth';
import { getCurrentServices } from '@/lib/server/memoryTracker';

export const runtime = 'nodejs';

// Anlık servis listesi
export async function GET(req: Request) {
  if (!(await requireAuth(req))) return unauthorized();
  try {
    return Response.json(await getCurrentServices());
  } catch (e: any) {
    return Response.json({ error: 'Servis listesi alınamadı', detail: e.message }, { status: 500 });
  }
}
