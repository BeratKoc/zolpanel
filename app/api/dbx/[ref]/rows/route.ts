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
  try {
    const { searchParams } = new URL(req.url);
    const adapter = getAdapter(conn.engine);

    if (conn.engine === 'redis') {
      const key = searchParams.get('key');
      if (!key) return Response.json({ error: 'key parametresi zorunlu' }, { status: 400 });
      const result = await adapter.getValue(ref, key);
      return Response.json(result);
    }

    // postgres or mysql
    const db = searchParams.get('db') ?? '';
    const schema = searchParams.get('schema') ?? 'public';
    const table = searchParams.get('table') ?? '';
    const limitParam = searchParams.get('limit');
    const offsetParam = searchParams.get('offset');
    const limit = Math.max(1, Math.min(500, (limitParam && parseInt(limitParam, 10)) || 50));
    const offset = Math.max(0, (offsetParam && parseInt(offsetParam, 10)) || 0);

    if (!db || !table) {
      return Response.json({ error: 'db ve table parametreleri zorunlu' }, { status: 400 });
    }

    const result = await adapter.getRows(ref, db, schema, table, { limit, offset });
    return Response.json(result);
  } catch (e: unknown) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
