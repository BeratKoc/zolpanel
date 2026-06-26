import { requireAuth, unauthorized } from '@/lib/auth';
import { terminalManager } from '@/lib/server/terminal/pty';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (!auth) return unauthorized();
  const { id } = await params;
  const session = terminalManager.get(id, auth.id);
  if (!session) return Response.json({ error: 'Oturum bulunamadı' }, { status: 404 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      session.pty.onData((data) => {
        try { controller.enqueue(encoder.encode(data)); } catch { /* kapalı */ }
      });
      session.pty.onExit(() => {
        try { controller.close(); } catch { /* zaten kapalı */ }
        terminalManager.kill(id);
      });
    },
    cancel() {
      terminalManager.kill(id); // istemci stream'i kapattı → pty öldür (kaynak güvenliği)
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
