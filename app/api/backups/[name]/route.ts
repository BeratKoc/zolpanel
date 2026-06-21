import { requireAuth, unauthorized } from '@/lib/auth';
import { deleteBackup } from '@/lib/server/backup';

export const runtime = 'nodejs';

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  if (!(await requireAuth(req))) return unauthorized();
  const { name } = await params;
  try {
    deleteBackup(name);
    return Response.json({ message: 'Yedek silindi' });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}
