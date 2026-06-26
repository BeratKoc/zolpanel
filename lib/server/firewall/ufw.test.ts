import { test } from 'node:test';
import assert from 'node:assert';
import { parseUfwStatus, validateRule, buildUfwAddArgs, isProtectedPort } from './ufw';

test('parseUfwStatus: active + numbered rules', () => {
  const out = [
    'Status: active', '',
    '     To                         Action      From',
    '     --                         ------      ----',
    '[ 1] 22/tcp                     ALLOW IN    Anywhere',
    '[ 2] 443/tcp                    ALLOW IN    Anywhere',
    '[ 3] 8080                       DENY IN     192.168.1.5',
  ].join('\n');
  const s = parseUfwStatus(out);
  assert.strictEqual(s.active, true);
  assert.strictEqual(s.rules.length, 3);
  assert.deepStrictEqual({ n: s.rules[0].num, to: s.rules[0].to, a: s.rules[0].action }, { n: 1, to: '22/tcp', a: 'ALLOW' });
  assert.strictEqual(s.rules[2].from, '192.168.1.5');
});

test('parseUfwStatus: inactive', () => {
  assert.deepStrictEqual(parseUfwStatus('Status: inactive'), { active: false, rules: [] });
});

test('validateRule', () => {
  assert.strictEqual(validateRule({ action: 'allow', port: 22, proto: 'tcp' }), null);
  assert.strictEqual(validateRule({ action: 'allow', port: 0, proto: 'tcp' }), 'Port 1-65535 olmalı');
  assert.strictEqual(validateRule({ action: 'allow', port: 22, proto: 'tcp', from: 'bad ip' }), 'Geçersiz IP');
  assert.strictEqual(validateRule({ action: 'allow', port: 22, proto: 'tcp', from: '10.0.0.1' }), null);
  // @ts-expect-error
  assert.strictEqual(validateRule({ action: 'drop', port: 22, proto: 'tcp' }), 'Geçersiz eylem');
});

test('buildUfwAddArgs', () => {
  assert.deepStrictEqual(buildUfwAddArgs({ action: 'allow', port: 443, proto: 'tcp' }), ['allow', '443/tcp']);
  assert.deepStrictEqual(buildUfwAddArgs({ action: 'allow', port: 53, proto: 'any' }), ['allow', '53']);
  assert.deepStrictEqual(buildUfwAddArgs({ action: 'deny', port: 8080, proto: 'tcp', from: '10.0.0.5' }),
    ['deny', 'from', '10.0.0.5', 'to', 'any', 'port', '8080', 'proto', 'tcp']);
});

test('isProtectedPort', () => {
  assert.strictEqual(isProtectedPort(22), true);
  assert.strictEqual(isProtectedPort(443), true);
  assert.strictEqual(isProtectedPort(8080), false);
});
