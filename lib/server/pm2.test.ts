import { test } from 'node:test';
import assert from 'node:assert';
import { assertSafeName } from './pm2';

test('kötü process isimleri reddedilir', () => {
  for (const bad of ['evil; rm -rf /', 'a$(whoami)', 'b`id`', 'c && reboot', '']) {
    assert.throws(() => assertSafeName(bad), /Geçersiz process adı/);
  }
});
test('geçerli isimler kabul edilir', () => {
  for (const ok of ['zolpanel', 'my_app.1', 'Portfolio']) {
    assert.doesNotThrow(() => assertSafeName(ok));
  }
});
