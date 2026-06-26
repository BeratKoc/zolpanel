import { requireAuth, unauthorized } from '@/lib/auth';
import { terminalManager, makeSpawner } from '@/lib/server/terminal/pty';
import { TerminalLimitError } from '@/lib/server/terminal/session';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (!auth) return unauthorized();
  try {
    const { target = 'host' } = await req.json() as { target?: string };
    const spawn = await makeSpawner(target);
    let session;
    try {
      session = terminalManager.create(auth.id, target, spawn, Date.now());
    } catch (e) {
      if (e instanceof TerminalLimitError) return Response.json({ error: e.message }, { status: 429 });
      throw e;
    }
    console.log(`[audit] terminal açıldı: user=${auth.username} target=${target} session=${session.id}`);
    return Response.json({ sessionId: session.id });
  } catch (e: unknown) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
