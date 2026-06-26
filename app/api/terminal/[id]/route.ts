import { requireAuth, unauthorized } from '@/lib/auth';
import { terminalManager } from '@/lib/server/terminal/pty';

export const runtime = 'nodejs';

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (!auth) return unauthorized();
  const { id } = await params;
  if (!terminalManager.get(id, auth.id)) return Response.json({ error: 'Oturum bulunamadı' }, { status: 404 });
  terminalManager.kill(id);
  return Response.json({ ok: true });
}
