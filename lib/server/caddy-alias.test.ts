import { test } from 'node:test';
import assert from 'node:assert';
// db.ts (nedb/better-sqlite3) yüklenmesin diye stub
const dbPath = require.resolve('./db.ts');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { addLog: () => {} } } as never;
import { buildDomainBlock } from './caddy';

test('buildDomainBlock: bare alias FQDN e genişler (www -> www.<domain>)', () => {
  const b = buildDomainBlock({ domain: 'a.com', type: 'proxy', port: 3002, aliases: ['www'] } as never);
  assert.ok(b.includes('a.com, www.a.com {'), b);
});

test('buildDomainBlock: FQDN alias olduğu gibi kalır', () => {
  const b = buildDomainBlock({ domain: 'a.com', type: 'proxy', port: 3002, aliases: ['www.a.com'] } as never);
  assert.ok(b.includes('a.com, www.a.com {'), b);
});

test('buildDomainBlock: alias yoksa sadece domain', () => {
  const b = buildDomainBlock({ domain: 'a.com', type: 'proxy', port: 3002, aliases: [] } as never);
  assert.ok(b.startsWith('a.com {'), b);
});
