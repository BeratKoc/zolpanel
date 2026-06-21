import { test } from 'node:test';
import assert from 'node:assert';
import { parsePsLines, assertSafeContainerRef, resolveRef, buildRunArgs } from './docker';

const C = (id: string, name: string) => ({ id, name, image: '', state: 'running', status: '' });

test('resolveRef: tam id/ad eşleşmesi', () => {
  const all = [C('abc123', 'api'), C('def456', 'db')];
  assert.strictEqual(resolveRef(all, 'abc123').name, 'api');
  assert.strictEqual(resolveRef(all, 'db').id, 'def456');
});

test('resolveRef: tek kısa-id öneki çözülür', () => {
  assert.strictEqual(resolveRef([C('abc123', 'api'), C('xyz789', 'db')], 'abc').name, 'api');
});

test('resolveRef: belirsiz önek (çok eşleşme) reddedilir', () => {
  assert.throws(() => resolveRef([C('abc123', 'api'), C('abc999', 'db')], 'abc'), /Belirsiz/);
});

test('resolveRef: eşleşme yoksa bulunamadı', () => {
  assert.throws(() => resolveRef([C('abc123', 'api')], 'zzz'), /bulunamadı/);
});

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

test('buildRunArgs: sabit/kontrollü docker run argümanları üretir', () => {
  const a = buildRunArgs({ name: 'zolpanel-db-postgres-ab12', image: 'postgres:16-alpine', hostPort: 5433, containerPort: 5432, env: { POSTGRES_PASSWORD: 'p', POSTGRES_DB: 'app' }, volume: 'zolpanel-db-postgres-ab12-data', volumePath: '/var/lib/postgresql/data' });
  assert.deepStrictEqual(a, [
    'run','-d','--name','zolpanel-db-postgres-ab12','--restart','unless-stopped',
    '-p','5433:5432','-v','zolpanel-db-postgres-ab12-data:/var/lib/postgresql/data',
    '-e','POSTGRES_PASSWORD=p','-e','POSTGRES_DB=app','postgres:16-alpine',
  ]);
});
