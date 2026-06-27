import fs from 'fs/promises';
import { requireAuth, unauthorized } from '@/lib/auth';
import { assertSafeBackupName, backupFilePath } from '@/lib/server/backup';
import { getS3Config } from '@/lib/server/s3/config';
import { putObject } from '@/lib/server/s3/client';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  if (!(await requireAuth(req))) return unauthorized();
  try {
    const { name } = await req.json();
    assertSafeBackupName(name);
    const filePath = backupFilePath(name);
    const buf = await fs.readFile(filePath);
    const cfg = getS3Config();
    if (!cfg) return Response.json({ error: 'S3 yapılandırılmamış' }, { status: 400 });
    const key = (cfg.prefix || '') + name;
    await putObject(cfg, key, buf, 'application/gzip');
    return Response.json({ ok: true });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
