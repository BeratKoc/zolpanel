import { test } from 'node:test';
import assert from 'node:assert';
import { myIdent, myLiteral, buildUpdate, buildInsert, buildDelete } from './mysql';

test('myIdent backtick kaçışı', () => {
  assert.strictEqual(myIdent('a`b'), '`a``b`');
  assert.strictEqual(myIdent('users'), '`users`');
  assert.strictEqual(myIdent('my`bad`name'), '`my``bad``name`');
});

test('myLiteral kaçış + null', () => {
  assert.strictEqual(myLiteral("x'y"), "'x''y'");
  assert.strictEqual(myLiteral(null), 'NULL');
  assert.strictEqual(myLiteral('hello'), "'hello'");
  assert.strictEqual(myLiteral('back\\slash'), "'back\\\\slash'");
});

test('buildUpdate backtick + WHERE', () => {
  assert.strictEqual(
    buildUpdate('app', 'users', { name: 'ali' }, { id: '1' }),
    "UPDATE `app`.`users` SET `name`='ali' WHERE `id`='1'"
  );
});

test('buildInsert: tek satır INSERT SQL\'i', () => {
  const sql = buildInsert('app', 'users', { id: '42', name: "o'brien" });
  assert.strictEqual(sql, "INSERT INTO `app`.`users` (`id`,`name`) VALUES ('42','o''brien')");
});

test('buildDelete: WHERE koşullu DELETE SQL\'i', () => {
  const sql = buildDelete('app', 'users', { id: '99', status: 'active' });
  assert.strictEqual(sql, "DELETE FROM `app`.`users` WHERE `id`='99' AND `status`='active'");
});
