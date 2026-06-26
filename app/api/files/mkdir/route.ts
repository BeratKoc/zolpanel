import { promises as fs } from 'node:fs';
import { requireAuth, unauthorized } from '@/lib/auth';
import { safePath, UnsafePathError } from '@/lib/server/files/path-safety';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  if (!(await requireAuth(req))) return unauthorized();
  try {
    const { path: rawPath } = await req.json() as { path: string };
    const p = safePath(rawPath);
    await fs.mkdir(p, { recursive: true });
    return Response.json({ ok: true });
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (e instanceof UnsafePathError) return Response.json({ error: err.message }, { status: 400 });
    return Response.json({ error: err.message }, { status: 500 });
  }
}
