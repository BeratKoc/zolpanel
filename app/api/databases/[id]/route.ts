import { requireAuth, unauthorized } from '@/lib/auth';
import { getDatabaseById } from '@/lib/server/db';
import { buildConnectionString, removeDatabase } from '@/lib/server/databases';

export const runtime = 'nodejs';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAuth(req))) return unauthorized();
  const { id } = await params;
  const db = await getDatabaseById(id);
  if (!db) return Response.json({ error: 'Bulunamadı' }, { status: 404 });
  return Response.json({ ...db, connectionString: buildConnectionString(db) });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAuth(req))) return unauthorized();
  const { id } = await params;
  const withVolume = new URL(req.url).searchParams.get('volume') === '1';
  try {
    await removeDatabase(id, withVolume);
    return Response.json({ message: 'silindi' });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
