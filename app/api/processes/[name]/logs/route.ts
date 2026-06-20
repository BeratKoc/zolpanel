import { requireAuth, unauthorized } from '@/lib/auth';
import { getProcessLogs } from '@/lib/server/pm2';
import { processNameSchema } from '@/lib/validation';

export const runtime = 'nodejs';

// Process logları
export async function GET(req: Request, { params }: { params: Promise<{ name: string }> }) {
  if (!(await requireAuth(req))) return unauthorized();
  const { name } = await params;
  if (!processNameSchema.safeParse(name).success) {
    return Response.json({ error: 'Geçersiz process adı' }, { status: 400 });
  }
  const lines = parseInt(new URL(req.url).searchParams.get('lines') || '') || 100;
  try {
    const logs = await getProcessLogs(name, lines);
    return Response.json({ logs });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
