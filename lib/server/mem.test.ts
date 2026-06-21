import { test } from 'node:test';
import assert from 'node:assert';
import { computeMemoryInfo } from './mem';

// Sunucudaki gerçek ölçüm (byte cinsinden):
//   total 32867540 kB, MemAvailable 9304140 kB, balloon 5341184 sayfa × 4096
const KB = 1024;
const total = 32867540 * KB;
const available = 9304140 * KB;
const balloon = 5341184 * 4096; // ≈ 20.4 GB
const used = total - 4866632 * KB; // total - MemFree

test('balloon kullanılmış sayılmaz: realUsed ≈ 2.1GB, effectiveTotal ≈ 11GB', () => {
  const m = computeMemoryInfo({ total, used, active: total - available, free: 4866632 * KB, available }, balloon);
  // realUsed = total - available - balloon
  assert.strictEqual(m.realUsed, total - available - balloon);
  assert.strictEqual(m.effectiveTotal, total - balloon);
  assert.strictEqual(m.realPercent, 19);
  assert.strictEqual(m.balloon, balloon);
  // ham active balloon yüzünden yüksek kalır (eski yanıltıcı değer)
  assert.ok(m.activePercent > 60);
});

test('balloon yoksa realUsed = total - available, balloon 0', () => {
  const m = computeMemoryInfo({ total, used, active: total - available, free: 4866632 * KB, available }, 0);
  assert.strictEqual(m.balloon, 0);
  assert.strictEqual(m.effectiveTotal, total);
  assert.strictEqual(m.realUsed, total - available);
});

test('saçma balloon (>= total) 0 sayılır', () => {
  const m = computeMemoryInfo({ total, used, active: total, free: 0, available }, total + 1);
  assert.strictEqual(m.balloon, 0);
  assert.strictEqual(m.effectiveTotal, total);
});

test('available yoksa free + buffcache ile hesaplanır', () => {
  const m = computeMemoryInfo({ total, used, active: 0, free: 1000, buffcache: 500 }, 0);
  assert.strictEqual(m.available, 1500);
});
