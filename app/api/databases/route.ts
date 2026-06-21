import { requireAuth, unauthorized } from '@/lib/auth';
import { listDatabases, createDatabase } from '@/lib/server/databases';
import { createDatabaseSchema } from '@/lib/validation';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  if (!(await requireAuth(req))) return unauthorized();
  const rows = await listDatabases();
  return Response.json(rows.map(({ password, ...r }) => r)); // şifreyi listede verme
}

export async function POST(req: Request) {
  if (!(await requireAuth(req))) return unauthorized();
  const body = await req.json().catch(() => ({}));
  const p = createDatabaseSchema.safeParse(body);
  if (!p.success) return Response.json({ error: 'Geçersiz istek' }, { status: 400 });
  try {
    const db = await createDatabase(p.data.engine, p.data.name);
    return Response.json({ ...db, password: undefined });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
