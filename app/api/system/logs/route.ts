import { db, LogDoc } from '@/lib/server/db';
import { requireAuth, unauthorized } from '@/lib/auth';

export const runtime = 'nodejs';

const findLogs = (q: any, limit: number): Promise<LogDoc[]> =>
  new Promise((res, rej) =>
    db.logs
      .find(q)
      .sort({ timestamp: -1 })
      .limit(limit)
      .exec((e: Error | null, d: LogDoc[]) => (e ? rej(e) : res(d))),
  );
const removeLogs = (q: any): Promise<number> =>
  new Promise((res, rej) =>
    db.logs.remove(q, { multi: true }, (e: Error | null, n: number) => (e ? rej(e) : res(n))),
  );

// Logları listele
export async function GET(req: Request) {
  if (!(await requireAuth(req))) return unauthorized();
  const sp = new URL(req.url).searchParams;
  const domain = sp.get('domain');
  const level = sp.get('level');
  const limit = parseInt(sp.get('limit') || '') || 200;

  const query: any = {};
  if (domain && domain !== 'all') query.domain = domain;
  if (level && level !== 'all') query.level = level;

  try {
    return Response.json(await findLogs(query, limit));
  } catch {
    return Response.json({ error: 'Loglar alınamadı' }, { status: 500 });
  }
}

// Logları temizle
export async function DELETE(req: Request) {
  if (!(await requireAuth(req))) return unauthorized();
  const domain = new URL(req.url).searchParams.get('domain');
  const query = domain && domain !== 'all' ? { domain } : {};
  try {
    const count = await removeLogs(query);
    return Response.json({ message: `${count} log silindi` });
  } catch {
    return Response.json({ error: 'Loglar temizlenemedi' }, { status: 500 });
  }
}
