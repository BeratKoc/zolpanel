import { requireAuth, unauthorized } from '@/lib/auth';
import { restoreBackup } from '@/lib/server/backup';

export const runtime = 'nodejs';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  if (!(await requireAuth(req))) return unauthorized();
  const { name } = await params;
  try {
    await restoreBackup(name);
    return Response.json({ message: 'Geri yükleme başladı, panel yeniden başlatılıyor' });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: e.message.includes('geçersiz') ? 400 : 500 });
  }
}
