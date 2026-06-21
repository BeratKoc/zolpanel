import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Set env vars BEFORE any import that transitively opens the db.
process.env.DB_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'zolpanel-db-'));
process.env.ZOLPANEL_TEST_ADMIN_PASSWORD = 'Test1234secure!';

import { initDb, insertDatabase, getAllDatabases, getDatabaseById, getDatabaseByPort, removeDatabase } from './db';

initDb();

test('databases CRUD round-trip', () => {
  const doc = insertDatabase({
    engine: 'postgres',
    name: 'zolpanel-db-postgres-test1',
    dbName: 'app',
    username: 'app',
    password: 'secret',
    hostPort: 5433,
    volume: 'v',
    containerId: 'c1',
    createdAt: new Date().toISOString(),
  });

  assert.ok(doc._id, 'inserted doc should have _id');
  assert.strictEqual(doc.engine, 'postgres');
  assert.strictEqual(doc.name, 'zolpanel-db-postgres-test1');

  const all = getAllDatabases();
  assert.ok(all.some(d => d._id === doc._id), 'getAllDatabases should include inserted doc');

  const byId = getDatabaseById(doc._id!);
  assert.ok(byId, 'getDatabaseById should return the doc');
  assert.strictEqual(byId!._id, doc._id);
  assert.strictEqual(byId!.hostPort, 5433);

  const byPort = getDatabaseByPort(5433);
  assert.ok(byPort, 'getDatabaseByPort should find the doc');
  assert.strictEqual(byPort!._id, doc._id);

  removeDatabase(doc._id!);

  const afterRemove = getAllDatabases();
  assert.ok(!afterRemove.some(d => d._id === doc._id), 'removeDatabase should delete the doc');
  assert.strictEqual(getDatabaseById(doc._id!), undefined);
  assert.strictEqual(getDatabaseByPort(5433), undefined);
});
