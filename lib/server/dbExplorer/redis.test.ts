import { test } from 'node:test';
import assert from 'node:assert';
import { parseScan, parseRequirepass } from './redis';

test('parseScan: satır başına anahtar', () => {
  assert.deepStrictEqual(parseScan('key1\nkey2\n\n'), ['key1', 'key2']);
  assert.deepStrictEqual(parseScan(''), []);
});

test('parseRequirepass: komut argümanlarından şifreyi çıkarır', () => {
  assert.strictEqual(parseRequirepass(['redis-server', '--requirepass', 'zolvix123', '--maxmemory', '512mb']), 'zolvix123');
  assert.strictEqual(parseRequirepass(['redis-server']), null);
  assert.strictEqual(parseRequirepass(['redis-server', '--requirepass']), null);
});
