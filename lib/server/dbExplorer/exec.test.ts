import { test } from 'node:test';
import assert from 'node:assert';
import {
  MAX_CONCURRENT_EXEC,
  execSlotsInUse,
  tryAcquireExecSlot,
  releaseExecSlot,
  DbExecBusyError,
} from './exec';

test('exec slot guard: MAX kadar ayrılır, aşımda reddeder, release ile geri açılır', () => {
  assert.strictEqual(execSlotsInUse(), 0);
  for (let i = 0; i < MAX_CONCURRENT_EXEC; i++) {
    assert.strictEqual(tryAcquireExecSlot(), true, `slot ${i} alınmalı`);
  }
  assert.strictEqual(execSlotsInUse(), MAX_CONCURRENT_EXEC);
  // Doluyken yeni slot reddedilir (docker spawn edilmez)
  assert.strictEqual(tryAcquireExecSlot(), false);
  // Bir slot serbest bırakılınca tekrar alınabilir
  releaseExecSlot();
  assert.strictEqual(execSlotsInUse(), MAX_CONCURRENT_EXEC - 1);
  assert.strictEqual(tryAcquireExecSlot(), true);
  // Temizle (test izolasyonu)
  for (let i = 0; i < MAX_CONCURRENT_EXEC; i++) releaseExecSlot();
  assert.strictEqual(execSlotsInUse(), 0);
  // release taban 0'ın altına inmez
  releaseExecSlot();
  assert.strictEqual(execSlotsInUse(), 0);
});

test('DbExecBusyError tipi', () => {
  const e = new DbExecBusyError();
  assert.strictEqual(e.name, 'DbExecBusyError');
  assert.match(e.message, /meşgul/);
});
