import { requireAuth, unauthorized } from '@/lib/auth';
import { getConnection } from '@/lib/server/dbExplorer/discover';
import { getAdapter } from '@/lib/server/dbExplorer';

export const runtime = 'nodejs';

interface RowBody {
  db?: string;
  schema?: string;
  table?: string;
  values?: Record<string, string | null>;
  pk?: Record<string, string | null>;
  key?: string;
  value?: string;
}

async function checkExternalGate(
  conn: Awaited<ReturnType<typeof getConnection>>,
  req: Request
): Promise<Response | null> {
  const { searchParams } = new URL(req.url);
  if (conn.source === 'external' && searchParams.get('write') !== '1') {
    return Response.json(
      { error: 'Harici DB salt-okunur — düzenlemeyi etkinleştirin' },
      { status: 403 }
    );
  }
  return null;
}

// POST — Insert a row
export async function POST(req: Request, { params }: { params: Promise<{ ref: string }> }) {
  if (!(await requireAuth(req))) return unauthorized();
  const { ref } = await params;
  let conn;
  try {
    conn = await getConnection(ref);
  } catch (e: unknown) {
    return Response.json({ error: (e as Error).message }, { status: 404 });
  }
  const gate = await checkExternalGate(conn, req);
  if (gate) return gate;
  try {
    const body = await req.json() as RowBody;
    const adapter = getAdapter(conn.engine);

    if (conn.engine === 'redis') {
      // Redis insert: set key=value
      const { key = '', value = '' } = body;
      await adapter.setValue(ref, key, value);
      return Response.json({ ok: true });
    }

    const { db = '', schema = 'public', table = '', values = {} } = body;
    const sql = adapter.buildInsert(schema, table, values);
    const result = await adapter.runSql(ref, db, sql);
    return Response.json({ result });
  } catch (e: unknown) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

// PATCH — Update a row
export async function PATCH(req: Request, { params }: { params: Promise<{ ref: string }> }) {
  if (!(await requireAuth(req))) return unauthorized();
  const { ref } = await params;
  let conn;
  try {
    conn = await getConnection(ref);
  } catch (e: unknown) {
    return Response.json({ error: (e as Error).message }, { status: 404 });
  }
  const gate = await checkExternalGate(conn, req);
  if (gate) return gate;
  try {
    const body = await req.json() as RowBody;
    const adapter = getAdapter(conn.engine);

    if (conn.engine === 'redis') {
      // Redis update: set key=value (same as insert)
      const { key = '', value = '' } = body;
      await adapter.setValue(ref, key, value);
      return Response.json({ ok: true });
    }

    const { db = '', schema = 'public', table = '', values = {}, pk = {} } = body;
    const sql = adapter.buildUpdate(schema, table, values, pk);
    const result = await adapter.runSql(ref, db, sql);
    return Response.json({ result });
  } catch (e: unknown) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

// DELETE — Delete a row
export async function DELETE(req: Request, { params }: { params: Promise<{ ref: string }> }) {
  if (!(await requireAuth(req))) return unauthorized();
  const { ref } = await params;
  let conn;
  try {
    conn = await getConnection(ref);
  } catch (e: unknown) {
    return Response.json({ error: (e as Error).message }, { status: 404 });
  }
  const gate = await checkExternalGate(conn, req);
  if (gate) return gate;
  try {
    const body = await req.json() as RowBody;
    const adapter = getAdapter(conn.engine);

    if (conn.engine === 'redis') {
      // Redis delete: del key
      const { key = '' } = body;
      await adapter.deleteKey(ref, key);
      return Response.json({ ok: true });
    }

    const { db = '', schema = 'public', table = '', pk = {} } = body;
    const sql = adapter.buildDelete(schema, table, pk);
    const result = await adapter.runSql(ref, db, sql);
    return Response.json({ result });
  } catch (e: unknown) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
