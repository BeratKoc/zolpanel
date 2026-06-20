import bcrypt from 'bcryptjs';
import { db, addLog } from '@/lib/server/db';
import { signToken } from '@/lib/auth';
import { loginSchema } from '@/lib/validation';
import { rateLimit, resetLimit } from '@/lib/server/rateLimit';

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
  const { username, password } = parsed.data;

  const user = await new Promise<any>((res) => db.users.findOne({ username }, (_e, u) => res(u)));
  if (!user || !(await bcrypt.compare(password, user.password))) {
    addLog('system', 'warn', `Başarısız giriş: "${username}" - IP: ${ip}`);
    return Response.json({ error: 'Geçersiz kullanıcı adı veya şifre' }, { status: 401 });
  }
  resetLimit('login:' + ip);
  addLog('system', 'info', `Başarılı giriş: "${username}" - IP: ${ip}`);
  return Response.json({ token: signToken(user), username: user.username });
}
