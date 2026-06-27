import { test } from 'node:test';
import assert from 'node:assert';
import { validateDnsRecord } from './validate';
test('valid records', () => {
  assert.strictEqual(validateDnsRecord({ type: 'A', name: 'app', content: '1.2.3.4', ttl: 1 }), null);
  assert.strictEqual(validateDnsRecord({ type: 'MX', name: '@', content: 'mail.x.com', ttl: 3600, priority: 10 }), null);
});
test('invalid', () => {
  assert.strictEqual(validateDnsRecord({ type: 'ZZ', name: 'a', content: 'b', ttl: 1 }), 'Geçersiz kayıt tipi');
  assert.strictEqual(validateDnsRecord({ type: 'A', name: '', content: 'b', ttl: 1 }), 'Ad boş olamaz');
  assert.strictEqual(validateDnsRecord({ type: 'A', name: 'a', content: 'b', ttl: 5 }), 'TTL 1 (auto) veya 60-86400 olmalı');
  assert.strictEqual(validateDnsRecord({ type: 'MX', name: 'a', content: 'b', ttl: 1 }), 'MX kaydı için öncelik gerekli');
});
