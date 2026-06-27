import { test } from 'node:test';
import assert from 'node:assert';
import { generateTotp, verifyTotp, base32Decode, randomBase32Secret } from './totp';

const SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'; // "12345678901234567890"

test('base32Decode ASCII secret', () => {
  assert.strictEqual(base32Decode(SECRET).toString('ascii'), '12345678901234567890');
});
test('generateTotp RFC 6238 vektörleri (SHA1, 6 hane)', () => {
  assert.strictEqual(generateTotp(SECRET, 59 * 1000), '287082');           // T=59 → ...287082
  assert.strictEqual(generateTotp(SECRET, 1111111109 * 1000), '081804');   // → ...081804
  assert.strictEqual(generateTotp(SECRET, 1234567890 * 1000), '005924');   // → ...005924
});
test('verifyTotp doğru kodu kabul, yanlışı red', () => {
  const t = 1111111109 * 1000;
  assert.strictEqual(verifyTotp(SECRET, '081804', t), true);
  assert.strictEqual(verifyTotp(SECRET, '000000', t), false);
});
test('verifyTotp pencere (±1 periyot)', () => {
  const t = 1111111109 * 1000;
  assert.strictEqual(verifyTotp(SECRET, generateTotp(SECRET, t - 30000), t), true); // önceki periyot
});
test('randomBase32Secret uzunluk + alfabe', () => {
  const s = randomBase32Secret();
  assert.match(s, /^[A-Z2-7]+$/);
  assert.ok(s.length >= 30);
});
