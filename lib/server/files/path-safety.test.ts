import { test } from 'node:test';
import assert from 'node:assert';
import { safePath, formatSize, UnsafePathError } from './path-safety';

test('safePath: geçerli mutlak yolu normalize eder', () => {
  assert.strictEqual(safePath('/etc/nginx/'), '/etc/nginx');
  assert.strictEqual(safePath('/var/www/../log'), '/var/log');
  assert.strictEqual(safePath('/'), '/');
});

test('safePath: geçersizleri reddeder', () => {
  assert.throws(() => safePath(''), UnsafePathError);
  assert.throws(() => safePath('relative/path'), UnsafePathError);
  assert.throws(() => safePath('/etc/\0/passwd'), UnsafePathError);
  // @ts-expect-error tip dışı
  assert.throws(() => safePath(null), UnsafePathError);
});

test('safePath: .. ile köke tırmanma normalize edilir (kök dışına çıkmaz)', () => {
  assert.strictEqual(safePath('/../../../etc'), '/etc'); // normalize köke sabitler
});

test('formatSize', () => {
  assert.strictEqual(formatSize(0), '0 B');
  assert.strictEqual(formatSize(1024), '1.0 KB');
  assert.strictEqual(formatSize(1536), '1.5 KB');
  assert.strictEqual(formatSize(-1), '—');
});
