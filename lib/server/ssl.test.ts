import { test } from 'node:test';
import assert from 'node:assert';
import { classifyCertInfo } from './ssl';

const future = new Date(Date.now() + 86400000 * 60).toUTCString();
const past = new Date(Date.now() - 86400000).toUTCString();

test('public CA + eşleşme + süre → active + issuer + validTo', () => {
  const r = classifyCertInfo({ valid_to: future, issuer: { O: "Let's Encrypt" }, subjectaltname: 'DNS:a.com', subject: { CN: 'a.com' } } as never, 'a.com');
  assert.strictEqual(r.status, 'active');
  assert.match(r.issuer ?? '', /Let's Encrypt/);
  assert.ok(r.validTo);
});
test('caddy internal CA → pending', () => {
  const r = classifyCertInfo({ valid_to: future, issuer: { CN: 'Caddy Local Authority' }, subjectaltname: 'DNS:a.com', subject: { CN: 'a.com' } } as never, 'a.com');
  assert.strictEqual(r.status, 'pending');
});
test('süresi dolmuş → error', () => {
  const r = classifyCertInfo({ valid_to: past, issuer: { O: "Let's Encrypt" }, subjectaltname: 'DNS:a.com', subject: { CN: 'a.com' } } as never, 'a.com');
  assert.strictEqual(r.status, 'error');
});
test('cert yok → pending', () => {
  assert.strictEqual(classifyCertInfo({} as never, 'a.com').status, 'pending');
});
