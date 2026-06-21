import { requireAuth, unauthorized } from '@/lib/auth';
import { getContainerLogs } from '@/lib/server/docker';
import { containerRefSchema } from '@/lib/validation';
export const runtime = 'nodejs';
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAuth(req))) return unauthorized();
  const { id } = await params;
  if (!containerRefSchema.safeParse(id).success) return Response.json({ error: 'Geçersiz konteyner' }, { status: 400 });
  const tail = Number(new URL(req.url).searchParams.get('tail') ?? 200);
  try { return Response.json({ logs: await getContainerLogs(id, tail) }); }
  catch (e: any) { return Response.json({ error: e.message }, { status: 500 }); }
}
