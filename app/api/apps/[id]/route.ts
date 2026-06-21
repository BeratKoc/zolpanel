import { requireAuth, unauthorized } from '@/lib/auth';
import { getAppById } from '@/lib/server/db';
import { removeApp } from '@/lib/server/gitDeploy';

export const runtime = 'nodejs';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAuth(req))) return unauthorized();
  const { id } = await params;
  const app = getAppById(id);
  if (!app) return Response.json({ error: 'App bulunamadı' }, { status: 404 });
  return Response.json(app);
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAuth(req))) return unauthorized();
  const { id } = await params;
  try {
    await removeApp(id);
    return Response.json({ message: 'App silindi' });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
