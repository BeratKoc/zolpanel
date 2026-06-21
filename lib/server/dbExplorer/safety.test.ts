import { test } from 'node:test';
import assert from 'node:assert';
import { classifySql, isWriteSql } from './safety';

test('DROP/TRUNCATE yıkıcı', () => {
  assert.strictEqual(classifySql('DROP TABLE x').destructive, true);
  assert.strictEqual(classifySql('truncate t').destructive, true);
});

test("WHERE'siz DELETE/UPDATE yıkıcı, WHERE'li değil", () => {
  assert.strictEqual(classifySql('DELETE FROM t').destructive, true);
  assert.strictEqual(classifySql('update t set a=1').destructive, true);
  assert.strictEqual(classifySql('delete from t where id=1').destructive, false);
  assert.strictEqual(classifySql('SELECT * FROM t').destructive, false);
});

test('isWriteSql: SELECT/SHOW okuma, diğerleri yazma', () => {
  assert.strictEqual(isWriteSql('SELECT 1'), false);
  assert.strictEqual(isWriteSql('  show tables'), false);
  assert.strictEqual(isWriteSql('INSERT INTO t VALUES(1)'), true);
  assert.strictEqual(isWriteSql('EXPLAIN ANALYZE SELECT 1'), false);
});
