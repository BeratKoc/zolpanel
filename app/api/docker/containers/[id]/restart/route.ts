import { requireAuth, unauthorized } from '@/lib/auth';
import { restartContainer } from '@/lib/server/docker';
import { containerRefSchema } from '@/lib/validation';
export const runtime = 'nodejs';
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAuth(req))) return unauthorized();
  const { id } = await params;
  if (!containerRefSchema.safeParse(id).success) return Response.json({ error: 'Geçersiz konteyner' }, { status: 400 });
  try { await restartContainer(id); return Response.json({ message: 'yeniden başlatıldı' }); }
  catch (e: any) { return Response.json({ error: e.message }, { status: 500 }); }
}
