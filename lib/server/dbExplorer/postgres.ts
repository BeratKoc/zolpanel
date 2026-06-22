import { dbExec } from './exec';
import { parseCsv, type QueryResult } from './types';

// ---------------------------------------------------------------------------
// Bağlantı kullanıcısı/DB'si — harici (compose) konteynerlerde superuser
// 'postgres' OLMAYABİLİR (POSTGRES_USER). Konteyner env'inden çöz, cache'le.
// ---------------------------------------------------------------------------
const userCache = new Map<string, string>();
async function pgUser(ref: string): Promise<string> {
  const cached = userCache.get(ref);
  if (cached) return cached;
  let u = 'postgres';
  try { const o = (await dbExec(ref, ['printenv', 'POSTGRES_USER'])).trim(); if (o) u = o; } catch { /* fallback */ }
  userCache.set(ref, u);
  return u;
}
async function pgDefaultDb(ref: string): Promise<string> {
  try { const o = (await dbExec(ref, ['printenv', 'POSTGRES_DB'])).trim(); if (o) return o; } catch { /* fallback */ }
  return pgUser(ref); // POSTGRES_DB varsayılanı POSTGRES_USER'dır
}
// Temel psql argümanları: çözülen kullanıcı + (verilirse) db, yoksa varsayılan db.
async function psqlBase(ref: string, db?: string): Promise<string[]> {
  return ['psql', '-U', await pgUser(ref), '-d', db || (await pgDefaultDb(ref))];
}

// ---------------------------------------------------------------------------
// Pure SQL escape helpers (exported for testing)
// ---------------------------------------------------------------------------

/** Wraps an identifier in double-quotes and escapes embedded double-quotes. */
export function pgIdent(s: string): string {
  return '"' + s.replace(/"/g, '""') + '"';
}

/** Returns NULL for null/undefined; otherwise wraps the value in single-quotes
 *  and escapes embedded single-quotes. */
export function pgLiteral(v: string | null | undefined): string {
  if (v === null || v === undefined) return 'NULL';
  return "'" + String(v).replace(/'/g, "''") + "'";
}

// ---------------------------------------------------------------------------
// DDL builders (exported for testing)
// ---------------------------------------------------------------------------

export function buildAddColumn(
  schema: string,
  table: string,
  col: { name: string; type: string; nullable: boolean; default?: string | null },
): string {
  let s = `ALTER TABLE ${pgIdent(schema)}.${pgIdent(table)} ADD COLUMN ${pgIdent(col.name)} ${col.type}`;
  if (!col.nullable) s += ' NOT NULL';
  if (col.default !== undefined && col.default !== null && col.default !== '') {
    s += ` DEFAULT ${pgLiteral(col.default)}`;
  }
  return s;
}

export function buildDropColumn(schema: string, table: string, name: string): string {
  return `ALTER TABLE ${pgIdent(schema)}.${pgIdent(table)} DROP COLUMN ${pgIdent(name)}`;
}

// currentType pg'de kullanılmaz (RENAME COLUMN); imza uyumu için alınır.
export function buildRenameColumn(
  schema: string, table: string, oldName: string, newName: string, _currentType: string,
): string {
  return `ALTER TABLE ${pgIdent(schema)}.${pgIdent(table)} RENAME COLUMN ${pgIdent(oldName)} TO ${pgIdent(newName)}`;
}

export function buildAlterColumnType(
  schema: string, table: string, name: string, newType: string, nullable: boolean,
): string {
  const nn = nullable ? 'DROP NOT NULL' : 'SET NOT NULL';
  return `ALTER TABLE ${pgIdent(schema)}.${pgIdent(table)} ALTER COLUMN ${pgIdent(name)} TYPE ${newType}, ALTER COLUMN ${pgIdent(name)} ${nn}`;
}

// ---------------------------------------------------------------------------
// Sort/filter SQL builders (exported for testing)
// ---------------------------------------------------------------------------

const PG_COMPARATORS: Record<Exclude<import('./types').FilterOp, 'contains'>, string> = {
  eq: '=', neq: '<>', gt: '>', lt: '<', gte: '>=', lte: '<=',
};

/** ORDER BY cümlesi (baştaki boşlukla) veya geçerli kolon yoksa ''. */
export function buildOrderBy(
  orderBy: string | undefined,
  orderDir: string | undefined,
  validCols: string[],
): string {
  if (!orderBy || !validCols.includes(orderBy)) return '';
  const dir = orderDir === 'desc' ? 'DESC' : 'ASC';
  return ` ORDER BY ${pgIdent(orderBy)} ${dir}`;
}

/** WHERE cümlesi (baştaki boşlukla); geçerli koşul yoksa ''. */
export function buildWhere(
  filters: import('./types').FilterCond[] | undefined,
  validCols: string[],
): string {
  if (!filters || filters.length === 0) return '';
  const clauses = filters
    .filter(f => validCols.includes(f.col) && f.value !== '')
    .map(f =>
      f.op === 'contains'
        ? `${pgIdent(f.col)} ILIKE ${pgLiteral('%' + f.value + '%')}`
        : `${pgIdent(f.col)} ${PG_COMPARATORS[f.op]} ${pgLiteral(f.value)}`,
    );
  return clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '';
}

// ---------------------------------------------------------------------------
// SQL builder helpers (exported for testing)
// ---------------------------------------------------------------------------

export function buildUpdate(
  schema: string,
  table: string,
  set: Record<string, string | null>,
  where: Record<string, string | null>
): string {
  const setClauses = Object.entries(set)
    .map(([k, v]) => `${pgIdent(k)}=${pgLiteral(v)}`)
    .join(', ');
  const whereClauses = Object.entries(where)
    .map(([k, v]) => `${pgIdent(k)}=${pgLiteral(v)}`)
    .join(' AND ');
  return `UPDATE ${pgIdent(schema)}.${pgIdent(table)} SET ${setClauses} WHERE ${whereClauses}`;
}

export function buildInsert(
  schema: string,
  table: string,
  values: Record<string, string | null>
): string {
  const cols = Object.keys(values).map(pgIdent).join(',');
  const vals = Object.values(values).map(pgLiteral).join(',');
  return `INSERT INTO ${pgIdent(schema)}.${pgIdent(table)} (${cols}) VALUES (${vals})`;
}

export function buildDelete(
  schema: string,
  table: string,
  where: Record<string, string | null>
): string {
  const whereClauses = Object.entries(where)
    .map(([k, v]) => `${pgIdent(k)}=${pgLiteral(v)}`)
    .join(' AND ');
  return `DELETE FROM ${pgIdent(schema)}.${pgIdent(table)} WHERE ${whereClauses}`;
}

// ---------------------------------------------------------------------------
// Adapter operations
// ---------------------------------------------------------------------------

/** Lists all non-template, connectable databases in the Postgres instance. */
async function listDatabases(ref: string): Promise<string[]> {
  const base = await psqlBase(ref);
  const out = await dbExec(ref, [
    ...base, '-tAc',
    'SELECT datname FROM pg_database WHERE datistemplate=false AND datallowconn',
  ]);
  return out.split('\n').map(l => l.trim()).filter(l => l.length > 0);
}

/** Lists tables in a database, excluding system schemas. */
async function listTables(ref: string, db: string): Promise<{ schema: string; table: string }[]> {
  // CSV ile şema+tablo'yu AYRI kolon al — nokta içeren adlar bozulmasın.
  const base = await psqlBase(ref, db);
  const out = await dbExec(ref, [
    ...base, '--csv', '-c',
    "SELECT table_schema, table_name FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema') ORDER BY 1, 2",
  ]);
  const rows = parseCsv(out);
  return rows.slice(1).filter(r => r.length >= 2).map(r => ({ schema: r[0], table: r[1] }));
}

/** Bir tablonun kolon adlarını sıralı döner (sort/filter doğrulaması için). */
async function columns(ref: string, db: string, schema: string, table: string): Promise<string[]> {
  const sql = `SELECT column_name FROM information_schema.columns WHERE table_schema=${pgLiteral(schema)} AND table_name=${pgLiteral(table)} ORDER BY ordinal_position`;
  const out = await dbExec(ref, [...(await psqlBase(ref, db)), '-tAc', sql]);
  return out.split('\n').map(l => l.trim()).filter(l => l.length > 0);
}

async function tableStructure(
  ref: string, db: string, schema: string, table: string,
): Promise<import('./types').ColumnDef[]> {
  const sql = `SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema=${pgLiteral(schema)} AND table_name=${pgLiteral(table)} ORDER BY ordinal_position`;
  const out = await dbExec(ref, [...(await psqlBase(ref, db)), '--csv', '-c', sql]);
  const rows = parseCsv(out.trim());
  if (rows.length <= 1) return [];
  const pks = new Set(await pkColumns(ref, db, schema, table));
  return rows.slice(1).map(r => ({
    name: r[0], type: r[1], nullable: r[2] === 'YES', default: r[3] || null, isPk: pks.has(r[0]),
  }));
}

/** Fetches rows from a table with pagination, optional sort and filter. */
async function getRows(
  ref: string,
  db: string,
  schema: string,
  table: string,
  opts: import('./types').GetRowsOpts,
): Promise<QueryResult> {
  const clampedLimit = Math.max(1, Math.min(500, opts.limit));
  const clampedOffset = Math.max(0, opts.offset);

  let where = '';
  let orderBy = '';
  if ((opts.filters && opts.filters.length) || opts.orderBy) {
    const cols = await columns(ref, db, schema, table);
    where = buildWhere(opts.filters, cols);
    orderBy = buildOrderBy(opts.orderBy, opts.orderDir, cols);
  }

  const sql = `SELECT * FROM ${pgIdent(schema)}.${pgIdent(table)}${where}${orderBy} LIMIT ${clampedLimit} OFFSET ${clampedOffset}`;
  const out = await dbExec(ref, [...(await psqlBase(ref, db)), '--csv', '-c', sql]);
  const rows = parseCsv(out.trim());
  if (rows.length === 0) {
    return { columns: [], rows: [], rowCount: 0 };
  }
  return { columns: rows[0], rows: rows.slice(1), rowCount: rows.length - 1 };
}

/** Runs arbitrary SQL and returns results in QueryResult format. */
async function runSql(ref: string, db: string, sql: string): Promise<QueryResult> {
  const out = await dbExec(ref, [...(await psqlBase(ref, db)), '--csv', '-c', sql]);
  const rows = parseCsv(out.trim());
  if (rows.length === 0) {
    return { columns: [], rows: [], rowCount: 0 };
  }
  // Non-SELECT statements may produce no columns row
  if (rows.length === 1 && rows[0].length === 1 && rows[0][0] === '') {
    return { columns: [], rows: [], rowCount: 0 };
  }
  return {
    columns: rows[0],
    rows: rows.slice(1),
    rowCount: rows.length - 1,
  };
}

async function erModel(ref: string, db: string, schema: string): Promise<import('./types').ErModel> {
  const base = await psqlBase(ref, db);
  const lit = pgLiteral(schema);
  const colsSql = `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema=${lit} ORDER BY table_name, ordinal_position`;
  const pkSql = `SELECT tc.table_name, kcu.column_name FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name=kcu.constraint_name AND tc.table_schema=kcu.table_schema WHERE tc.constraint_type='PRIMARY KEY' AND tc.table_schema=${lit}`;
  const fkSql = `SELECT tc.table_name AS from_t, kcu.column_name AS from_c, ccu.table_name AS to_t, ccu.column_name AS to_c FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name=kcu.constraint_name AND tc.table_schema=kcu.table_schema JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name=tc.constraint_name AND ccu.table_schema=tc.table_schema WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_schema=${lit}`;
  const [colsOut, pkOut, fkOut] = await Promise.all([
    dbExec(ref, [...base, '--csv', '-c', colsSql]),
    dbExec(ref, [...base, '--csv', '-c', pkSql]),
    dbExec(ref, [...base, '--csv', '-c', fkSql]),
  ]);
  const { assembleErModel } = await import('./types');
  return assembleErModel(parseCsv(colsOut.trim()), parseCsv(pkOut.trim()), parseCsv(fkOut.trim()));
}

/** Returns the primary key column names for a table. */
async function pkColumns(
  ref: string,
  db: string,
  schema: string,
  table: string
): Promise<string[]> {
  const sql = [
    'SELECT kcu.column_name',
    'FROM information_schema.table_constraints tc',
    'JOIN information_schema.key_column_usage kcu',
    '  ON tc.constraint_name = kcu.constraint_name',
    '  AND tc.table_schema = kcu.table_schema',
    '  AND tc.table_name = kcu.table_name',
    `WHERE tc.constraint_type = 'PRIMARY KEY'`,
    `  AND tc.table_schema = ${pgLiteral(schema)}`,
    `  AND tc.table_name = ${pgLiteral(table)}`,
    'ORDER BY kcu.ordinal_position',
  ].join(' ');

  const out = await dbExec(ref, [...(await psqlBase(ref, db)), '-tAc', sql]);
  return out.split('\n').map(l => l.trim()).filter(l => l.length > 0);
}

// ---------------------------------------------------------------------------
// Adapter export
// ---------------------------------------------------------------------------

export const postgresAdapter = {
  listDatabases,
  listTables,
  columns,
  getRows,
  runSql,
  pkColumns,
  buildUpdate,
  buildInsert,
  buildDelete,
  tableStructure,
  erModel,
};
