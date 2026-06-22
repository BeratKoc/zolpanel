import { dbExec } from './exec';
import { parseTsv, type QueryResult } from './types';
import { getAllDatabases } from '../db';

// ---------------------------------------------------------------------------
// Pure SQL escape helpers (exported for testing)
// ---------------------------------------------------------------------------

/** Wraps an identifier in backticks and escapes embedded backticks. */
export function myIdent(s: string): string {
  return '`' + s.replace(/`/g, '``') + '`';
}

/** Returns NULL for null/undefined; otherwise wraps the value in single-quotes,
 *  doubles embedded single-quotes and escapes backslashes. */
export function myLiteral(v: string | null | undefined): string {
  if (v === null || v === undefined) return 'NULL';
  const escaped = String(v)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "''");
  return "'" + escaped + "'";
}

// ---------------------------------------------------------------------------
// Sort/filter SQL builders (exported for testing)
// ---------------------------------------------------------------------------

const MY_COMPARATORS: Record<Exclude<import('./types').FilterOp, 'contains'>, string> = {
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
  return ` ORDER BY ${myIdent(orderBy)} ${dir}`;
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
        ? `${myIdent(f.col)} LIKE ${myLiteral('%' + f.value + '%')}`
        : `${myIdent(f.col)} ${MY_COMPARATORS[f.op]} ${myLiteral(f.value)}`,
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
    .map(([k, v]) => `${myIdent(k)}=${myLiteral(v)}`)
    .join(', ');
  const whereClauses = Object.entries(where)
    .map(([k, v]) => `${myIdent(k)}=${myLiteral(v)}`)
    .join(' AND ');
  return `UPDATE ${myIdent(schema)}.${myIdent(table)} SET ${setClauses} WHERE ${whereClauses}`;
}

export function buildInsert(
  schema: string,
  table: string,
  values: Record<string, string | null>
): string {
  const cols = Object.keys(values).map(myIdent).join(',');
  const vals = Object.values(values).map(myLiteral).join(',');
  return `INSERT INTO ${myIdent(schema)}.${myIdent(table)} (${cols}) VALUES (${vals})`;
}

export function buildDelete(
  schema: string,
  table: string,
  where: Record<string, string | null>
): string {
  const whereClauses = Object.entries(where)
    .map(([k, v]) => `${myIdent(k)}=${myLiteral(v)}`)
    .join(' AND ');
  return `DELETE FROM ${myIdent(schema)}.${myIdent(table)} WHERE ${whereClauses}`;
}

// ---------------------------------------------------------------------------
// Password resolution
// ---------------------------------------------------------------------------

const SYSTEM_SCHEMAS = new Set(['information_schema', 'performance_schema', 'mysql', 'sys']);

/** Resolves the MySQL root password for a container.
 *  1. Tries MYSQL_ROOT_PASSWORD env var inside the container.
 *  2. Falls back to panel-stored password via getAllDatabases().
 *  3. Throws if neither is found. */
async function rootPassword(ref: string): Promise<string> {
  try {
    const pw = (await dbExec(ref, ['printenv', 'MYSQL_ROOT_PASSWORD'])).trim();
    if (pw) return pw;
  } catch {
    // container may not have the env var set; fall through
  }

  const stored = getAllDatabases().find(d => d.name === ref)?.password;
  if (stored) return stored;

  throw new Error('MySQL kimlik bilgisi bulunamadı');
}

// ---------------------------------------------------------------------------
// Query helper
// ---------------------------------------------------------------------------

async function query(ref: string, sql: string, db?: string): Promise<(string | null)[][]> {
  const pw = await rootPassword(ref);
  const argv = db
    ? ['mysql', '-uroot', '--batch', '--raw', '-D', db, '-e', sql]
    : ['mysql', '-uroot', '--batch', '--raw', '-e', sql];
  const out = await dbExec(ref, argv, { MYSQL_PWD: pw });
  return parseTsv(out.trim());
}

// ---------------------------------------------------------------------------
// Adapter operations
// ---------------------------------------------------------------------------

/** Lists all user databases, filtering out system schemas. */
async function listDatabases(ref: string): Promise<string[]> {
  const rows = await query(ref, 'SHOW DATABASES');
  // rows[0] is header "Database", rest are values
  return rows
    .slice(1)
    .map(r => (r[0] ?? '').toString())
    .filter(name => name.length > 0 && !SYSTEM_SCHEMAS.has(name));
}

/** Lists tables in a database. In MySQL, schema === db. */
async function listTables(ref: string, db: string): Promise<{ schema: string; table: string }[]> {
  const rows = await query(ref, `SHOW TABLES FROM ${myIdent(db)}`);
  // rows[0] is header, rest are table names
  return rows
    .slice(1)
    .map(r => r[0] ?? '')
    .filter(name => typeof name === 'string' && name.length > 0)
    .map(name => ({ schema: db, table: name as string }));
}

/** Bir tablonun kolon adlarını döner (sort/filter doğrulaması için). MySQL'de schema === db. */
async function columns(ref: string, db: string, _schema: string, table: string): Promise<string[]> {
  const rows = await query(ref, `SHOW COLUMNS FROM ${myIdent(db)}.${myIdent(table)}`);
  if (rows.length <= 1) return [];
  // header: Field Type Null Key Default Extra → Field = kolon 0
  return rows.slice(1).map(r => r[0] ?? '').filter(n => typeof n === 'string' && n.length > 0) as string[];
}

/** Fetches rows from a table with pagination, optional sort and filter. */
async function getRows(
  ref: string,
  db: string,
  _schema: string,
  table: string,
  opts: import('./types').GetRowsOpts,
): Promise<QueryResult> {
  const clampedLimit = Math.max(1, Math.min(500, opts.limit));
  const clampedOffset = Math.max(0, opts.offset);

  let where = '';
  let orderBy = '';
  if ((opts.filters && opts.filters.length) || opts.orderBy) {
    const cols = await columns(ref, db, _schema, table);
    where = buildWhere(opts.filters, cols);
    orderBy = buildOrderBy(opts.orderBy, opts.orderDir, cols);
  }

  const sql = `SELECT * FROM ${myIdent(db)}.${myIdent(table)}${where}${orderBy} LIMIT ${clampedLimit} OFFSET ${clampedOffset}`;
  const rows = await query(ref, sql);
  if (rows.length === 0) {
    return { columns: [], rows: [], rowCount: 0 };
  }
  const header = rows[0].map(c => c ?? '');
  const dataRows = rows.slice(1).map(r => r.map(c => c ?? ''));
  return { columns: header, rows: dataRows, rowCount: dataRows.length };
}

/** Runs arbitrary SQL and returns results in QueryResult format. */
async function runSql(ref: string, db: string, sql: string): Promise<QueryResult> {
  const rows = await query(ref, sql, db || undefined);
  if (rows.length === 0) {
    return { columns: [], rows: [], rowCount: 0 };
  }
  const header = rows[0].map(c => c ?? '');
  const dataRows = rows.slice(1).map(r => r.map(c => c ?? ''));
  return {
    columns: header,
    rows: dataRows,
    rowCount: dataRows.length,
  };
}

/** Returns the primary key column names for a table. */
async function pkColumns(
  ref: string,
  db: string,
  _schema: string,
  table: string
): Promise<string[]> {
  const sql = `SHOW KEYS FROM ${myIdent(db)}.${myIdent(table)} WHERE Key_name='PRIMARY'`;
  const rows = await query(ref, sql);
  if (rows.length <= 1) return [];

  // Find Column_name index from header row
  const header = rows[0];
  const colIdx = header.findIndex(h => h === 'Column_name');
  if (colIdx === -1) return [];

  return rows
    .slice(1)
    .map(r => r[colIdx] ?? '')
    .filter(name => typeof name === 'string' && name.length > 0) as string[];
}

// ---------------------------------------------------------------------------
// Adapter export
// ---------------------------------------------------------------------------

export const mysqlAdapter = {
  listDatabases,
  listTables,
  columns,
  getRows,
  runSql,
  pkColumns,
  buildUpdate,
  buildInsert,
  buildDelete,
};
