import { promises as fs } from 'node:fs';
import path from 'node:path';
import { requireAuth, unauthorized } from '@/lib/auth';
import { safePath, UnsafePathError } from '@/lib/server/files/path-safety';

export const runtime = 'nodejs';

const MAX_UPLOAD = 200 * 1024 * 1024; // 200MB

export async function POST(req: Request) {
  if (!(await requireAuth(req))) return unauthorized();
  try {
    const dir = safePath(new URL(req.url).searchParams.get('path') || '/');
    const form = await req.formData();
    const file = form.get('file') as File | null;
    if (!file) {
      return Response.json({ error: 'file alanı eksik' }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD) {
      return Response.json({ error: 'Dosya çok büyük (yükleme ≤200MB)' }, { status: 413 });
    }
    const safeBaseName = path.posix.basename(file.name);
    if (!safeBaseName) {
      return Response.json({ error: 'Geçersiz dosya adı' }, { status: 400 });
    }
    const dest = path.posix.join(dir, safeBaseName);
    await fs.writeFile(dest, Buffer.from(await file.arrayBuffer()));
    return Response.json({ ok: true });
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (e instanceof UnsafePathError) return Response.json({ error: err.message }, { status: 400 });
    return Response.json({ error: err.message }, { status: 500 });
  }
}
