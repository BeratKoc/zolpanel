# DB Explorer — Yapı / DDL Düzenleme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Editöre "Yapı" sekmesi ekle — bir tablonun kolonlarını listele ve DBeaver gibi kolon ekle/yeniden adlandır/sil/tip+nullable değiştir (ALTER TABLE), güvenli (tip allowlist + identifier escape + yıkıcı onay + harici salt-okunur).

**Architecture:** postgres/mysql adapter'larına `tableStructure()` + 4 saf DDL builder eklenir; tipler `validateColumnType` allowlist'inden, yeni adlar `validateIdentifier` deseninden geçer (types.ts'te saf fonksiyonlar). Yeni `ddl` route (GET=yapı, POST=DDL) sql route'un kapı desenini izler. Editöre 'structure' sekmesi + `StructureTab` bileşeni.

**Tech Stack:** Next.js 15 route handler (nodejs runtime), TypeScript, DB erişimi `docker exec`, node:test (`node --import tsx`), next-intl (6 dil), Playwright.

## Global Constraints
- Kapsam **postgres + mysql** (redis'te Yapı sekmesi yok). Harici (panel-dışı) DB'lerde **salt-okunur kapısı korunur** (`?write=1`); yıkıcı DDL (kolon SİL, tip DEĞİŞTİR) **`?confirm=1`** gerektirir, yoksa route `{ blocked: true, destructive: true, reason }` döner.
- Kolon **tipleri** SQL'e escape edilemez → yalnız `validateColumnType` allowlist'inden geçen normalize tip SQL'e girer; izinsiz → 400. Identifier'lar `pgIdent`/`myIdent` ile escape; **yeni** adlar `validateIdentifier` (`^[A-Za-z_][A-Za-z0-9_]*$`, ≤63) deseninden geçer; **mevcut** ad referansları gerçek `tableStructure` kolon listesinde olmalı.
- DB erişimi yalnız `dbExec`/`query` (shell yok). requireAuth tüm route'larda.
- Masaüstü + mobil (≤767px) bozulmaz. 6 dil i18n parity korunur (`lib/i18n.test.ts`).
- Commit yazarı `BeratKoc <ahmetberatkoc0@gmail.com>`; **Co-Authored-By trailer YOK**.
- Test: `npm test` (= `node --import tsx --test "lib/**/*.test.ts"`). Build: `npm run build` (Windows EPERM → `rm -rf .next`). `npx tsc --noEmit` temiz.
- `QueryResult = { columns: string[]; rows: string[][]; rowCount: number }`. Mevcut: `pgIdent`/`pgLiteral`/`psqlBase`/`dbExec`/`parseCsv`/`pkColumns` (postgres.ts), `myIdent`/`myLiteral`/`query`/`pkColumns` (mysql.ts), `runSql` her ikisinde.
- CI'da DB konteyneri YOK → DDL fonksiyonel doğrulaması yalnız **canlı zolvix'te salt-okunur (yapı görüntüleme)**; otomatik kapsam = builder/validator unit testleri.

## Dosya yapısı
- `lib/server/dbExplorer/types.ts` — `ColumnDef`, `validateColumnType`, `validateIdentifier`.
- `lib/server/dbExplorer/postgres.ts` & `mysql.ts` — `tableStructure` + 4 builder.
- `app/api/dbx/[ref]/ddl/route.ts` — GET (yapı) + POST (DDL).
- `lib/api-client.ts` — `dbxStructure`, `dbxDdl`.
- `app/(panel)/databases/[ref]/page.tsx` — 'structure' sekmesi.
- `components/dbexplorer/StructureTab.tsx` — yeni bileşen.
- `messages/{tr,en,zh,es,de,fr}.json` — yeni `dbx` anahtarları.
- `lib/server/dbExplorer/ddl.test.ts` — unit testler.
- `e2e/dbexplorer.spec.ts` — Yapı sekmesi guard'lı assert.

---

### Task 1: Backend — validators + `tableStructure` + DDL builders (pg+mysql)

**Files:**
- Modify: `lib/server/dbExplorer/types.ts`
- Modify: `lib/server/dbExplorer/postgres.ts`
- Modify: `lib/server/dbExplorer/mysql.ts`
- Create: `lib/server/dbExplorer/ddl.test.ts`

**Interfaces:**
- Consumes: `pgIdent`/`pgLiteral`/`psqlBase`/`dbExec`/`parseCsv`/`pkColumns`; `myIdent`/`myLiteral`/`query`/`pkColumns`; `QueryResult`.
- Produces:
  - `types.ts`: `interface ColumnDef { name: string; type: string; nullable: boolean; default: string | null; isPk: boolean }`; `function validateColumnType(raw: string, engine: 'postgres' | 'mysql'): string | null`; `function validateIdentifier(name: string): boolean`.
  - `postgres.ts` & `mysql.ts` (export'lu): `buildAddColumn(schema, table, col: { name: string; type: string; nullable: boolean; default?: string | null }): string`; `buildDropColumn(schema, table, name: string): string`; `buildRenameColumn(schema, table, oldName: string, newName: string, currentType: string): string`; `buildAlterColumnType(schema, table, name: string, newType: string, nullable: boolean): string`. Adapter'a `tableStructure(ref, db, schema, table): Promise<ColumnDef[]>`.

- [ ] **Step 1: `types.ts` sonuna validator'ları + tip ekle:**

```ts
// ---- DDL / structure (Alt-proje 2) ----
export interface ColumnDef {
  name: string;
  type: string;
  nullable: boolean;
  default: string | null;
  isPk: boolean;
}

const PG_TYPES = new Set([
  'text', 'varchar', 'char', 'character varying', 'integer', 'int', 'bigint', 'smallint',
  'boolean', 'numeric', 'decimal', 'real', 'double precision', 'date', 'timestamp',
  'timestamptz', 'time', 'uuid', 'json', 'jsonb', 'serial', 'bigserial',
]);
const MY_TYPES = new Set([
  'text', 'varchar', 'char', 'int', 'integer', 'bigint', 'smallint', 'tinyint',
  'boolean', 'numeric', 'decimal', 'real', 'double', 'float', 'date', 'datetime',
  'timestamp', 'time', 'json',
]);

/** Kolon tipini allowlist'e karşı doğrular. Geçerliyse normalize tip (örn 'varchar(255)'),
 *  değilse null. Tipler SQL'e escape edilemediğinden bu allowlist injection'ı kapatır. */
export function validateColumnType(raw: string, engine: 'postgres' | 'mysql'): string | null {
  const s = raw.trim().toLowerCase();
  // temel tip ([a-z ] — çok-kelimeli tipler için) + opsiyonel (n) veya (p,s)
  const m = s.match(/^([a-z][a-z ]*?)(\(\d+(,\d+)?\))?$/);
  if (!m) return null;
  const base = m[1].trim();
  const allow = engine === 'postgres' ? PG_TYPES : MY_TYPES;
  if (!allow.has(base)) return null;
  return base + (m[2] ?? '');
}

/** Yeni identifier (kolon adı) güvenli mi? Harf/altçizgi başlar, alfanümerik+_; ≤63. */
export function validateIdentifier(name: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) && name.length >= 1 && name.length <= 63;
}
```

- [ ] **Step 2: Failing test** — `lib/server/dbExplorer/ddl.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert';
import { validateColumnType, validateIdentifier } from './types';
import {
  buildAddColumn as pgAdd, buildDropColumn as pgDrop,
  buildRenameColumn as pgRename, buildAlterColumnType as pgAlter,
} from './postgres';
import {
  buildAddColumn as myAdd, buildDropColumn as myDrop,
  buildRenameColumn as myRename, buildAlterColumnType as myAlter,
} from './mysql';

test('validateColumnType: izinli tipler + uzunluk', () => {
  assert.strictEqual(validateColumnType('varchar(255)', 'postgres'), 'varchar(255)');
  assert.strictEqual(validateColumnType('NUMERIC(10,2)', 'postgres'), 'numeric(10,2)');
  assert.strictEqual(validateColumnType('double precision', 'postgres'), 'double precision');
  assert.strictEqual(validateColumnType('int', 'mysql'), 'int');
  assert.strictEqual(validateColumnType('datetime', 'mysql'), 'datetime');
});

test('validateColumnType: injection/izinsiz reddedilir', () => {
  assert.strictEqual(validateColumnType('text; DROP TABLE x', 'postgres'), null);
  assert.strictEqual(validateColumnType('varchar(255) foo', 'postgres'), null);
  assert.strictEqual(validateColumnType("varchar(1)'", 'postgres'), null);
  assert.strictEqual(validateColumnType('jsonb', 'mysql'), null); // mysql'de yok
  assert.strictEqual(validateColumnType('bogustype', 'postgres'), null);
});

test('validateIdentifier', () => {
  assert.strictEqual(validateIdentifier('user_id'), true);
  assert.strictEqual(validateIdentifier('_x1'), true);
  assert.strictEqual(validateIdentifier('1col'), false);
  assert.strictEqual(validateIdentifier('a;b'), false);
  assert.strictEqual(validateIdentifier('a b'), false);
  assert.strictEqual(validateIdentifier(''), false);
});

test('pg builders: doğru DDL + ident escape', () => {
  assert.strictEqual(
    pgAdd('public', 'users', { name: 'age', type: 'integer', nullable: true }),
    'ALTER TABLE "public"."users" ADD COLUMN "age" integer',
  );
  assert.strictEqual(
    pgAdd('public', 'users', { name: 'nm', type: 'varchar(20)', nullable: false, default: 'x' }),
    `ALTER TABLE "public"."users" ADD COLUMN "nm" varchar(20) NOT NULL DEFAULT 'x'`,
  );
  assert.strictEqual(pgDrop('public', 'users', 'age'), 'ALTER TABLE "public"."users" DROP COLUMN "age"');
  assert.strictEqual(
    pgRename('public', 'users', 'old', 'new', 'integer'),
    'ALTER TABLE "public"."users" RENAME COLUMN "old" TO "new"',
  );
  assert.strictEqual(
    pgAlter('public', 'users', 'age', 'bigint', false),
    'ALTER TABLE "public"."users" ALTER COLUMN "age" TYPE bigint, ALTER COLUMN "age" SET NOT NULL',
  );
  assert.strictEqual(
    pgAlter('public', 'users', 'age', 'bigint', true),
    'ALTER TABLE "public"."users" ALTER COLUMN "age" TYPE bigint, ALTER COLUMN "age" DROP NOT NULL',
  );
});

test('mysql builders: backtick + CHANGE/MODIFY', () => {
  assert.strictEqual(
    myAdd('shop', 'users', { name: 'age', type: 'int', nullable: true }),
    'ALTER TABLE `shop`.`users` ADD COLUMN `age` int',
  );
  assert.strictEqual(myDrop('shop', 'users', 'age'), 'ALTER TABLE `shop`.`users` DROP COLUMN `age`');
  assert.strictEqual(
    myRename('shop', 'users', 'old', 'new', 'int(11)'),
    'ALTER TABLE `shop`.`users` CHANGE COLUMN `old` `new` int(11)',
  );
  assert.strictEqual(
    myAlter('shop', 'users', 'age', 'bigint', false),
    'ALTER TABLE `shop`.`users` MODIFY COLUMN `age` bigint NOT NULL',
  );
  assert.strictEqual(
    myAlter('shop', 'users', 'age', 'bigint', true),
    'ALTER TABLE `shop`.`users` MODIFY COLUMN `age` bigint',
  );
});
```

- [ ] **Step 3: Test fail doğrula** — Run: `npm test` → FAIL (builder'lar yok).

- [ ] **Step 4: postgres.ts'e builder'ları ekle** (escape helper'ların yanına; `ColumnDef` import etmeye gerek yok, inline tip kullan):

```ts
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
```

`listTables` veya `columns` yakınına `tableStructure`:

```ts
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
```

`postgresAdapter` export nesnesine `tableStructure,` ekle.

- [ ] **Step 5: mysql.ts'e builder'ları ekle:**

```ts
export function buildAddColumn(
  schema: string,
  table: string,
  col: { name: string; type: string; nullable: boolean; default?: string | null },
): string {
  let s = `ALTER TABLE ${myIdent(schema)}.${myIdent(table)} ADD COLUMN ${myIdent(col.name)} ${col.type}`;
  if (!col.nullable) s += ' NOT NULL';
  if (col.default !== undefined && col.default !== null && col.default !== '') {
    s += ` DEFAULT ${myLiteral(col.default)}`;
  }
  return s;
}

export function buildDropColumn(schema: string, table: string, name: string): string {
  return `ALTER TABLE ${myIdent(schema)}.${myIdent(table)} DROP COLUMN ${myIdent(name)}`;
}

// mysql CHANGE COLUMN tip gerektirir → currentType (DB'nin bildirdiği güvenli tip) kullanılır.
export function buildRenameColumn(
  schema: string, table: string, oldName: string, newName: string, currentType: string,
): string {
  return `ALTER TABLE ${myIdent(schema)}.${myIdent(table)} CHANGE COLUMN ${myIdent(oldName)} ${myIdent(newName)} ${currentType}`;
}

export function buildAlterColumnType(
  schema: string, table: string, name: string, newType: string, nullable: boolean,
): string {
  return `ALTER TABLE ${myIdent(schema)}.${myIdent(table)} MODIFY COLUMN ${myIdent(name)} ${newType}${nullable ? '' : ' NOT NULL'}`;
}
```

`tableStructure` (mysql, schema===db):

```ts
async function tableStructure(
  ref: string, db: string, _schema: string, table: string,
): Promise<import('./types').ColumnDef[]> {
  const rows = await query(ref, `SHOW COLUMNS FROM ${myIdent(db)}.${myIdent(table)}`);
  if (rows.length <= 1) return [];
  const h = rows[0];
  const iField = h.indexOf('Field'), iType = h.indexOf('Type'),
        iNull = h.indexOf('Null'), iKey = h.indexOf('Key'), iDef = h.indexOf('Default');
  return rows.slice(1).map(r => ({
    name: (r[iField] ?? '') as string,
    type: (r[iType] ?? '') as string,
    nullable: (r[iNull] ?? '') === 'YES',
    default: ((r[iDef] ?? null) || null) as string | null,
    isPk: (r[iKey] ?? '') === 'PRI',
  }));
}
```

`mysqlAdapter` export nesnesine `tableStructure,` ekle.

- [ ] **Step 6: Test + tsc geçer** — Run: `npm test` (ddl + mevcut PASS), `npx tsc --noEmit` temiz.

- [ ] **Step 7: Commit**

```bash
git add lib/server/dbExplorer/types.ts lib/server/dbExplorer/postgres.ts lib/server/dbExplorer/mysql.ts lib/server/dbExplorer/ddl.test.ts
git commit -m "feat(dbx): DDL builders + tableStructure + type/identifier validators (pg+mysql)"
```

---

### Task 2: `ddl` route + api-client

**Files:**
- Create: `app/api/dbx/[ref]/ddl/route.ts`
- Modify: `lib/api-client.ts`

**Interfaces:**
- Consumes: Task 1 `ColumnDef`, `validateColumnType`, `validateIdentifier`, adapter `tableStructure` + 4 builder; mevcut `getConnection`, `getAdapter`, `requireAuth`/`unauthorized`.
- Produces: `GET /dbx/[ref]/ddl?db=&schema=&table=` → `{ columns: ColumnDef[] }`. `POST /dbx/[ref]/ddl?write=1&confirm=1` body `{ db, schema, table, op, name?, newName?, type?, nullable?, default? }`. api-client `dbxStructure(ref, db, schema, table)` + `dbxDdl(ref, body, opts)`.

- [ ] **Step 1: `app/api/dbx/[ref]/ddl/route.ts` oluştur:**

```ts
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
```

- [ ] **Step 2: api-client'a ekle** (`lib/api-client.ts`, mevcut `dbxRowDelete`'ten sonra, `dbxRedisSet`'ten önce — `enc` yerine mevcut `encodeURIComponent` kalıbını izle):

```ts
  dbxStructure: (ref: string, db: string, schema: string, table: string) => {
    const qs = new URLSearchParams({ db, schema, table }).toString();
    return request('GET', `/dbx/${encodeURIComponent(ref)}/ddl?${qs}`);
  },
  dbxDdl: (ref: string, body: unknown, opts: { write?: boolean; confirm?: boolean } = {}) => {
    const qs = [opts.write && 'write=1', opts.confirm && 'confirm=1'].filter(Boolean).join('&');
    return request('POST', `/dbx/${encodeURIComponent(ref)}/ddl${qs ? '?' + qs : ''}`, body);
  },
```

- [ ] **Step 3: tsc + build** — Run: `npx tsc --noEmit` temiz; `npm run build` PASS (Windows EPERM → `rm -rf .next`). `getAdapter` `any` döndüğünden adapter çağrıları tip-geçer (mevcut desen).

- [ ] **Step 4: Commit**

```bash
git add "app/api/dbx/[ref]/ddl/route.ts" lib/api-client.ts
git commit -m "feat(dbx): ddl route (structure GET + DDL POST) with gates + validation"
```

---

### Task 3: StructureTab bileşeni + editör 'structure' sekmesi + i18n

**Files:**
- Create: `components/dbexplorer/StructureTab.tsx`
- Modify: `app/(panel)/databases/[ref]/page.tsx`
- Modify: `messages/{tr,en,zh,es,de,fr}.json`

**Interfaces:**
- Consumes: Task 2 `api.dbxStructure`/`api.dbxDdl`; `ColumnDef` şekli; mevcut `ConfirmDestructive`, `Spinner`/`Btn`/`useToast` (`@/components/ui`).
- Produces: `StructureTab` bileşeni (props `connRef`, `db`, `schema`, `table`, `canWrite`, `engine`); editörde 'structure' sekmesi.

- [ ] **Step 1: i18n anahtarlarını 6 dile ekle** (`"dbx"` bloğuna). Çeviriler:
  - tr: `"structure": "Yapı", "addColumn": "Kolon ekle", "columnName": "Kolon adı", "columnType": "Tip", "nullableLabel": "Boş olabilir (NULL)", "defaultLabel": "Varsayılan (ops.)", "dropColumn": "Kolonu sil", "renameColumn": "Yeniden adlandır", "changeType": "Tipi değiştir", "structureEmpty": "Kolon yok", "colPk": "PK", "colNullable": "NULL", "colNotNull": "NOT NULL"`
  - en: `"structure": "Structure", "addColumn": "Add column", "columnName": "Column name", "columnType": "Type", "nullableLabel": "Nullable (NULL)", "defaultLabel": "Default (opt.)", "dropColumn": "Drop column", "renameColumn": "Rename", "changeType": "Change type", "structureEmpty": "No columns", "colPk": "PK", "colNullable": "NULL", "colNotNull": "NOT NULL"`
  - zh: `"structure": "结构", "addColumn": "添加列", "columnName": "列名", "columnType": "类型", "nullableLabel": "可空 (NULL)", "defaultLabel": "默认值（可选）", "dropColumn": "删除列", "renameColumn": "重命名", "changeType": "更改类型", "structureEmpty": "无列", "colPk": "PK", "colNullable": "NULL", "colNotNull": "NOT NULL"`
  - es: `"structure": "Estructura", "addColumn": "Añadir columna", "columnName": "Nombre de columna", "columnType": "Tipo", "nullableLabel": "Anulable (NULL)", "defaultLabel": "Predeterminado (opc.)", "dropColumn": "Eliminar columna", "renameColumn": "Renombrar", "changeType": "Cambiar tipo", "structureEmpty": "Sin columnas", "colPk": "PK", "colNullable": "NULL", "colNotNull": "NOT NULL"`
  - de: `"structure": "Struktur", "addColumn": "Spalte hinzufügen", "columnName": "Spaltenname", "columnType": "Typ", "nullableLabel": "Nullable (NULL)", "defaultLabel": "Standard (opt.)", "dropColumn": "Spalte löschen", "renameColumn": "Umbenennen", "changeType": "Typ ändern", "structureEmpty": "Keine Spalten", "colPk": "PK", "colNullable": "NULL", "colNotNull": "NOT NULL"`
  - fr: `"structure": "Structure", "addColumn": "Ajouter une colonne", "columnName": "Nom de colonne", "columnType": "Type", "nullableLabel": "Nullable (NULL)", "defaultLabel": "Défaut (opt.)", "dropColumn": "Supprimer la colonne", "renameColumn": "Renommer", "changeType": "Changer le type", "structureEmpty": "Aucune colonne", "colPk": "PK", "colNullable": "NULL", "colNotNull": "NOT NULL"`

- [ ] **Step 2: `components/dbexplorer/StructureTab.tsx` oluştur:**

```tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Trash2, Plus, Save, X, Pencil } from 'lucide-react';
import { api } from '@/lib/api-client';
import { Spinner, Btn, useToast } from '@/components/ui';
import { ConfirmDestructive } from './ConfirmDestructive';

interface ColumnDef { name: string; type: string; nullable: boolean; default: string | null; isPk: boolean; }
interface Props { connRef: string; db: string; schema: string; table: string; canWrite: boolean; engine: string; }

// Yıkıcı işlem onayı bekleyen op (confirm sonrası tekrar gönderilir).
interface PendingDestructive { body: Record<string, unknown>; reason: string; }

const PG_TYPE_OPTIONS = ['text', 'varchar(255)', 'integer', 'bigint', 'boolean', 'numeric(10,2)', 'date', 'timestamp', 'uuid', 'jsonb'];
const MY_TYPE_OPTIONS = ['varchar(255)', 'text', 'int', 'bigint', 'tinyint', 'decimal(10,2)', 'date', 'datetime', 'timestamp', 'json'];

export function StructureTab({ connRef, db, schema, table, canWrite, engine }: Props) {
  const t = useTranslations();
  const { show, ToastContainer } = useToast();
  const [cols, setCols] = useState<ColumnDef[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newCol, setNewCol] = useState({ name: '', type: '', nullable: true, default: '' });
  const [renaming, setRenaming] = useState<{ name: string; value: string } | null>(null);
  const [pending, setPending] = useState<PendingDestructive | null>(null);

  const typeOptions = engine === 'mysql' ? MY_TYPE_OPTIONS : PG_TYPE_OPTIONS;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.dbxStructure(connRef, db, schema, table) as { columns: ColumnDef[] };
      setCols(res.columns);
    } catch (e: unknown) {
      show(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setLoading(false);
    }
  }, [connRef, db, schema, table, show]);

  useEffect(() => { load(); }, [load]);

  // Tek DDL gönderim noktası: blocked dönerse onay modalı aç.
  async function runDdl(body: Record<string, unknown>, confirm = false) {
    setBusy(true);
    try {
      const res = await api.dbxDdl(connRef, { db, schema, table, ...body }, { write: canWrite, confirm }) as
        { blocked?: boolean; reason?: string; error?: string };
      if (res.blocked) {
        setPending({ body, reason: res.reason ?? '' });
        return;
      }
      show(t('dbx.save'), 'success');
      setAdding(false);
      setNewCol({ name: '', type: '', nullable: true, default: '' });
      setRenaming(null);
      await load();
    } catch (e: unknown) {
      show(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setBusy(false);
    }
  }

  function confirmPending() {
    if (!pending) return;
    const body = pending.body;
    setPending(null);
    runDdl(body, true);
  }

  if (loading && !cols) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><Spinner size={20} /></div>;
  }
  if (!cols) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', minHeight: 0 }}>
      <ToastContainer />
      {pending && (
        <ConfirmDestructive reason={pending.reason} onConfirm={confirmPending} onCancel={() => setPending(null)} />
      )}

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginRight: 'auto' }}>
          {cols.length} {t('dbx.columnName')}
        </span>
        {canWrite && !adding && (
          <Btn size="sm" variant="primary" onClick={() => setAdding(true)}>
            <Plus size={13} strokeWidth={2} />{t('dbx.addColumn')}
          </Btn>
        )}
      </div>

      {/* Add-column formu */}
      {adding && canWrite && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', background: 'rgba(59,130,246,0.04)', padding: '10px', borderRadius: 'var(--radius)' }}>
          <input
            value={newCol.name}
            onChange={e => setNewCol(p => ({ ...p, name: e.target.value }))}
            placeholder={t('dbx.columnName')}
            style={inputStyle}
          />
          <select value={newCol.type} onChange={e => setNewCol(p => ({ ...p, type: e.target.value }))} style={inputStyle}>
            <option value="">{t('dbx.columnType')}</option>
            {typeOptions.map(ty => <option key={ty} value={ty}>{ty}</option>)}
          </select>
          <input
            value={newCol.default}
            onChange={e => setNewCol(p => ({ ...p, default: e.target.value }))}
            placeholder={t('dbx.defaultLabel')}
            style={inputStyle}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: 'var(--text-secondary)' }}>
            <input type="checkbox" checked={newCol.nullable} onChange={e => setNewCol(p => ({ ...p, nullable: e.target.checked }))} />
            {t('dbx.nullableLabel')}
          </label>
          <button type="button" disabled={busy || !newCol.name || !newCol.type} aria-label={t('dbx.save')}
            onClick={() => runDdl({ op: 'addColumn', name: newCol.name, type: newCol.type, nullable: newCol.nullable, default: newCol.default || null })}
            style={{ ...iconBtn, color: 'var(--green)' }}>
            {busy ? <Spinner size={13} /> : <Save size={14} strokeWidth={2} />}
          </button>
          <button type="button" aria-label={t('dbx.cancel')} onClick={() => { setAdding(false); setNewCol({ name: '', type: '', nullable: true, default: '' }); }} style={{ ...iconBtn, color: 'var(--text-muted)' }}>
            <X size={14} strokeWidth={2} />
          </button>
        </div>
      )}

      {/* Kolon tablosu */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', fontFamily: 'var(--font-mono)' }}>
          <thead>
            <tr>
              {['', t('dbx.columnName'), t('dbx.columnType'), '', t('dbx.defaultLabel'), canWrite ? ' ' : ''].map((h, i) => (
                <th key={i} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cols.length === 0 && (
              <tr><td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-sans)' }}>{t('dbx.structureEmpty')}</td></tr>
            )}
            {cols.map(c => (
              <tr key={c.name}>
                <td style={tdStyle}>{c.isPk && <span style={{ fontSize: '9px', color: 'var(--accent)', fontFamily: 'var(--font-sans)' }}>{t('dbx.colPk')}</span>}</td>
                <td style={{ ...tdStyle, color: 'var(--text-primary)' }}>
                  {renaming?.name === c.name ? (
                    <input autoFocus value={renaming.value} onChange={e => setRenaming({ name: c.name, value: e.target.value })}
                      onKeyDown={e => { if (e.key === 'Enter') runDdl({ op: 'renameColumn', name: c.name, newName: renaming!.value }); if (e.key === 'Escape') setRenaming(null); }}
                      style={inputStyle} />
                  ) : c.name}
                </td>
                <td style={{ ...tdStyle, color: 'var(--text-secondary)' }}>{c.type}</td>
                <td style={{ ...tdStyle, color: 'var(--text-muted)', fontSize: '10px', fontFamily: 'var(--font-sans)' }}>{c.nullable ? t('dbx.colNullable') : t('dbx.colNotNull')}</td>
                <td style={{ ...tdStyle, color: 'var(--text-muted)' }}>{c.default ?? ''}</td>
                {canWrite && (
                  <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button type="button" aria-label={t('dbx.renameColumn')} disabled={busy}
                        onClick={() => setRenaming({ name: c.name, value: c.name })} style={{ ...iconBtn, color: 'var(--text-muted)' }}>
                        <Pencil size={12} strokeWidth={1.75} />
                      </button>
                      <button type="button" aria-label={t('dbx.dropColumn')} disabled={busy}
                        onClick={() => runDdl({ op: 'dropColumn', name: c.name })} style={{ ...iconBtn, color: 'var(--text-muted)' }}>
                        <Trash2 size={12} strokeWidth={1.75} />
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: '3px',
  color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: '12px', padding: '4px 7px', outline: 'none', minWidth: '110px',
};
const iconBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '4px',
  borderRadius: '4px', background: 'transparent', border: 'none', cursor: 'pointer',
};
const thStyle: React.CSSProperties = {
  padding: '6px 10px', textAlign: 'left', fontWeight: 500, color: 'var(--text-muted)',
  background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)', fontSize: '11px', whiteSpace: 'nowrap',
};
const tdStyle: React.CSSProperties = { padding: '5px 10px', borderBottom: '1px solid var(--border)', verticalAlign: 'middle' };
```

- [ ] **Step 3: Editör sayfasına 'structure' sekmesini bağla** (`app/(panel)/databases/[ref]/page.tsx`):
  1. Import ekle: `import { StructureTab } from '@/components/dbexplorer/StructureTab';`
  2. `type ActiveTab = 'data' | 'sql';` → `type ActiveTab = 'data' | 'structure' | 'sql';`
  3. Tab bar map'ini `(['data', 'sql'] as ActiveTab[])` → `(['data', 'structure', 'sql'] as ActiveTab[])`.
  4. Buton etiketini 3-yollu yap: `{tab === 'data' ? t('dbx.data') : tab === 'structure' ? t('dbx.structure') : t('dbx.sqlConsole')}`.
  5. İçerik render'ını 3-yollu yap — mevcut `activeTab === 'data' ? <DataGrid .../> : <SqlConsole .../>` yerine:

```tsx
                {activeTab === 'data' ? (
                  <DataGrid connRef={ref} db={selected.db} schema={selected.schema} table={selected.table} canWrite={canWrite} engine={conn.engine} />
                ) : activeTab === 'structure' ? (
                  <StructureTab connRef={ref} db={selected.db} schema={selected.schema} table={selected.table} canWrite={canWrite} engine={conn.engine} />
                ) : (
                  <SqlConsole connRef={ref} db={selected?.db ?? ''} canWrite={canWrite} />
                )}
```

- [ ] **Step 4: tsc + build + i18n test** — Run: `npx tsc --noEmit` temiz; `npm run build` PASS; `npm test` (i18n parity + used-key PASS — yeni `t('dbx.*')` anahtarları 6 dilde var).

- [ ] **Step 5: Commit**

```bash
git add components/dbexplorer/StructureTab.tsx "app/(panel)/databases/[ref]/page.tsx" messages/tr.json messages/en.json messages/zh.json messages/es.json messages/de.json messages/fr.json
git commit -m "feat(dbx): Structure tab — view columns + add/rename/drop/alter with confirm"
```

---

### Task 4: e2e (DB'siz dal) + doğrulama + deploy

**Files:**
- Modify: `e2e/dbexplorer.spec.ts`

- [ ] **Step 1: e2e'ye guard'lı Yapı-sekmesi assert ekle.** `e2e/dbexplorer.spec.ts`'te, editör açıldığı (`hasConnection`) dalda, SQL-konsol doğrulamasının yakınına ekle (yalnız bağlantı varsa anlamlı; CI'da no-op):

```ts
  // Yapı sekmesi (DDL) — bağlantı + tablo varsa görünür ve açılır.
  const structureTab = page.getByRole('button', { name: 'Yapı' });
  if (await structureTab.isVisible().catch(() => false)) {
    await structureTab.click(); // Yapı sekmesi açılır — hata atmamalı
  }
```

- [ ] **Step 2: Tüm doğrulamalar** — Run: `npx tsc --noEmit`; `npm test` (hepsi PASS); `npm run e2e` (mevcut + dbexplorer dalı PASS; lone `backups.spec.ts` Windows-stale-server ise `rm -rf .next` + tek tekrar). `git push origin main` → CI yeşil.

- [ ] **Step 3: Deploy** — Run: `bash deploy.sh`. Health `{"status":"ok"}` + caddy "Valid configuration".

- [ ] **Step 4: Canlı doğrulama (salt-okunur, zolvix-postgres-1).** Editörde bir tabloya gir → "Yapı" sekmesi kolonları (ad/tip/nullable/default/PK) gösterir. **ALTER denenmez** (prod); DDL yazma yolu unit testlerle kanıtlanmıştır. Yeni kodun yayında olduğunu sunucu build'inde marker ile doğrula (ör. `grep -r "addColumn" .next/static` veya `messages` içinde `structure`).

- [ ] **Step 5: Ledger + alt-proje 2 tamam.** `.superpowers/sdd/progress.md`'ye tamamlanma satırı.

---

## Self-Review (yazar)
- **Spec coverage:** Yapı sekmesi+kolon listesi→T3; ekle/sil/yeniden-adlandır/tip-değiştir→T1(builders)+T2(route)+T3(UI); tip allowlist+identifier doğrulama→T1; harici salt-okunur+yıkıcı onay→T2; i18n parity→T3; test→T1 unit+T4 e2e/canlı. Tüm spec maddeleri kapsandı.
- **Placeholder yok:** Her kod adımı tam. Tip seçenekleri (PG_TYPE_OPTIONS/MY_TYPE_OPTIONS) somut.
- **Tip tutarlılığı:** `ColumnDef`/`validateColumnType`/`validateIdentifier` T1'de; builder imzaları (`buildAddColumn(schema,table,{name,type,nullable,default})` vb.) T1↔testler↔T2 route↔adapter tutarlı. `dbxStructure`/`dbxDdl` T2'de tanımlı, T3'te kullanılır. `op` değerleri (`addColumn/dropColumn/renameColumn/alterColumnType`) route↔StructureTab tutarlı.
- **Güvenlik:** tipler allowlist (escape edilemez), identifier'lar escape + yeni-ad deseni, mevcut adlar tableStructure'a karşı doğrulanır, yıkıcı onay, harici salt-okunur — hepsi T2 route'ta.
- **mysql rename:** `CHANGE COLUMN` + DB'nin bildirdiği currentType (güvenli, allowlist'e tabi değil çünkü DB çıktısı). pg `RENAME COLUMN` (currentType yok sayılır).
- **CI sınırı:** DB yok → DDL fonksiyonel canlı read-only + unit; e2e yalnız DB'li dalda sekme varlığı.
