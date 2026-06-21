import { dbExec } from './exec';
import { parseCsv, type QueryResult } from './types';

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
  const out = await dbExec(ref, [
    'psql', '-U', 'postgres', '-tAc',
    'SELECT datname FROM pg_database WHERE datistemplate=false AND datallowconn',
  ]);
  return out.split('\n').map(l => l.trim()).filter(l => l.length > 0);
}

/** Lists tables in a database, excluding system schemas. */
async function listTables(ref: string, db: string): Promise<{ schema: string; table: string }[]> {
  // CSV ile şema+tablo'yu AYRI kolon al — nokta içeren adlar bozulmasın.
  const out = await dbExec(ref, [
    'psql', '-U', 'postgres', '-d', db, '--csv', '-c',
    "SELECT table_schema, table_name FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema') ORDER BY 1, 2",
  ]);
  const rows = parseCsv(out);
  return rows.slice(1).filter(r => r.length >= 2).map(r => ({ schema: r[0], table: r[1] }));
}

/** Fetches rows from a table with pagination. */
async function getRows(
  ref: string,
  db: string,
  schema: string,
  table: string,
  { limit, offset }: { limit: number; offset: number }
): Promise<QueryResult> {
  // Clamp values
  const clampedLimit = Math.max(1, Math.min(500, limit));
  const clampedOffset = Math.max(0, offset);

  const sql = `SELECT * FROM ${pgIdent(schema)}.${pgIdent(table)} LIMIT ${clampedLimit} OFFSET ${clampedOffset}`;
  const out = await dbExec(ref, ['psql', '-U', 'postgres', '-d', db, '--csv', '-c', sql]);
  const rows = parseCsv(out.trim());
  if (rows.length === 0) {
    return { columns: [], rows: [], rowCount: 0 };
  }
  return {
    columns: rows[0],
    rows: rows.slice(1),
    rowCount: rows.length - 1,
  };
}

/** Runs arbitrary SQL and returns results in QueryResult format. */
async function runSql(ref: string, db: string, sql: string): Promise<QueryResult> {
  const out = await dbExec(ref, ['psql', '-U', 'postgres', '-d', db, '--csv', '-c', sql]);
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

  const out = await dbExec(ref, ['psql', '-U', 'postgres', '-d', db, '-tAc', sql]);
  return out.split('\n').map(l => l.trim()).filter(l => l.length > 0);
}

// ---------------------------------------------------------------------------
// Adapter export
// ---------------------------------------------------------------------------

export const postgresAdapter = {
  listDatabases,
  listTables,
  getRows,
  runSql,
  pkColumns,
  buildUpdate,
  buildInsert,
  buildDelete,
};
