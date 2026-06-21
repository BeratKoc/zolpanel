import { requireAuth, unauthorized } from '@/lib/auth';
import { getConnection } from '@/lib/server/dbExplorer/discover';
import { getAdapter } from '@/lib/server/dbExplorer';
import { classifySql, isWriteSql } from '@/lib/server/dbExplorer/safety';

export const runtime = 'nodejs';

export async function POST(req: Request, { params }: { params: Promise<{ ref: string }> }) {
  if (!(await requireAuth(req))) return unauthorized();
  const { ref } = await params;
  let conn;
  try {
    conn = await getConnection(ref);
  } catch (e: unknown) {
    return Response.json({ error: (e as Error).message }, { status: 404 });
  }
  if (conn.engine === 'redis') {
    return Response.json(
      { error: 'Redis SQL konsolunu desteklemez; anahtar tarayıcıyı kullanın' },
      { status: 400 }
    );
  }
  try {
    const { searchParams } = new URL(req.url);
    const writeFlag = searchParams.get('write');
    const confirmFlag = searchParams.get('confirm');
    const body = await req.json() as { db?: string; sql?: string };
    const { db = '', sql = '' } = body;

    const write = isWriteSql(sql);
    const { destructive, reason } = classifySql(sql);

    // External DB read-only gate
    if (conn.source === 'external' && write && writeFlag !== '1') {
      return Response.json(
        { error: 'Harici DB salt-okunur — düzenlemeyi etkinleştirin' },
        { status: 403 }
      );
    }

    // Destructive confirmation gate
    if (destructive && confirmFlag !== '1') {
      return Response.json({ blocked: true, destructive: true, reason });
    }

    const adapter = getAdapter(conn.engine);
    const result = await adapter.runSql(ref, db, sql);
    return Response.json({ result, destructive });
  } catch (e: unknown) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
