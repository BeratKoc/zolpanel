import { requireAuth, unauthorized } from '@/lib/auth';
import { getConnection } from '@/lib/server/dbExplorer/discover';
import { getAdapter } from '@/lib/server/dbExplorer';

export const runtime = 'nodejs';

export async function GET(req: Request, { params }: { params: Promise<{ ref: string }> }) {
  if (!(await requireAuth(req))) return unauthorized();
  const { ref } = await params;
  let conn;
  try {
    conn = await getConnection(ref);
  } catch (e: unknown) {
    return Response.json({ error: (e as Error).message }, { status: 404 });
  }
  if (conn.engine === 'redis') {
    return Response.json({ error: 'Redis ER diyagramını desteklemez' }, { status: 400 });
  }
  try {
    const { searchParams } = new URL(req.url);
    const db = searchParams.get('db') ?? '';
    const schema = searchParams.get('schema') ?? 'public';
    if (!db) return Response.json({ error: 'db parametresi zorunlu' }, { status: 400 });
    const adapter = getAdapter(conn.engine);
    const model = await adapter.erModel(ref, db, schema);
    return Response.json(model);
  } catch (e: unknown) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
