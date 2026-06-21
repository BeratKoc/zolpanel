import { test } from 'node:test';
import assert from 'node:assert';
import { parsePsLines, assertSafeContainerRef } from './docker';

test('parsePsLines: docker ps --format json satırlarını ayrıştırır', () => {
  const out = [
    JSON.stringify({ ID: 'a1b2c3', Names: 'zolvix-api-1', Image: 'node:22', State: 'running', Status: 'Up 2 hours' }),
    JSON.stringify({ ID: 'd4e5f6', Names: 'zolvix-pg-1', Image: 'postgres:16', State: 'exited', Status: 'Exited (0)' }),
  ].join('\n');
  const r = parsePsLines(out);
  assert.strictEqual(r.length, 2);
  assert.deepStrictEqual(r[0], { id: 'a1b2c3', name: 'zolvix-api-1', image: 'node:22', state: 'running', status: 'Up 2 hours' });
  assert.strictEqual(r[1].state, 'exited');
});

test('parsePsLines: boş çıktı → boş dizi; bozuk satır atlanır', () => {
  assert.deepStrictEqual(parsePsLines(''), []);
  assert.deepStrictEqual(parsePsLines('not json\n'), []);
});

test('assertSafeContainerRef: geçerli id/ad kabul', () => {
  assert.doesNotThrow(() => assertSafeContainerRef('a1b2c3d4'));
  assert.doesNotThrow(() => assertSafeContainerRef('zolvix-api-1'));
});

test('assertSafeContainerRef: enjeksiyon/boşluk/; reddedilir', () => {
  for (const bad of ['a;rm -rf /', 'a b', '$(x)', '../x', '-rf', '', 'a'.repeat(200)]) {
    assert.throws(() => assertSafeContainerRef(bad));
  }
});
