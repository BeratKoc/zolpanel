import { test } from 'node:test';
import assert from 'node:assert';
import { createDomainSchema, caddyExtrasSchema } from './validation';

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
test('caddyExtras: header newline injection reddedilir', () => {
  assert.strictEqual(caddyExtrasSchema.safeParse({ headers: [{ key: 'X', value: 'a\nevil' }] }).success, false);
});
test('caddyExtras: geçersiz CIDR reddedilir', () => {
  assert.strictEqual(caddyExtrasSchema.safeParse({ ipRules: { mode: 'deny', cidrs: ['not an ip'] } }).success, false);
});
test('caddyExtras: geçerli set kabul', () => {
  assert.strictEqual(caddyExtrasSchema.safeParse({ headers: [{ key: 'X-Foo', value: 'bar' }], ipRules: { mode: 'allow', cidrs: ['10.0.0.0/8'] } }).success, true);
});
