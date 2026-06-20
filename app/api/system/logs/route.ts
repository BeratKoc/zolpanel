import { getLogs, clearLogs } from '@/lib/server/db';
import { requireAuth, unauthorized } from '@/lib/auth';

export const runtime = 'nodejs';

// Logları listele
export async function GET(req: Request) {
  if (!(await requireAuth(req))) return unauthorized();
  const sp = new URL(req.url).searchParams;
  const domain = sp.get('domain');
  const level = sp.get('level');
  const limit = parseInt(sp.get('limit') || '') || 200;

  try {
    return Response.json(
      getLogs({
        domain: domain && domain !== 'all' ? domain : undefined,
        level: level && level !== 'all' ? level : undefined,
        limit,
      }),
    );
  } catch {
    return Response.json({ error: 'Loglar alınamadı' }, { status: 500 });
  }
}

// Logları temizle
export async function DELETE(req: Request) {
  if (!(await requireAuth(req))) return unauthorized();
  const domain = new URL(req.url).searchParams.get('domain');
  try {
    const count = clearLogs(domain && domain !== 'all' ? domain : undefined);
    return Response.json({ message: `${count} log silindi` });
  } catch {
    return Response.json({ error: 'Loglar temizlenemedi' }, { status: 500 });
  }
}
