import { test } from 'node:test';
import assert from 'node:assert';
import { createDomainSchema } from './validation';

test('Caddyfile injection denemesi reddedilir', () => {
  const r = createDomainSchema.safeParse({
    type: 'proxy', domain: 'evil.com\n}\nhacked.com {', port: 3000,
  });
  assert.strictEqual(r.success, false);
});
test('port sayı olmalı', () => {
  const r = createDomainSchema.safeParse({ type: 'proxy', domain: 'ok.com', port: 'abc' });
  assert.strictEqual(r.success, false);
});
test('geçerli proxy domain kabul edilir', () => {
  const r = createDomainSchema.safeParse({ type: 'proxy', domain: 'app.ornek.com', port: 3000 });
  assert.strictEqual(r.success, true);
});
