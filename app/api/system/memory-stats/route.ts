import { requireAuth, unauthorized } from '@/lib/auth';
import { getMemoryStats } from '@/lib/server/memoryTracker';

export const runtime = 'nodejs';

// Servis bazlı memory stats (sparkline + anomali)
export async function GET(req: Request) {
  if (!(await requireAuth(req))) return unauthorized();
  const hours = parseInt(new URL(req.url).searchParams.get('hours') || '') || 1;
  try {
    return Response.json(getMemoryStats(hours));
  } catch (e: any) {
    return Response.json({ error: 'Memory stats alınamadı', detail: e.message }, { status: 500 });
  }
}
