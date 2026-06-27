import { test } from 'node:test';
import assert from 'node:assert';
import { generateApiToken, hashApiToken } from './apitoken';
test('generateApiToken: zpat_ önekli, hash tutarlı', () => {
  const { token, hash } = generateApiToken();
  assert.match(token, /^zpat_[A-Za-z0-9_-]+$/);
  assert.strictEqual(hash, hashApiToken(token));
  assert.notStrictEqual(token, hash);
});
test('farklı token farklı hash', () => {
  assert.notStrictEqual(generateApiToken().token, generateApiToken().token);
});
