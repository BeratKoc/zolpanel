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
    const db = searchParams.get('db') ?? undefined;
    const adapter = getAdapter(conn.engine);

    if (conn.engine === 'redis') {
      const match = searchParams.get('match') ?? undefined;
      const countParam = searchParams.get('count');
      const count = countParam ? parseInt(countParam, 10) : undefined;
      const keys = await adapter.listKeys(ref, { match, count });
      return Response.json({ keys });
    }

    // postgres or mysql
    if (!db) {
      const databases = await adapter.listDatabases(ref);
      return Response.json({ databases });
    }
    const tables = await adapter.listTables(ref, db);
    return Response.json({ tables });
  } catch (e: unknown) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
