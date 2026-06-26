import { promises as fs } from 'node:fs';
import { requireAuth, unauthorized } from '@/lib/auth';
import { safePath, UnsafePathError } from '@/lib/server/files/path-safety';

export const runtime = 'nodejs';

export async function DELETE(req: Request) {
  if (!(await requireAuth(req))) return unauthorized();
  try {
    const { path: rawPath, recursive } = await req.json() as { path: string; recursive?: boolean };
    const p = safePath(rawPath);
    if (p === '/') {
      return Response.json({ error: 'Kök dizin silinemez' }, { status: 400 });
    }
    await fs.rm(p, { recursive: !!recursive, force: false });
    return Response.json({ ok: true });
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (e instanceof UnsafePathError) return Response.json({ error: err.message }, { status: 400 });
    if (err.code === 'ENOENT') return Response.json({ error: err.message }, { status: 404 });
    return Response.json({ error: err.message }, { status: 500 });
  }
}
