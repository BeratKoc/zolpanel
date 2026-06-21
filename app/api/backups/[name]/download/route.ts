import fs from 'fs';
import { requireAuth, unauthorized } from '@/lib/auth';
import { backupFilePath } from '@/lib/server/backup';

export const runtime = 'nodejs';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  if (!(await requireAuth(req))) return unauthorized();
  const { name } = await params;
  try {
    const p = backupFilePath(name);
    const buf = fs.readFileSync(p);
    return new Response(buf, {
      headers: {
        'Content-Type': 'application/gzip',
        'Content-Disposition': `attachment; filename="${name}"`,
      },
    });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 404 });
  }
}
