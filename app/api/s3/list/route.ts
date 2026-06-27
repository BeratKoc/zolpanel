import { requireAuth, unauthorized } from '@/lib/auth';
import { getS3Config } from '@/lib/server/s3/config';
import { listObjects } from '@/lib/server/s3/client';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  if (!(await requireAuth(req))) return unauthorized();
  try {
    const cfg = getS3Config();
    if (!cfg) return Response.json({ error: 'S3 yapılandırılmamış' }, { status: 400 });
    const objects = await listObjects(cfg);
    return Response.json({ objects });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
