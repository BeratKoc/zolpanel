import { requireAuth, unauthorized } from '@/lib/auth';
export const runtime = 'nodejs';
export async function GET(req: Request) {
  const user = await requireAuth(req);
  if (!user) return unauthorized('Geçersiz veya süresi dolmuş token');
  return Response.json({ valid: true, username: user.username });
}
