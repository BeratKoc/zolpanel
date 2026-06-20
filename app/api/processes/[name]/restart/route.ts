import { requireAuth, unauthorized } from '@/lib/auth';
import { restartProcess } from '@/lib/server/pm2';
import { processNameSchema } from '@/lib/validation';

export const runtime = 'nodejs';

// Process yeniden başlat
export async function POST(req: Request, { params }: { params: Promise<{ name: string }> }) {
  if (!(await requireAuth(req))) return unauthorized();
  const { name } = await params;
  if (!processNameSchema.safeParse(name).success) {
    return Response.json({ error: 'Geçersiz process adı' }, { status: 400 });
  }
  try {
    await restartProcess(name);
    return Response.json({ message: `${name} yeniden başlatıldı` });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
