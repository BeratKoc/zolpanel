import { requireAuth, unauthorized } from '@/lib/auth';
import { runCommand } from '@/lib/server/cron/exec';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  if (!(await requireAuth(req))) return unauthorized();
  try {
    const { command } = await req.json() as { command: string };
    if (typeof command !== 'string' || !command.trim()) {
      return Response.json({ error: 'Komut boş olamaz' }, { status: 400 });
    }
    const out = await runCommand(command);
    return Response.json({ output: out.slice(0, 100000) });
  } catch (e) { return Response.json({ error: (e as Error).message }, { status: 500 }); }
}
