import bcrypt from 'bcryptjs';
import { getUserByName, setUserPassword, addLog } from '@/lib/server/db';
import { requireSession, unauthorized } from '@/lib/auth';
import { changePasswordSchema } from '@/lib/validation';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const auth = await requireSession(req);
  if (!auth) return unauthorized();
  const parsed = changePasswordSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const { currentPassword, newPassword } = parsed.data;

  const user = getUserByName(auth.username);
  if (!user) return Response.json({ error: 'Kullanıcı bulunamadı' }, { status: 404 });
  if (!(await bcrypt.compare(currentPassword, user.password))) {
    return Response.json({ error: 'Mevcut şifre yanlış' }, { status: 401 });
  }
  const hash = await bcrypt.hash(newPassword, 12);
  setUserPassword(user._id!, hash, (user.tokenVersion ?? 0) + 1);
  addLog('system', 'info', `Şifre değiştirildi: "${user.username}"`);
  return Response.json({ message: 'Şifre güncellendi. Lütfen tekrar giriş yapın.' });
}
