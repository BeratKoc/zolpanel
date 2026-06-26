import { promises as fs } from 'node:fs';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import path from 'node:path';
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
    if (st.isDirectory()) {
      return Response.json({ error: 'Dizin indirilemez' }, { status: 400 });
    }
    const stream = createReadStream(p);
    const webStream = Readable.toWeb(stream) as unknown as ReadableStream;
    return new Response(webStream, {
      headers: {
        'Content-Disposition': `attachment; filename="${encodeURIComponent(path.posix.basename(p))}"`,
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(st.size),
      },
    });
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (e instanceof UnsafePathError) return Response.json({ error: err.message }, { status: 400 });
    if (err.code === 'ENOENT') return Response.json({ error: err.message }, { status: 404 });
    return Response.json({ error: err.message }, { status: 500 });
  }
}
