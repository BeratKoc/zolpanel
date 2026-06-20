import bcrypt from 'bcryptjs';
import { db, addLog } from '@/lib/server/db';
import { requireAuth, unauthorized } from '@/lib/auth';
import { changePasswordSchema } from '@/lib/validation';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (!auth) return unauthorized();
  const parsed = changePasswordSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const { currentPassword, newPassword } = parsed.data;

  const user = await new Promise<any>((res) => db.users.findOne({ username: auth.username }, (_e, u) => res(u)));
  if (!user) return Response.json({ error: 'Kullanıcı bulunamadı' }, { status: 404 });
  if (!(await bcrypt.compare(currentPassword, user.password))) {
    return Response.json({ error: 'Mevcut şifre yanlış' }, { status: 401 });
  }
  const hash = await bcrypt.hash(newPassword, 12);
  await new Promise<void>((res) =>
    db.users.update({ _id: user._id }, { $set: { password: hash, tokenVersion: (user.tokenVersion ?? 0) + 1 } }, {}, () => res()),
  );
  addLog('system', 'info', `Şifre değiştirildi: "${user.username}"`);
  return Response.json({ message: 'Şifre güncellendi. Lütfen tekrar giriş yapın.' });
}
