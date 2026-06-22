export type Engine = 'postgres' | 'mysql' | 'redis';

export interface DbConnection {
  ref: string;
  engine: Engine;
  image: string;
  source: 'panel' | 'external';
}

export interface QueryResult {
  columns: string[];
  rows: string[][];
  rowCount: number;
}

/**
 * RFC 4180 mini CSV parser.
 * Handles quoted fields, embedded commas, embedded newlines, and escaped quotes ("" → ").
 * Returns string[][] — array of rows, each row an array of cell strings.
 * Empty string → [].
 */
export function parseCsv(s: string): string[][] {
  if (s === '') return [];

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  let i = 0;

  while (i < s.length) {
    const ch = s[i];

    if (inQuotes) {
      if (ch === '"') {
        // Check for escaped quote ""
        if (i + 1 < s.length && s[i + 1] === '"') {
          cell += '"';
          i += 2;
        } else {
          // Closing quote
          inQuotes = false;
          i++;
        }
      } else {
        // Any character including newlines inside quotes
        cell += ch;
        i++;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
      } else if (ch === ',') {
        row.push(cell);
        cell = '';
        i++;
      } else if (ch === '\r' && i + 1 < s.length && s[i + 1] === '\n') {
        // CRLF record separator
        row.push(cell);
        rows.push(row);
        row = [];
        cell = '';
        i += 2;
      } else if (ch === '\n') {
        // LF record separator
        row.push(cell);
        rows.push(row);
        row = [];
        cell = '';
        i++;
      } else {
        cell += ch;
        i++;
      }
    }
  }

  // Push the last cell/row if there is content
  row.push(cell);
  rows.push(row);

  return rows;
}

// ---- Sort & filter (Grid v2) ----
export type FilterOp = 'contains' | 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte';

export interface FilterCond {
  col: string;
  op: FilterOp;
  value: string;
}

export interface GetRowsOpts {
  limit: number;
  offset: number;
  orderBy?: string;
  orderDir?: 'asc' | 'desc';
  filters?: FilterCond[];
}

// Önek sırası önemli: iki karakterli operatörler tek karakterlilerden ÖNCE.
const OP_PREFIXES: [string, FilterOp][] = [
  ['>=', 'gte'], ['<=', 'lte'], ['!=', 'neq'], ['>', 'gt'], ['<', 'lt'], ['=', 'eq'],
];

/** Ham filtre girdisini operatör+değere ayırır. Önek yoksa 'contains'. */
export function parseFilterInput(raw: string): { op: FilterOp; value: string } {
  for (const [pre, op] of OP_PREFIXES) {
    if (raw.startsWith(pre)) return { op, value: raw.slice(pre.length) };
  }
  return { op: 'contains', value: raw };
}

/**
 * MySQL --batch TSV parser.
 * Split lines on \n, each line split('\t').
 * Cell mapping: \N → null, unescape \t → tab, \n → newline, \\ → backslash.
 * Empty string → [].
 */
export function parseTsv(s: string): (string | null)[][] {
  if (s === '') return [];

  return s.split('\n').map(line =>
    line.split('\t').map(c => {
      if (c === '\\N') return null;
      return c
        .replace(/\\t/g, '\t')
        .replace(/\\n/g, '\n')
        .replace(/\\\\/g, '\\');
    })
  );
}
