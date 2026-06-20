import { requireAuth, unauthorized } from '@/lib/auth';
import { deleteProcess } from '@/lib/server/pm2';
import { processNameSchema } from '@/lib/validation';

export const runtime = 'nodejs';

// Process sil
export async function DELETE(req: Request, { params }: { params: Promise<{ name: string }> }) {
  if (!(await requireAuth(req))) return unauthorized();
  const { name } = await params;
  if (!processNameSchema.safeParse(name).success) {
    return Response.json({ error: 'Geçersiz process adı' }, { status: 400 });
  }
  try {
    await deleteProcess(name);
    return Response.json({ message: `${name} silindi` });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
