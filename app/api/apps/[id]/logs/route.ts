import { requireAuth, unauthorized } from '@/lib/auth';
import { getAppById } from '@/lib/server/db';
import { getContainerLogs } from '@/lib/server/docker';

export const runtime = 'nodejs';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAuth(req))) return unauthorized();
  const { id } = await params;
  const app = getAppById(id);
  if (!app) return Response.json({ error: 'App bulunamadı' }, { status: 404 });

  const url = new URL(req.url);
  const tail = url.searchParams.get('tail');
  const tailNum = tail ? parseInt(tail, 10) : 200;

  try {
    const logs = await getContainerLogs(app.name, tailNum);
    return Response.json({ logs });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
