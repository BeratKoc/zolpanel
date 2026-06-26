import { promises as fs } from 'node:fs';
import path from 'node:path';
import { requireAuth, unauthorized } from '@/lib/auth';
import { safePath, UnsafePathError, type FileEntry } from '@/lib/server/files/path-safety';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  if (!(await requireAuth(req))) return unauthorized();
  try {
    const dir = safePath(new URL(req.url).searchParams.get('path') || '/');
    const names = await fs.readdir(dir);
    const entries: FileEntry[] = [];
    for (const name of names) {
      try {
        const st = await fs.lstat(path.posix.join(dir, name));
        entries.push({
          name,
          type: st.isDirectory() ? 'dir' : st.isFile() ? 'file' : 'other',
          size: st.size,
          mtime: st.mtimeMs,
          mode: (st.mode & 0o777).toString(8).padStart(3, '0'),
        });
      } catch { /* erişilemeyen girdiyi atla */ }
    }
    entries.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1));
    return Response.json({ path: dir, entries });
  } catch (e) {
    const status = e instanceof UnsafePathError ? 400 : 500;
    return Response.json({ error: (e as Error).message }, { status });
  }
}
