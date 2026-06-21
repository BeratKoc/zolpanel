import { test } from 'node:test';
import assert from 'node:assert';
import { parseScan } from './redis';

test('parseScan: satır başına anahtar', () => {
  assert.deepStrictEqual(parseScan('key1\nkey2\n\n'), ['key1', 'key2']);
  assert.deepStrictEqual(parseScan(''), []);
});
