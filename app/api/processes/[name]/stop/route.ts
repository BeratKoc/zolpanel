import { requireAuth, unauthorized } from '@/lib/auth';
import { stopProcess } from '@/lib/server/pm2';
import { processNameSchema } from '@/lib/validation';

export const runtime = 'nodejs';

// Process durdur
export async function POST(req: Request, { params }: { params: Promise<{ name: string }> }) {
  if (!(await requireAuth(req))) return unauthorized();
  const { name } = await params;
  if (!processNameSchema.safeParse(name).success) {
    return Response.json({ error: 'Geçersiz process adı' }, { status: 400 });
  }
  try {
    await stopProcess(name);
    return Response.json({ message: `${name} durduruldu` });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
