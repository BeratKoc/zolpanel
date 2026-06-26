import { requireAuth, unauthorized } from '@/lib/auth';
import { terminalManager } from '@/lib/server/terminal/pty';

export const runtime = 'nodejs';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (!auth) return unauthorized();
  const { id } = await params;
  const session = terminalManager.get(id, auth.id);
  if (!session) return Response.json({ error: 'Oturum bulunamadı' }, { status: 404 });
  const { cols, rows } = await req.json() as { cols?: number; rows?: number };
  if (!Number.isFinite(cols) || !Number.isFinite(rows))
    return Response.json({ error: 'Geçersiz boyut' }, { status: 400 });
  session.pty.resize(Math.max(1, Math.min(500, cols as number)), Math.max(1, Math.min(300, rows as number)));
  terminalManager.touch(id, Date.now());
  return Response.json({ ok: true });
}
