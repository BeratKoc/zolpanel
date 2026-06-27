import { requireAuth, unauthorized } from '@/lib/auth';
import { getSetting, setSetting, deleteSetting } from '@/lib/server/db';
import { encryptSecret } from '@/lib/server/secrets';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  if (!(await requireAuth(req))) return unauthorized();
  return Response.json({ configured: !!getSetting('cf_api_token') });
}

export async function POST(req: Request) {
  if (!(await requireAuth(req))) return unauthorized();
  try {
    const body = await req.json();
    const { token } = body as { token?: string };
    if (!token || !token.trim()) {
      return Response.json({ error: 'Token boş olamaz' }, { status: 400 });
    }
    setSetting('cf_api_token', encryptSecret(token.trim()));
    return Response.json({ ok: true });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  if (!(await requireAuth(req))) return unauthorized();
  deleteSetting('cf_api_token');
  return Response.json({ ok: true });
}
