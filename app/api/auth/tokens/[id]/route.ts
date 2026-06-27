import { requireSession, unauthorized } from '@/lib/auth';
import { deleteApiToken } from '@/lib/server/db';

export const runtime = 'nodejs';

// DELETE /api/auth/tokens/[id] → { ok: true }
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSession(req);
  if (!auth) return unauthorized();
  const { id } = await params;
  deleteApiToken(id);
  return Response.json({ ok: true });
}
