import { promises as fs } from 'node:fs';
import { requireAuth, unauthorized } from '@/lib/auth';
import { safePath, UnsafePathError } from '@/lib/server/files/path-safety';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  if (!(await requireAuth(req))) return unauthorized();
  try {
    const { path: rawPath, content } = await req.json() as { path: string; content: string };
    const p = safePath(rawPath);
    if (typeof content !== 'string') {
      return Response.json({ error: 'content string olmalı' }, { status: 400 });
    }
    if (content.length > 5 * 1024 * 1024) {
      return Response.json({ error: 'İçerik çok büyük (kaydetme ≤5MB)' }, { status: 413 });
    }
    await fs.writeFile(p, content, 'utf8');
    return Response.json({ ok: true });
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (e instanceof UnsafePathError) return Response.json({ error: err.message }, { status: 400 });
    return Response.json({ error: err.message }, { status: 500 });
  }
}
