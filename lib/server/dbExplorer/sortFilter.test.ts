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
