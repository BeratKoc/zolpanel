import { promises as fs } from 'node:fs';
import { requireAuth, unauthorized } from '@/lib/auth';
import { safePath, UnsafePathError } from '@/lib/server/files/path-safety';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  if (!(await requireAuth(req))) return unauthorized();
  try {
    const { from, to } = await req.json() as { from: string; to: string };
    const src = safePath(from);
    const dst = safePath(to);
    await fs.rename(src, dst);
    return Response.json({ ok: true });
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (e instanceof UnsafePathError) return Response.json({ error: err.message }, { status: 400 });
    if (err.code === 'ENOENT') return Response.json({ error: err.message }, { status: 404 });
    return Response.json({ error: err.message }, { status: 500 });
  }
}
