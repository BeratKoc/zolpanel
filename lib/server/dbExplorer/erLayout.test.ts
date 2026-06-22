import { test } from 'node:test';
import assert from 'node:assert';
import { assembleErModel, computeErLayout, ER_HEADER_H, ER_ROW_H, ER_BOX_W } from './types';

test('assembleErModel: tablolar + PK/FK işaretleri + kenarlar', () => {
  const cols = [['table_name', 'column_name'], ['users', 'id'], ['users', 'name'], ['posts', 'id'], ['posts', 'user_id']];
  const pks = [['table_name', 'column_name'], ['users', 'id'], ['posts', 'id']];
  const fks = [['from_t', 'from_c', 'to_t', 'to_c'], ['posts', 'user_id', 'users', 'id']];
  const m = assembleErModel(cols, pks, fks);
  assert.strictEqual(m.tables.length, 2);
  const users = m.tables.find(t => t.name === 'users')!;
  assert.deepStrictEqual(users.columns.find(c => c.name === 'id'), { name: 'id', isPk: true, isFk: false });
  const posts = m.tables.find(t => t.name === 'posts')!;
  assert.deepStrictEqual(posts.columns.find(c => c.name === 'user_id'), { name: 'user_id', isPk: false, isFk: true });
  assert.deepStrictEqual(m.edges, [{ fromTable: 'posts', fromCol: 'user_id', toTable: 'users', toCol: 'id' }]);
});

test('assembleErModel: boş girdi (yalnız header) → boş model', () => {
  const m = assembleErModel([['table_name', 'column_name']], [['table_name', 'column_name']], [['from_t', 'from_c', 'to_t', 'to_c']]);
  assert.deepStrictEqual(m, { tables: [], edges: [] });
});

test('computeErLayout: boş → boş layout', () => {
  assert.deepStrictEqual(computeErLayout([], []), { nodes: [], width: 0, height: 0 });
});

test('computeErLayout: 4 tablo → 2 sütun grid, çakışmasız, doğru kutu yüksekliği', () => {
  const tables = [1, 2, 3, 4].map(i => ({ name: `t${i}`, columns: [{ name: 'a', isPk: true, isFk: false }, { name: 'b', isPk: false, isFk: false }] }));
  const lay = computeErLayout(tables, []);
  assert.strictEqual(lay.nodes.length, 4);
  // 4 tablo → cols=2; node0 (0,0), node1 sağda, node2 alt satır
  assert.strictEqual(lay.nodes[0].x, lay.nodes[2].x); // aynı sütun
  assert.ok(lay.nodes[1].x > lay.nodes[0].x);          // node1 sağda
  assert.ok(lay.nodes[2].y > lay.nodes[0].y);          // node2 altta
  assert.strictEqual(lay.nodes[0].h, ER_HEADER_H + 2 * ER_ROW_H);
  assert.strictEqual(lay.nodes[0].w, ER_BOX_W);
  assert.ok(lay.width > 0 && lay.height > 0);
  // çakışma yok: node0 ve node1 yatayda ayrık
  assert.ok(lay.nodes[1].x >= lay.nodes[0].x + lay.nodes[0].w);
});
