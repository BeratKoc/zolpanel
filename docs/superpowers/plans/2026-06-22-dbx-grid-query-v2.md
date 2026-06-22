# DB Explorer — Grid & Sorgu v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Editör grid'inin yükleme deneyimini düzelt (skeleton + eski-veriyi-koru) ve DBeaver-tarzı hücre seçim/düzenleme, kolon-başlığından sıralama, kolon-bazlı filtre ekle.

**Architecture:** Yeni route yok. postgres/mysql adapter'larına saf `buildOrderBy`/`buildWhere` + `columns()` eklenir, `getRows` opsiyonları genişler; kolon adları gerçek kolon listesine karşı doğrulanır, değerler mevcut literal-escape ile escape edilir. `rows` GET route yeni param'ları okur. DataGrid client tarafı yeniden modellenir; globals.css'e skeleton/progress eklenir.

**Tech Stack:** Next.js 15 route handler (nodejs runtime), TypeScript, better-sqlite3 yok (DB erişimi `docker exec`), node:test (`node --import tsx --test`), next-intl (6 dil), Playwright e2e.

## Global Constraints
- Kapsam: **postgres + mysql** (redis bu plana dahil değil). Harici (panel-dışı) DB'lerde **salt-okunur kapısı korunur**: sort/filter okuma → serbest; hücre edit/NULL/sil hâlâ `?write=1` gerektirir.
- DB erişimi yalnız `dbExec(ref, argv[, env])` ile (shell yok). Kolon/tablo adı **asla** doğrulanmadan SQL'e konmaz; değerler `pgLiteral`/`myLiteral` ile escape edilir.
- Masaüstü + mobil (≤767px) bozulmaz; `prefers-reduced-motion` desteklenir.
- 6 dil i18n parity korunur (`lib/i18n.test.ts`): yeni anahtar 6 dilde de eklenir.
- Commit yazarı `BeratKoc <ahmetberatkoc0@gmail.com>`; **Co-Authored-By trailer YOK**.
- Test komutu: `npm test` (= `node --import tsx --test "lib/**/*.test.ts"`). Build: `npm run build` (Windows EPERM → `rm -rf .next`). `npx tsc --noEmit` temiz.
- Mevcut `QueryResult = { columns: string[]; rows: string[][]; rowCount: number }`. `getRows` `{...result, pk}` döner (route'ta pk eklenir).
- CI'da DB konteyneri YOK → fonksiyonel sort/filter/edit yalnız **canlı zolvix-postgres-1'de salt-okunur** doğrulanır; otomatik kapsam = builder unit testleri.

---

### Task 1: Backend — sort/filter SQL builders + `columns()` + `getRows` genişlemesi

**Files:**
- Modify: `lib/server/dbExplorer/types.ts` (yeni tipler + `parseFilterInput`)
- Modify: `lib/server/dbExplorer/postgres.ts` (`columns`, `buildOrderBy`, `buildWhere`, `getRows`)
- Modify: `lib/server/dbExplorer/mysql.ts` (aynısı, mysql ident/literal ile)
- Create: `lib/server/dbExplorer/sortFilter.test.ts`

**Interfaces:**
- Consumes: mevcut `pgIdent`/`pgLiteral` (postgres.ts), `myIdent`/`myLiteral` (mysql.ts), `dbExec`, `psqlBase`, `query`, `parseCsv`, `QueryResult`.
- Produces:
  - `types.ts`: `type FilterOp = 'contains'|'eq'|'neq'|'gt'|'lt'|'gte'|'lte'`; `interface FilterCond { col: string; op: FilterOp; value: string }`; `interface GetRowsOpts { limit: number; offset: number; orderBy?: string; orderDir?: 'asc'|'desc'; filters?: FilterCond[] }`; `function parseFilterInput(raw: string): { op: FilterOp; value: string }`.
  - `postgres.ts` & `mysql.ts` (export'lu): `buildOrderBy(orderBy: string|undefined, orderDir: string|undefined, validCols: string[]): string`; `buildWhere(filters: FilterCond[]|undefined, validCols: string[]): string`. Adapter'a `columns(ref, db, schema, table): Promise<string[]>` ve `getRows(ref, db, schema, table, opts: GetRowsOpts): Promise<QueryResult>`.

- [ ] **Step 1: `types.ts`'e tipler + `parseFilterInput` ekle (dosya sonuna).**

```ts
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
```

- [ ] **Step 2: Failing test yaz** — `lib/server/dbExplorer/sortFilter.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert';
import { parseFilterInput } from './types';
import { buildOrderBy as pgOrderBy, buildWhere as pgWhere } from './postgres';
import { buildOrderBy as myOrderBy, buildWhere as myWhere } from './mysql';
import type { FilterCond } from './types';

const COLS = ['id', 'name', 'weird"col'];

test('parseFilterInput: önekler + varsayılan contains', () => {
  assert.deepStrictEqual(parseFilterInput('=5'), { op: 'eq', value: '5' });
  assert.deepStrictEqual(parseFilterInput('>=10'), { op: 'gte', value: '10' });
  assert.deepStrictEqual(parseFilterInput('!=x'), { op: 'neq', value: 'x' });
  assert.deepStrictEqual(parseFilterInput('>3'), { op: 'gt', value: '3' });
  assert.deepStrictEqual(parseFilterInput('ali'), { op: 'contains', value: 'ali' });
});

test('pg buildOrderBy: geçerli kolon + yön', () => {
  assert.strictEqual(pgOrderBy('name', 'desc', COLS), ' ORDER BY "name" DESC');
  assert.strictEqual(pgOrderBy('name', 'asc', COLS), ' ORDER BY "name" ASC');
  assert.strictEqual(pgOrderBy('name', undefined, COLS), ' ORDER BY "name" ASC');
});

test('pg buildOrderBy: geçersiz/eksik kolon → boş (injection reddi)', () => {
  assert.strictEqual(pgOrderBy('id; DROP TABLE x', 'asc', COLS), '');
  assert.strictEqual(pgOrderBy(undefined, 'asc', COLS), '');
  assert.strictEqual(pgOrderBy('', 'asc', COLS), '');
});

test('pg buildOrderBy: identifier escape (gömülü çift tırnak)', () => {
  assert.strictEqual(pgOrderBy('weird"col', 'asc', COLS), ' ORDER BY "weird""col" ASC');
});

test('pg buildWhere: contains ILIKE + comparator + AND', () => {
  const f: FilterCond[] = [
    { col: 'name', op: 'contains', value: 'al' },
    { col: 'id', op: 'gte', value: '5' },
  ];
  assert.strictEqual(pgWhere(f, COLS), ` WHERE "name" ILIKE '%al%' AND "id" >= '5'`);
});

test('pg buildWhere: geçersiz kolon + boş değer atlanır; hiç kalmazsa boş', () => {
  assert.strictEqual(pgWhere([{ col: 'evil', op: 'eq', value: '1' }], COLS), '');
  assert.strictEqual(pgWhere([{ col: 'name', op: 'contains', value: '' }], COLS), '');
  assert.strictEqual(pgWhere([], COLS), '');
  assert.strictEqual(pgWhere(undefined, COLS), '');
});

test('pg buildWhere: değer escape (tek tırnak)', () => {
  assert.strictEqual(
    pgWhere([{ col: 'name', op: 'eq', value: "o'brien" }], COLS),
    ` WHERE "name" = 'o''brien'`,
  );
});

test('mysql buildOrderBy: backtick ident + LIKE', () => {
  assert.strictEqual(myOrderBy('name', 'desc', COLS), ' ORDER BY `name` DESC');
});

test('mysql buildWhere: contains LIKE + comparator', () => {
  const f: FilterCond[] = [
    { col: 'name', op: 'contains', value: 'al' },
    { col: 'id', op: 'lt', value: '9' },
  ];
  assert.strictEqual(myWhere(f, COLS), ' WHERE `name` LIKE \'%al%\' AND `id` < \'9\'');
});

test('mysql buildWhere: değer escape (ters bölü + tırnak)', () => {
  assert.strictEqual(
    myWhere([{ col: 'name', op: 'eq', value: "a\\b'c" }], COLS),
    ' WHERE `name` = \'a\\\\b\'\'c\'',
  );
});
```

- [ ] **Step 3: Test'in fail ettiğini doğrula** — Run: `npm test` → FAIL (`buildOrderBy`/`buildWhere` export edilmemiş).

- [ ] **Step 4: postgres.ts'e builder'ları + `columns` ekle.** `pgLiteral` tanımının hemen sonrasına (escape helper'ların yanına) ekle:

```ts
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
```

`listTables` fonksiyonundan sonra `columns` ekle:

```ts
/** Bir tablonun kolon adlarını sıralı döner (sort/filter doğrulaması için). */
async function columns(ref: string, db: string, schema: string, table: string): Promise<string[]> {
  const sql = `SELECT column_name FROM information_schema.columns WHERE table_schema=${pgLiteral(schema)} AND table_name=${pgLiteral(table)} ORDER BY ordinal_position`;
  const out = await dbExec(ref, [...(await psqlBase(ref, db)), '-tAc', sql]);
  return out.split('\n').map(l => l.trim()).filter(l => l.length > 0);
}
```

- [ ] **Step 5: postgres.ts `getRows`'u `GetRowsOpts` ile genişlet.** İmza + gövde değişir:

```ts
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
```

`postgresAdapter` export nesnesine `columns,` ekle (`getRows,`'un yanına).

- [ ] **Step 6: mysql.ts'e builder'ları + `columns` ekle.** `myLiteral` sonrasına:

```ts
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
```

`listTables` sonrasına `columns`:

```ts
/** Bir tablonun kolon adlarını döner (sort/filter doğrulaması için). MySQL'de schema === db. */
async function columns(ref: string, db: string, _schema: string, table: string): Promise<string[]> {
  const rows = await query(ref, `SHOW COLUMNS FROM ${myIdent(db)}.${myIdent(table)}`);
  if (rows.length <= 1) return [];
  // header: Field Type Null Key Default Extra → Field = kolon 0
  return rows.slice(1).map(r => r[0] ?? '').filter(n => typeof n === 'string' && n.length > 0) as string[];
}
```

- [ ] **Step 7: mysql.ts `getRows`'u genişlet:**

```ts
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
```

`mysqlAdapter` export nesnesine `columns,` ekle.

- [ ] **Step 8: Testlerin geçtiğini + tsc temiz doğrula** — Run: `npm test` (sortFilter + mevcut hepsi PASS), `npx tsc --noEmit` (temiz).

- [ ] **Step 9: Commit**

```bash
git add lib/server/dbExplorer/types.ts lib/server/dbExplorer/postgres.ts lib/server/dbExplorer/mysql.ts lib/server/dbExplorer/sortFilter.test.ts
git commit -m "feat(dbx): sort/filter SQL builders + columns() + getRows opts (pg+mysql)"
```

---

### Task 2: Route + api-client — `rows` GET yeni param'ları okur

**Files:**
- Modify: `app/api/dbx/[ref]/rows/route.ts` (GET — orderBy/orderDir/filters parse + adapter'a ilet)
- Modify: `lib/api-client.ts` (`dbxRows` — değişiklik gerekmeyebilir; doğrula)

**Interfaces:**
- Consumes: Task 1 `GetRowsOpts`, `FilterCond`, `adapter.getRows(ref, db, schema, table, opts)`.
- Produces: `rows` GET artık `?orderBy=&orderDir=&filters=<json>` kabul eder. `filters` = `FilterCond[]` JSON string.

- [ ] **Step 1: route.ts GET'i güncelle.** Üstte import ekle:

```ts
import type { FilterCond } from '@/lib/server/dbExplorer/types';
```

GET içindeki `const offset = ...` satırından SONRA, `if (!db || !table)` kontrolünden ÖNCE ekle:

```ts
    const orderBy = searchParams.get('orderBy') || undefined;
    const orderDirRaw = searchParams.get('orderDir');
    const orderDir: 'asc' | 'desc' | undefined =
      orderDirRaw === 'desc' ? 'desc' : orderDirRaw === 'asc' ? 'asc' : undefined;

    let filters: FilterCond[] | undefined;
    const filtersRaw = searchParams.get('filters');
    if (filtersRaw) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(filtersRaw);
      } catch {
        return Response.json({ error: 'filters JSON geçersiz' }, { status: 400 });
      }
      if (Array.isArray(parsed)) {
        filters = parsed.filter(
          (f): f is FilterCond =>
            !!f && typeof f.col === 'string' && typeof f.op === 'string' && typeof f.value === 'string',
        );
      }
    }
```

`adapter.getRows` çağrısını değiştir:

```ts
    const result = await adapter.getRows(ref, db, schema, table, { limit, offset, orderBy, orderDir, filters });
```

- [ ] **Step 2: api-client `dbxRows`'u doğrula.** `lib/api-client.ts`'teki `dbxRows` zaten `Record<string, string | number>` alıp her değeri `String(v)` ile query string'e çeviriyor → `orderBy`/`orderDir` string, `filters` JSON-string olarak sorunsuz geçer. **Değişiklik gerekmez.** (Step'te yalnız okuyup doğrula; gerekiyorsa hiçbir şey değiştirme.)

- [ ] **Step 3: build + tsc doğrula** — Run: `npx tsc --noEmit` (temiz), `npm run build` (PASS; Windows EPERM → `rm -rf .next`).

- [ ] **Step 4: Commit**

```bash
git add "app/api/dbx/[ref]/rows/route.ts"
git commit -m "feat(dbx): rows GET accepts orderBy/orderDir/filters"
```

---

### Task 3: DataGrid yükleme UX — skeleton + eski-veriyi-koru + ince progress

**Files:**
- Modify: `app/globals.css` (skeleton shimmer + indeterminate progress + reduced-motion)
- Modify: `components/dbexplorer/DataGrid.tsx` (cold-load skeleton, refetch dim+progress, perpetual spinner kaldır)

**Interfaces:**
- Consumes: mevcut DataGrid `loading`/`data` state.
- Produces: cold load'da `<GridSkeleton/>`, refetch'te `.progress-indeterminate` + dimmed grid; kalıcı mini spinner (mevcut ~satır 258-263) kaldırılır.

- [ ] **Step 1: globals.css'e ekle** (dosya sonuna, mevcut `@keyframes pulse` yakınına):

```css
/* DB grid skeleton + belirsiz progress (Grid v2) */
@keyframes shimmer { 0% { background-position: -400px 0; } 100% { background-position: 400px 0; } }
.skeleton-row {
  height: 26px;
  border-radius: 4px;
  background: linear-gradient(90deg, var(--bg-elevated) 25%, var(--bg-hover) 37%, var(--bg-elevated) 63%);
  background-size: 800px 100%;
  animation: shimmer 1.4s ease-in-out infinite;
}
@keyframes indeterminate { 0% { left: -40%; } 100% { left: 100%; } }
.progress-indeterminate { position: relative; height: 2px; background: var(--border); overflow: hidden; flex-shrink: 0; }
.progress-indeterminate::after {
  content: ''; position: absolute; top: 0; height: 100%; width: 40%;
  background: var(--accent); animation: indeterminate 1.1s ease-in-out infinite;
}
@media (prefers-reduced-motion: reduce) {
  .skeleton-row, .progress-indeterminate::after { animation: none; }
  .progress-indeterminate::after { left: 0; width: 100%; opacity: 0.5; }
}
```

- [ ] **Step 2: DataGrid.tsx'e `GridSkeleton` bileşeni ekle** (dosya sonundaki `}` kapanışından önce, `DataGrid` fonksiyonunun dışına):

```tsx
function GridSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px 4px' }}>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="skeleton-row" />
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Cold-load spinner'ı skeleton ile değiştir.** Mevcut bloğu:

```tsx
  if (loading && !data) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '40px' }}>
        <Spinner size={20} />
      </div>
    );
  }
```

şununla değiştir:

```tsx
  if (loading && !data) {
    return <GridSkeleton />;
  }
```

- [ ] **Step 4: Kalıcı mini spinner'ı kaldır + refetch progress/dim ekle.** Mevcut bloğu sil:

```tsx
      {/* Loading overlay indicator */}
      {loading && data && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 0', fontSize: '11px', color: 'var(--text-muted)' }}>
          <Spinner size={12} />
        </div>
      )}
```

Yerine, aynı konuma ince progress çubuğu koy:

```tsx
      {/* Refetch progress (içerik kaybolmaz) */}
      {loading && data && <div className="progress-indeterminate" aria-hidden="true" />}
```

Sonra tablo sarmalayıcısını (mevcut `<div style={{ flex: 1, overflowX: 'auto', overflowY: 'auto', minHeight: 0 }}>`) refetch sırasında soluklaştır — `style`'a koşullu opacity/pointer-events ekle:

```tsx
      {/* Table */}
      <div style={{
        flex: 1,
        overflowX: 'auto',
        overflowY: 'auto',
        minHeight: 0,
        opacity: loading && data ? 0.55 : 1,
        pointerEvents: loading && data ? 'none' : 'auto',
        transition: 'opacity 0.15s',
      }}>
```

- [ ] **Step 5: build + tsc + test** — Run: `npx tsc --noEmit`, `npm run build`, `npm test` (mevcut geçer). `Spinner` import'u hâlâ satır-aksiyonlarında kullanılıyorsa kalsın; kullanılmıyorsa kaldır (tsc unused uyarısı yoksa dokunma).

- [ ] **Step 6: Commit**

```bash
git add app/globals.css components/dbexplorer/DataGrid.tsx
git commit -m "feat(dbx): grid skeleton on cold load + keep-stale rows with progress on refetch"
```

---

### Task 4: DataGrid sıralama + filtre

**Files:**
- Modify: `components/dbexplorer/DataGrid.tsx`
- Modify: `messages/{tr,en,zh,es,de,fr}.json` (`dbx.filter`, `dbx.clearFilters`)

**Interfaces:**
- Consumes: Task 1 `parseFilterInput`; Task 2 `dbxRows` `orderBy`/`orderDir`/`filters` param'ları.
- Produces: başlık tıkla→sıra (3 durum), filtre satırı, debounce'lu fetch. Diğer task'lar etkilenmez.

- [ ] **Step 1: i18n anahtarlarını 6 dile ekle.** Her `messages/<loc>.json`'daki `"dbx"` bloğuna ekle (mevcut `"next"` anahtarından sonra virgülle):
  - tr: `"filter": "Filtre", "clearFilters": "Filtreleri temizle"`
  - en: `"filter": "Filter", "clearFilters": "Clear filters"`
  - zh: `"filter": "筛选", "clearFilters": "清除筛选"`
  - es: `"filter": "Filtro", "clearFilters": "Limpiar filtros"`
  - de: `"filter": "Filter", "clearFilters": "Filter löschen"`
  - fr: `"filter": "Filtre", "clearFilters": "Effacer les filtres"`

- [ ] **Step 2: `parseFilterInput` import + state ekle.** DataGrid.tsx üstündeki import'a ekle:

```tsx
import { parseFilterInput } from '@/lib/server/dbExplorer/types';
```

`Filter` ikonunu lucide import'una ekle: `import { Trash2, Plus, Save, X, Filter } from 'lucide-react';`

`const [offset, setOffset] = useState(0);` satırından sonra ekle:

```tsx
  const [sort, setSort] = useState<{ col: string; dir: 'asc' | 'desc' } | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterInputs, setFilterInputs] = useState<Record<string, string>>({});
  const [debouncedFilters, setDebouncedFilters] = useState<Record<string, string>>({});
```

- [ ] **Step 3: `fetchRows`'u sort/filter gönderecek şekilde değiştir.** Mevcut `fetchRows` useCallback'i şununla değiştir (artık tüm parametreleri argümandan alır, böylece tek effect'le çift-fetch olmaz):

```tsx
  const fetchRows = useCallback(async (
    currentOffset: number,
    currentSort: { col: string; dir: 'asc' | 'desc' } | null,
    currentFilters: Record<string, string>,
  ) => {
    setLoading(true);
    try {
      const q: Record<string, string | number> = {
        db, schema, table, limit: String(LIMIT), offset: String(currentOffset),
      };
      if (currentSort) { q.orderBy = currentSort.col; q.orderDir = currentSort.dir; }
      const conds = Object.entries(currentFilters)
        .filter(([, raw]) => raw.trim() !== '')
        .map(([col, raw]) => ({ col, ...parseFilterInput(raw) }));
      if (conds.length) q.filters = JSON.stringify(conds);
      const result = await api.dbxRows(connRef, q);
      setData(result as GridData);
    } catch (e: unknown) {
      show(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setLoading(false);
    }
  }, [connRef, db, schema, table, show]);
```

- [ ] **Step 4: Effect'leri güncelle.** Mevcut iki effect'i (table-reset + fetch) şununla değiştir:

```tsx
  // Tablo değişince her şeyi sıfırla
  useEffect(() => {
    setOffset(0);
    setEditingCell(null);
    setAddingRow(false);
    setNewRow({});
    setSort(null);
    setFilterInputs({});
    setDebouncedFilters({});
  }, [connRef, db, schema, table]);

  // Filtre input'unu 350ms debounce ile uygula + sayfayı başa al
  useEffect(() => {
    const id = setTimeout(() => {
      setDebouncedFilters(filterInputs);
      setOffset(0);
    }, 350);
    return () => clearTimeout(id);
  }, [filterInputs]);

  // Tek fetch noktası
  useEffect(() => {
    fetchRows(offset, sort, debouncedFilters);
  }, [fetchRows, offset, sort, debouncedFilters]);
```

(Mevcut `editingCell` focus effect'i AYNEN kalır.) Diğer fonksiyonlardaki `fetchRows(offset)` çağrılarını `fetchRows(offset, sort, debouncedFilters)` yap: `handleAddRow` ve `handleDeleteRow` içinde `await fetchRows(offset)` → `await fetchRows(offset, sort, debouncedFilters)`.

- [ ] **Step 5: `toggleSort` ekle** (commitCellEdit yakınına, fonksiyon olarak):

```tsx
  function toggleSort(col: string) {
    setOffset(0);
    setSort(prev => {
      if (!prev || prev.col !== col) return { col, dir: 'asc' };
      if (prev.dir === 'asc') return { col, dir: 'desc' };
      return null;
    });
  }
```

- [ ] **Step 6: Toolbar'a Filtre düğmesi ekle.** "Add row" `<Btn>`'inden ÖNCE (pagination'dan sonra) ekle:

```tsx
        {/* Filtre aç/kapa */}
        <Btn
          size="sm"
          variant={filtersOpen ? 'primary' : 'default'}
          onClick={() => {
            setFiltersOpen(o => {
              const next = !o;
              if (!next && Object.keys(filterInputs).length) setFilterInputs({});
              return next;
            });
          }}
        >
          <Filter size={13} strokeWidth={2} />
          {t('dbx.filter')}
        </Btn>
```

- [ ] **Step 7: Başlık hücrelerini tıklanır + sıralama göstergeli yap.** `data.columns.map(col => (...))` içindeki `<th ...>`'a `onClick={() => toggleSort(col)}` + `cursor: 'pointer'` ekle ve içeriğe gösterge koy. Mevcut `{col}` + PK span'ından sonra ekle:

```tsx
                  {sort?.col === col && (
                    <span style={{ marginLeft: '4px', fontSize: '9px', color: 'var(--accent)' }}>
                      {sort.dir === 'asc' ? '▲' : '▼'}
                    </span>
                  )}
```

`<th>` style objesine `cursor: 'pointer'` ekle (mevcut `userSelect: 'none'`'ın yanına) ve `onClick={() => toggleSort(col)}` prop'unu ekle.

- [ ] **Step 8: Filtre satırını ekle.** `<thead>` içinde, kolon başlık `<tr>`'ından SONRA (hâlâ thead içinde) ekle:

```tsx
            {filtersOpen && (
              <tr>
                {canWrite && (
                  <th style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)' }} />
                )}
                {data.columns.map(col => (
                  <th key={col} style={{ padding: '4px 6px', background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)' }}>
                    <input
                      value={filterInputs[col] ?? ''}
                      onChange={e => setFilterInputs(prev => ({ ...prev, [col]: e.target.value }))}
                      placeholder={t('dbx.filter')}
                      style={{
                        width: '100%', minWidth: '70px',
                        background: 'var(--bg-base)', border: '1px solid var(--border)',
                        borderRadius: '3px', color: 'var(--text-primary)',
                        fontFamily: 'var(--font-mono)', fontSize: '11px', padding: '3px 6px', outline: 'none',
                      }}
                    />
                  </th>
                ))}
              </tr>
            )}
```

- [ ] **Step 9: build + tsc + i18n test** — Run: `npx tsc --noEmit`, `npm run build`, `npm test` (i18n parity + used-key PASS).

- [ ] **Step 10: Commit**

```bash
git add components/dbexplorer/DataGrid.tsx messages/tr.json messages/en.json messages/zh.json messages/es.json messages/de.json messages/fr.json
git commit -m "feat(dbx): column header sort + per-column filter row"
```

---

### Task 5: DataGrid hücre seçim modeli + NULL + kopyala

**Files:**
- Modify: `components/dbexplorer/DataGrid.tsx`
- Modify: `messages/{tr,en,zh,es,de,fr}.json` (`dbx.setNull`, `dbx.copy`, `dbx.copied`)

**Interfaces:**
- Consumes: mevcut `editingCell`/`commitCellEdit`/`buildPk`/`api.dbxRowUpdate`; `canEdit`.
- Produces: tek-tık seç, çift-tık/F2/Enter/yaz düzenle, ok-tuş gezinme, Ctrl+C kopya, Delete/Ctrl+Shift+N NULL.

- [ ] **Step 1: i18n anahtarlarını 6 dile ekle** (`"dbx"` bloğuna, Task 4 anahtarlarının yanına):
  - tr: `"setNull": "NULL ata", "copy": "Kopyala", "copied": "Kopyalandı"`
  - en: `"setNull": "Set NULL", "copy": "Copy", "copied": "Copied"`
  - zh: `"setNull": "设为 NULL", "copy": "复制", "copied": "已复制"`
  - es: `"setNull": "Establecer NULL", "copy": "Copiar", "copied": "Copiado"`
  - de: `"setNull": "Auf NULL setzen", "copy": "Kopieren", "copied": "Kopiert"`
  - fr: `"setNull": "Définir NULL", "copy": "Copier", "copied": "Copié"`

- [ ] **Step 2: `selectedCell` state + selection sıfırlama ekle.** `editingCell` state'inden sonra:

```tsx
  const [selectedCell, setSelectedCell] = useState<{ row: number; col: number } | null>(null);
```

Tablo-reset effect'ine (Task 4 Step 4) `setSelectedCell(null);` ekle.

- [ ] **Step 3: `beginEdit`, `setCellNull`, `copyCell`, klavye nav fonksiyonlarını ekle.** `toggleSort` yakınına:

```tsx
  function beginEdit(row: number, col: number, initial?: string) {
    if (!canEdit || !data || data.pk.length === 0 || savingCell) return;
    setEditingCell({ rowIdx: row, colIdx: col, value: initial ?? (data.rows[row][col] ?? '') });
  }

  function copyCell(row: number, col: number) {
    if (!data) return;
    const v = data.rows[row][col] ?? '';
    navigator.clipboard?.writeText(v).then(() => show(t('dbx.copied'), 'success')).catch(() => {});
  }

  async function setCellNull(row: number, col: number) {
    if (!canEdit || !data || data.pk.length === 0) return;
    const colName = data.columns[col];
    const pkObj = buildPk(data.rows[row], data.columns, data.pk);
    setSavingCell(true);
    try {
      await api.dbxRowUpdate(connRef, { db, schema, table, values: { [colName]: null }, pk: pkObj }, canWrite);
      setData(prev => {
        if (!prev) return prev;
        const updated = prev.rows.map((r, ri) =>
          ri === row ? r.map((c, ci) => (ci === col ? (null as unknown as string) : c)) : r,
        );
        return { ...prev, rows: updated };
      });
      show(t('dbx.save'), 'success');
    } catch (e: unknown) {
      show(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setSavingCell(false);
    }
  }

  function handleGridKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (editingCell || !data || !selectedCell) return;
    const { row, col } = selectedCell;
    const maxRow = data.rows.length - 1;
    const maxCol = data.columns.length - 1;
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedCell({ row: Math.min(maxRow, row + 1), col }); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedCell({ row: Math.max(0, row - 1), col }); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); setSelectedCell({ row, col: Math.max(0, col - 1) }); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); setSelectedCell({ row, col: Math.min(maxCol, col + 1) }); }
    else if (e.key === 'F2' || e.key === 'Enter') { e.preventDefault(); beginEdit(row, col); }
    else if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C')) { e.preventDefault(); copyCell(row, col); }
    else if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'n' || e.key === 'N')) { e.preventDefault(); setCellNull(row, col); }
    else if (e.key === 'Delete' && canEdit) { e.preventDefault(); setCellNull(row, col); }
    else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { beginEdit(row, col, e.key); }
  }
```

- [ ] **Step 4: Hücre `onClick`'ini seçim moduna çevir + çift-tık düzenleme + seçim çerçevesi.** Mevcut data-cell `<td>`'sini (mevcut `onClick={() => handleCellClick(...)}` olan) güncelle: `onClick` artık seçer, `onDoubleClick` düzenler. Mevcut `handleCellClick` fonksiyonunu SİL ve `<td>`'yi şöyle değiştir (yalnız ilgili prop/stiller):

```tsx
                    <td
                      key={colIdx}
                      onClick={() => setSelectedCell({ row: rowIdx, col: colIdx })}
                      onDoubleClick={() => beginEdit(rowIdx, colIdx)}
                      style={{
                        padding: isEditing ? '2px 4px' : '5px 10px',
                        borderBottom: '1px solid var(--border)',
                        outline: selectedCell?.row === rowIdx && selectedCell?.col === colIdx && !isEditing
                          ? '2px solid var(--accent)' : 'none',
                        outlineOffset: '-2px',
                        color: cell === null || cell === undefined ? 'var(--text-muted)' : 'var(--text-primary)',
                        fontStyle: cell === null || cell === undefined ? 'italic' : 'normal',
                        cursor: canEdit ? 'pointer' : 'default',
                        maxWidth: '280px',
                        verticalAlign: 'middle',
                        whiteSpace: isEditing ? 'normal' : 'nowrap',
                        overflow: isEditing ? 'visible' : 'hidden',
                        textOverflow: isEditing ? 'clip' : 'ellipsis',
                      }}
                    >
```

(İçindeki `isEditing ? <input.../> : (cell === null ... 'NULL' : String(cell))` mantığı AYNEN kalır.)

- [ ] **Step 5: Tablo sarmalayıcısını klavye-odaklanabilir yap.** Task 3'te güncellenen `{/* Table */}` `<div>`'ine `tabIndex={0}`, `onKeyDown={handleGridKeyDown}` ve `outline: 'none'` ekle (style'a).

- [ ] **Step 6: Düzenlenebilir hücrede çift-tık ipucu için title** (keşfedilebilirlik). Data-cell `<td>`'sine `title={canEdit ? t('dbx.copy') + ' / ' + t('dbx.setNull') : undefined}` ekleme — opsiyonel; **ekleme** (YAGNI; atla). [Bu adım kasıtlı no-op — title eklemiyoruz.]

- [ ] **Step 7: build + tsc + test** — Run: `npx tsc --noEmit` (temiz; `handleCellClick` ve `handleCellKeyDown` artık kullanılmıyorsa: `handleCellKeyDown` mevcut input'ta hâlâ kullanılıyor → KALSIN; `handleCellClick` silindi). `npm run build`, `npm test` (i18n PASS).

- [ ] **Step 8: Commit**

```bash
git add components/dbexplorer/DataGrid.tsx messages/tr.json messages/en.json messages/zh.json messages/es.json messages/de.json messages/fr.json
git commit -m "feat(dbx): cell selection model + keyboard nav + copy + set-NULL"
```

---

### Task 6: e2e (DB'siz dallar) + doğrulama + deploy

**Files:**
- Modify: `e2e/dbexplorer.spec.ts` (DB varsa sort/filter UI elemanlarını doğrula; DB yoksa boş-durumda geç)

**Interfaces:**
- Consumes: tüm önceki task'lar.

- [ ] **Step 1: e2e'ye koşullu doğrulama ekle.** `e2e/dbexplorer.spec.ts`'i oku. Editör açıldıktan (openBtn.click) ve bir tabloya tıklanabildiği dalda, "Filtre" düğmesinin görünür olduğunu doğrulayan bir assert ekle (yalnız `hasConnection` dalında; DB yoksa mevcut erken-return korunur):

```ts
  // Grid v2: Filtre düğmesi görünür (DB bağlantısı + tablo seçili dalda).
  const filterBtn = page.getByRole('button', { name: 'Filtre' });
  if (await filterBtn.isVisible().catch(() => false)) {
    await filterBtn.click(); // filtre satırını aç — hata atmamalı
  }
```

(Mevcut SQL-konsolu doğrulaması ve diğer adımlar AYNEN kalır. Yeni assert SADECE DB varsa anlamlı; CI'da no-op.)

- [ ] **Step 2: Tüm doğrulamalar** — Run: `npx tsc --noEmit`, `npm test` (hepsi PASS), `npm run e2e` (mevcut + dbexplorer dalı PASS; lone `backups.spec.ts` Windows-stale-server artefaktı ise `rm -rf .next` + tek tekrar). `git push origin main` → CI yeşil bekle.

- [ ] **Step 3: Deploy** — Run: `bash deploy.sh`. Health `{"status":"ok"}` + caddy "Valid configuration".

- [ ] **Step 4: Canlı doğrulama (salt-okunur, zolvix-postgres-1).** Panelden editörü aç, bir tabloya gir:
  - Yükleme: tabloya tıklayınca/sayfalayınca eski satırlar görünür kalır + ince üst progress (boş-flash yok).
  - Sıralama: bir kolon başlığına tıkla → ▲ sonra ▼ → satır sırası değişir.
  - Filtre: "Filtre" → bir kolona değer yaz → satırlar daralır.
  - **Yazma denenmez** (zolvix prod). Hücre seçim/çift-tık görsel olarak doğrulanır; NULL/edit yazma yolu unit testlerle kanıtlanmıştır.

- [ ] **Step 5: Ledger + alt-proje 1 tamam.** `.superpowers/sdd/progress.md`'ye tamamlanma satırı ekle.

---

## Self-Review (yazar)
- **Spec coverage:** Yükleme UX (A)→T3; hücre seçim/düzenleme/NULL/kopya (B)→T5; sıralama+filtre (D)→T1(backend)+T2(route)+T4(UI). Güvenlik (kolon doğrulama+escape)→T1. Harici salt-okunur→T1/T2 (sort/filter okuma serbest, edit `?write=1` korunur). i18n parity→T4/T5. Test→T1 unit + T6 e2e/canlı. Tüm spec maddeleri kapsandı.
- **Placeholder yok:** Her kod adımı tam içerik. T5 Step 6 kasıtlı no-op olarak işaretli (YAGNI).
- **Tip tutarlılığı:** `GetRowsOpts`/`FilterCond`/`FilterOp`/`parseFilterInput` T1'de tanımlı; T2 route + T4 client aynen kullanır. `buildOrderBy(orderBy,orderDir,validCols)` / `buildWhere(filters,validCols)` imzaları T1↔testler↔getRows tutarlı. `dbxRowUpdate` `values: { [col]: null }` → backend `buildUpdate` `string|null` (mevcut) ile uyumlu.
- **NULL:** backend zaten `null→NULL` üretiyor (yeni iş yok); yalnız client `null` gönderir (T5).
- **CI sınırı:** DB yok → fonksiyonel sort/filter/edit canlı read-only + unit testlerle kanıtlanır (T6); e2e yalnız DB'li dalda UI varlığını doğrular.
- **Çift-fetch riski:** T4 tek-fetch effect + argümanlı `fetchRows` ile giderildi (debounce offset'i 0'lar, sort offset'i 0'lar, tüm fetch tek effect'ten).
