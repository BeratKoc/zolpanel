import { test } from 'node:test';
import assert from 'node:assert';
import { evaluateLeak, isLeakSuspect } from './memoryTracker';

const NOW = 1_700_000_000_000;
const HOUR = 60 * 60 * 1000;

test('plato (tek sıçrayıp sabitlenen) leak SAYILMAZ — asıl bug', () => {
  // 241 -> 511 bir kez sıçradı, sonra sabit: toplam artış 270 ama son yarı düz.
  const r = evaluateLeak([241, 511, 511, 511, 511], undefined, NOW);
  assert.strictEqual(r.isLeak, false);
  assert.strictEqual(r.warn, false);
});

test('gerçek sürekli artış leak SAYILIR ve ilk kez uyarır', () => {
  const r = evaluateLeak([241, 320, 400, 480, 560], undefined, NOW);
  assert.strictEqual(r.isLeak, true);
  assert.strictEqual(r.warn, true);
  assert.strictEqual(r.growth, 319);
});

test('cooldown içinde tekrar uyarmaz (spam engeli)', () => {
  const prev = { at: NOW - 1000, growth: 319 };
  const r = evaluateLeak([241, 320, 400, 480, 560], prev, NOW);
  assert.strictEqual(r.isLeak, true);
  assert.strictEqual(r.warn, false);
});

test('cooldown dolunca yeniden uyarır', () => {
  const prev = { at: NOW - 2 * HOUR, growth: 319 };
  const r = evaluateLeak([241, 320, 400, 480, 560], prev, NOW);
  assert.strictEqual(r.warn, true);
});

test('önceki uyarıdan beri belirgin (eşik kadar) daha büyüdüyse cooldown içinde de uyarır', () => {
  const prev = { at: NOW - 1000, growth: 50 };
  const r = evaluateLeak([241, 320, 400, 480, 560], prev, NOW);
  assert.strictEqual(r.warn, true); // 319 - 50 = 269 > 200
});

test('arada büyük düşüş varsa (dalgalı) leak sayılmaz', () => {
  const r = evaluateLeak([241, 300, 250, 480, 560], undefined, NOW);
  assert.strictEqual(r.isLeak, false);
});

test('3 noktadan az veri leak sayılmaz', () => {
  const r = evaluateLeak([241, 560], undefined, NOW);
  assert.strictEqual(r.isLeak, false);
});

// isLeakSuspect: dashboard rozeti ile log dedektörü AYNI mantığı kullanmalı.
test('isLeakSuspect: plato dashboard rozetinde de leak sayılmaz', () => {
  assert.strictEqual(isLeakSuspect([241, 511, 511, 511, 511]), false);
});

test('isLeakSuspect: gerçek sürekli artış leak sayılır', () => {
  assert.strictEqual(isLeakSuspect([241, 320, 400, 480, 560]), true);
});
