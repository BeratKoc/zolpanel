import { requireAuth, unauthorized } from '@/lib/auth';
import { getConnection } from '@/lib/server/dbExplorer/discover';
import { getAdapter } from '@/lib/server/dbExplorer';
import { validateColumnType, validateIdentifier } from '@/lib/server/dbExplorer/types';

export const runtime = 'nodejs';

type DdlOp = 'addColumn' | 'dropColumn' | 'renameColumn' | 'alterColumnType';
interface DdlBody {
  db?: string; schema?: string; table?: string;
  op?: DdlOp; name?: string; newName?: string;
  type?: string; nullable?: boolean; default?: string | null;
}

function bad(error: string, status = 400) { return Response.json({ error }, { status }); }

export async function GET(req: Request, { params }: { params: Promise<{ ref: string }> }) {
  if (!(await requireAuth(req))) return unauthorized();
  const { ref } = await params;
  let conn;
  try { conn = await getConnection(ref); } catch (e: unknown) { return bad((e as Error).message, 404); }
  if (conn.engine === 'redis') return bad('Redis yapı düzenlemeyi desteklemez', 400);
  try {
    const { searchParams } = new URL(req.url);
    const db = searchParams.get('db') ?? '';
    const schema = searchParams.get('schema') ?? 'public';
    const table = searchParams.get('table') ?? '';
    if (!db || !table) return bad('db ve table zorunlu');
    const adapter = getAdapter(conn.engine);
    const columns = await adapter.tableStructure(ref, db, schema, table);
    return Response.json({ columns });
  } catch (e: unknown) { return bad((e as Error).message, 500); }
}

export async function POST(req: Request, { params }: { params: Promise<{ ref: string }> }) {
  if (!(await requireAuth(req))) return unauthorized();
  const { ref } = await params;
  let conn;
  try { conn = await getConnection(ref); } catch (e: unknown) { return bad((e as Error).message, 404); }
  if (conn.engine === 'redis') return bad('Redis yapı düzenlemeyi desteklemez', 400);

  const { searchParams } = new URL(req.url);
  const writeFlag = searchParams.get('write');
  const confirmFlag = searchParams.get('confirm');

  // Harici DB salt-okunur (tüm DDL yazmadır)
  if (conn.source === 'external' && writeFlag !== '1') {
    return Response.json({ error: 'Harici DB salt-okunur — düzenlemeyi etkinleştirin' }, { status: 403 });
  }

  try {
    const body = await req.json() as DdlBody;
    const { db = '', schema = 'public', table = '', op, name = '', newName = '', type = '', nullable = true } = body;
    if (!db || !table || !op) return bad('db, table, op zorunlu');

    const engine = conn.engine as 'postgres' | 'mysql';
    const adapter = getAdapter(conn.engine);
    const existing = await adapter.tableStructure(ref, db, schema, table);
    const existingNames = new Set(existing.map((c: { name: string }) => c.name));

    // Yıkıcı op kapısı
    const destructive = op === 'dropColumn' || op === 'alterColumnType';
    if (destructive && confirmFlag !== '1') {
      const reason = op === 'dropColumn' ? 'DROP COLUMN' : 'TYPE CHANGE';
      return Response.json({ blocked: true, destructive: true, reason });
    }

    let sql: string;
    if (op === 'addColumn') {
      if (!validateIdentifier(name)) return bad('Geçersiz kolon adı');
      const t = validateColumnType(type, engine);
      if (!t) return bad('Geçersiz/izinsiz kolon tipi');
      sql = adapter.buildAddColumn(schema, table, { name, type: t, nullable, default: body.default ?? null });
    } else if (op === 'dropColumn') {
      if (!existingNames.has(name)) return bad('Kolon bulunamadı');
      sql = adapter.buildDropColumn(schema, table, name);
    } else if (op === 'renameColumn') {
      if (!existingNames.has(name)) return bad('Kolon bulunamadı');
      if (!validateIdentifier(newName)) return bad('Geçersiz yeni kolon adı');
      const cur = existing.find((c: { name: string; type: string }) => c.name === name);
      sql = adapter.buildRenameColumn(schema, table, name, newName, cur ? cur.type : '');
    } else if (op === 'alterColumnType') {
      if (!existingNames.has(name)) return bad('Kolon bulunamadı');
      const t = validateColumnType(type, engine);
      if (!t) return bad('Geçersiz/izinsiz kolon tipi');
      sql = adapter.buildAlterColumnType(schema, table, name, t, nullable);
    } else {
      return bad('Bilinmeyen op');
    }

    const result = await adapter.runSql(ref, db, sql);
    return Response.json({ result, destructive });
  } catch (e: unknown) {
    return bad((e as Error).message, 500);
  }
}
