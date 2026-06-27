import { test } from 'node:test';
import assert from 'node:assert';
import { getSignatureKey, sha256hex } from './sigv4';

test('getSignatureKey: AWS dökümante test vektörü', () => {
  // AWS docs "Deriving the signing key" örneği
  const key = getSignatureKey('wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY', '20120215', 'us-east-1', 'iam');
  assert.strictEqual(key.toString('hex'), 'f4780e2d9f65fa895f9c67b32ce1baf0b0d8a43505a000a1a9e090d414db404d');
});
test('sha256hex bilinen değer', () => {
  assert.strictEqual(sha256hex(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
});
