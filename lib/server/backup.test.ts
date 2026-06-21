import { test } from 'node:test';
import assert from 'node:assert';
import { assertSafeBackupName, pickToPrune } from './backup';

test('assertSafeBackupName: geçerli yedek adı kabul', () => {
  assert.doesNotThrow(() => assertSafeBackupName('zolpanel-backup-2026-06-21T10-00-00Z.tar.gz'));
});
test('assertSafeBackupName: traversal/uzantı/enjeksiyon reddedilir', () => {
  for (const bad of ['../etc/passwd', 'x.tar.gz', 'zolpanel-backup-../a.tar.gz', 'zolpanel-backup-x.txt', 'a;rm.tar.gz', '']) {
    assert.throws(() => assertSafeBackupName(bad));
  }
});
test('pickToPrune: en eski(ler) seçilir, son N tutulur', () => {
  const names = ['zolpanel-backup-2026-06-01T00-00-00Z.tar.gz','zolpanel-backup-2026-06-02T00-00-00Z.tar.gz','zolpanel-backup-2026-06-03T00-00-00Z.tar.gz'];
  assert.deepStrictEqual(pickToPrune(names, 2), ['zolpanel-backup-2026-06-01T00-00-00Z.tar.gz']);
  assert.deepStrictEqual(pickToPrune(names, 5), []);
});
