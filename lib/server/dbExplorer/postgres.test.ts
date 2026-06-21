import { test } from 'node:test';
import assert from 'node:assert';
import { pgIdent, pgLiteral, buildUpdate, buildInsert, buildDelete } from './postgres';

test('pgIdent çift-tırnak kaçışı', () => {
  assert.strictEqual(pgIdent('a"b'), '"a""b"');
  assert.strictEqual(pgIdent('public'), '"public"');
  assert.strictEqual(pgIdent('my"bad"name'), '"my""bad""name"');
});

test('pgLiteral tek-tırnak kaçışı + null', () => {
  assert.strictEqual(pgLiteral("x'y"), "'x''y'");
  assert.strictEqual(pgLiteral(null), 'NULL');
  assert.strictEqual(pgLiteral('hello'), "'hello'");
  assert.strictEqual(pgLiteral("it's"), "'it''s'");
});

test('buildUpdate: PK ile parametreli güncelleme SQL\'i', () => {
  const sql = buildUpdate('public', 'users', { name: 'ali' }, { id: '1' });
  assert.strictEqual(sql, `UPDATE "public"."users" SET "name"='ali' WHERE "id"='1'`);
});

test('buildInsert: tek satır INSERT SQL\'i', () => {
  const sql = buildInsert('public', 'users', { id: '42', name: "o'brien" });
  assert.strictEqual(sql, `INSERT INTO "public"."users" ("id","name") VALUES ('42','o''brien')`);
});

test('buildDelete: WHERE koşullu DELETE SQL\'i', () => {
  const sql = buildDelete('public', 'users', { id: '99', status: 'active' });
  assert.strictEqual(sql, `DELETE FROM "public"."users" WHERE "id"='99' AND "status"='active'`);
});
