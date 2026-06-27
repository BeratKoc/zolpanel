import bcrypt from 'bcryptjs';
import { getUserByName, addLog } from '@/lib/server/db';
import { signToken } from '@/lib/auth';
import { loginSchema } from '@/lib/validation';
import { rateLimit, resetLimit } from '@/lib/server/rateLimit';
import { is2faEnabled, get2faSecret } from '@/lib/server/auth/twofactor';
import { verifyTotp } from '@/lib/server/auth/totp';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (!rateLimit('login:' + ip)) {
    addLog('system', 'warn', `Brute force engellendi: ${ip}`);
    return Response.json({ error: 'Çok fazla deneme. 15 dakika sonra tekrar deneyin.' }, { status: 429 });
  }
  const body = await req.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: 'Kullanıcı adı ve şifre gerekli' }, { status: 400 });
  const { username, password, totp } = parsed.data;

  const user = getUserByName(username);
  if (!user || !(await bcrypt.compare(password, user.password))) {
    addLog('system', 'warn', `Başarısız giriş: "${username}" - IP: ${ip}`);
    return Response.json({ error: 'Geçersiz kullanıcı adı veya şifre' }, { status: 401 });
  }

  // 2FA kontrolü (yalnızca 2FA aktifse; değilse akış AYNEN devam eder).
  if (is2faEnabled(username)) {
    if (!totp) {
      // Token vermez, rateLimit reset etmez — sadece 2FA kodu beklenir.
      return Response.json({ twoFactorRequired: true });
    }
    const secret = get2faSecret(username);
    if (!secret || !verifyTotp(secret, totp, Date.now())) {
      return Response.json({ error: 'Geçersiz 2FA kodu' }, { status: 401 });
    }
  }

  resetLimit('login:' + ip);
  addLog('system', 'info', `Başarılı giriş: "${username}" - IP: ${ip}`);
  return Response.json({ token: signToken(user), username: user.username });
}
