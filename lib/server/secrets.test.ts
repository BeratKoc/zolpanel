import { test } from 'node:test';
import assert from 'node:assert';
import { encryptSecret, decryptSecret } from './secrets';
test('encrypt→decrypt round-trip', () => {
  const s = 'cf-token-abc123!@#';
  const blob = encryptSecret(s);
  assert.notStrictEqual(blob, s);
  assert.strictEqual(decryptSecret(blob), s);
});
test('tampered blob throws', () => {
  const blob = encryptSecret('x');
  const parts = blob.split(':'); parts[2] = Buffer.from('tampered').toString('base64');
  assert.throws(() => decryptSecret(parts.join(':')));
});
test('malformed throws', () => { assert.throws(() => decryptSecret('garbage')); });
