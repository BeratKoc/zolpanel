import { requireSession, unauthorized } from '@/lib/auth';
import { is2faEnabled, set2faSecret, get2faSecret, enable2fa, disable2fa } from '@/lib/server/auth/twofactor';
import { randomBase32Secret, otpauthUri, verifyTotp } from '@/lib/server/auth/totp';

export const runtime = 'nodejs';

// GET /api/auth/2fa → { enabled: boolean }
export async function GET(req: Request) {
  const auth = await requireSession(req);
  if (!auth) return unauthorized();
  return Response.json({ enabled: is2faEnabled(auth.username) });
}

// POST /api/auth/2fa → setup: { secret, otpauth } (enabled değil henüz)
export async function POST(req: Request) {
  const auth = await requireSession(req);
  if (!auth) return unauthorized();
  const secret = randomBase32Secret();
  set2faSecret(auth.username, secret);
  return Response.json({ secret, otpauth: otpauthUri(auth.username, secret) });
}

// PUT /api/auth/2fa { code } → verify & enable: { ok: true } ya da 400
export async function PUT(req: Request) {
  const auth = await requireSession(req);
  if (!auth) return unauthorized();
  const body = await req.json().catch(() => ({})) as { code?: string };
  const code = body.code;
  if (!code) return Response.json({ error: 'code gerekli' }, { status: 400 });
  const secret = get2faSecret(auth.username);
  if (!secret) return Response.json({ error: '2FA kurulumu bulunamadı' }, { status: 400 });
  if (!verifyTotp(secret, code, Date.now())) {
    return Response.json({ error: 'Geçersiz kod' }, { status: 400 });
  }
  enable2fa(auth.username);
  return Response.json({ ok: true });
}

// DELETE /api/auth/2fa → disable: { ok: true }
export async function DELETE(req: Request) {
  const auth = await requireSession(req);
  if (!auth) return unauthorized();
  disable2fa(auth.username);
  return Response.json({ ok: true });
}
