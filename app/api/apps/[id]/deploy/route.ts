import { requireAuth, unauthorized } from '@/lib/auth';
import { deployApp } from '@/lib/server/gitDeploy';

export const runtime = 'nodejs';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAuth(req))) return unauthorized();
  const { id } = await params;
  try {
    await deployApp(id);
    return Response.json({ message: 'deploy tamam' });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
