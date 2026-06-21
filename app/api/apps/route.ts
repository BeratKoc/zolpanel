import { requireAuth, unauthorized } from '@/lib/auth';
import { listApps, createApp } from '@/lib/server/gitDeploy';
import { createAppSchema } from '@/lib/validation';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  if (!(await requireAuth(req))) return unauthorized();
  return Response.json(await listApps());
}

export async function POST(req: Request) {
  if (!(await requireAuth(req))) return unauthorized();
  const parsed = createAppSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const app = await createApp(parsed.data);
  return Response.json(app, { status: 201 });
}
