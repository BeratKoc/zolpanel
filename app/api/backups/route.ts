import { requireAuth, unauthorized } from '@/lib/auth';
import { listBackups, createBackup } from '@/lib/server/backup';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  if (!(await requireAuth(req))) return unauthorized();
  return Response.json(listBackups());
}

export async function POST(req: Request) {
  if (!(await requireAuth(req))) return unauthorized();
  try {
    return Response.json(await createBackup());
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
