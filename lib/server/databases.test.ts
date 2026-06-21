import { test } from 'node:test';
import assert from 'node:assert';
import { buildConnectionString, ENGINES } from './databases';

test('postgres bağlantı dizesi', () => {
  const s = buildConnectionString({ engine:'postgres', username:'app', password:'p', hostPort:5433, dbName:'app' } as never);
  assert.strictEqual(s, 'postgresql://app:p@127.0.0.1:5433/app');
});
test('redis bağlantı dizesi (şifreli)', () => {
  const s = buildConnectionString({ engine:'redis', password:'p', hostPort:6380 } as never);
  assert.strictEqual(s, 'redis://:p@127.0.0.1:6380');
});
test('ENGINES sadece allowlist imajları', () => {
  for (const e of Object.values(ENGINES)) assert.match(e.image, /^(postgres:16-alpine|mysql:8|redis:7-alpine)$/);
});
