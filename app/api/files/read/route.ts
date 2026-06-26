import { promises as fs } from 'node:fs';
import { requireAuth, unauthorized } from '@/lib/auth';
import { safePath, UnsafePathError } from '@/lib/server/files/path-safety';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  if (!(await requireAuth(req))) return unauthorized();
  try {
    const p = safePath(new URL(req.url).searchParams.get('path') || '/');
    const st = await fs.stat(p).catch((e: NodeJS.ErrnoException) => {
      if (e.code === 'ENOENT') throw Object.assign(new Error('Dosya bulunamadı'), { code: 'ENOENT' });
      throw e;
    });
    if (st.size > 2 * 1024 * 1024) {
      return Response.json({ error: 'Dosya çok büyük (düzenleme ≤2MB)' }, { status: 413 });
    }
    const content = await fs.readFile(p, 'utf8');
    return Response.json({ content });
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (e instanceof UnsafePathError) return Response.json({ error: err.message }, { status: 400 });
    if (err.code === 'ENOENT') return Response.json({ error: err.message }, { status: 404 });
    return Response.json({ error: err.message }, { status: 500 });
  }
}
