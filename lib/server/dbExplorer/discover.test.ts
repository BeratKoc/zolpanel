import { test } from 'node:test';
import assert from 'node:assert';
import { engineForImage } from './discover';

test('engineForImage: bilinen imajlar', () => {
  assert.strictEqual(engineForImage('postgres:16-alpine'), 'postgres');
  assert.strictEqual(engineForImage('pgvector/pgvector:pg16'), 'postgres');
  assert.strictEqual(engineForImage('mysql:8'), 'mysql');
  assert.strictEqual(engineForImage('mariadb:11'), 'mysql');
  assert.strictEqual(engineForImage('redis:7-alpine'), 'redis');
  assert.strictEqual(engineForImage('node:22'), null);
});
