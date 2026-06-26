import { requireAuth, unauthorized } from '@/lib/auth';
import { terminalManager } from '@/lib/server/terminal/pty';

export const runtime = 'nodejs';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (!auth) return unauthorized();
  const { id } = await params;
  const session = terminalManager.get(id, auth.id);
  if (!session) return Response.json({ error: 'Oturum bulunamadı' }, { status: 404 });
  const { data = '' } = await req.json() as { data?: string };
  session.pty.write(data);
  terminalManager.touch(id, Date.now());
  return Response.json({ ok: true });
}
