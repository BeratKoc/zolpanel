import { requireAuth, unauthorized } from '@/lib/auth';
import { getSetting } from '@/lib/server/db';
import { validateS3Config, saveS3Config, getS3ConfigSafe, deleteS3Config } from '@/lib/server/s3/config';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  if (!(await requireAuth(req))) return unauthorized();
  return Response.json({ configured: !!getSetting('s3_config'), config: getS3ConfigSafe() });
}

export async function POST(req: Request) {
  if (!(await requireAuth(req))) return unauthorized();
  try {
    const { config } = await req.json();
    const err = validateS3Config(config || {});
    if (err) return Response.json({ error: err }, { status: 400 });
    saveS3Config(config);
    return Response.json({ ok: true });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  if (!(await requireAuth(req))) return unauthorized();
  try {
    deleteS3Config();
    return Response.json({ ok: true });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
