import { test } from 'node:test';
import assert from 'node:assert';
const dbPath = require.resolve('./db.ts');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { addLog: () => {} } } as any;
import { extractUnmanaged, buildManagedRegion, composeCaddyfile, MANAGED_START, MANAGED_END } from './caddy';

const LIVE = `zolvix.app, www.zolvix.app {
    reverse_proxy localhost:3000
}

panel.zolvix.app {
    reverse_proxy 127.0.0.1:3999
}

ahmetberatkoc.com {
    reverse_proxy localhost:3002
}

mapper.ahmetberatkoc.com {
    reverse_proxy localhost:3001
}
`;
const MANAGED_NAMES = ['zolvix.app', 'ahmetberatkoc.com'];

test('extractUnmanaged: managed çıkar, unmanaged (panel + mapper) korunur', () => {
  const u = extractUnmanaged(LIVE, MANAGED_NAMES);
  assert.ok(/panel\.zolvix\.app\s*\{/.test(u));
  assert.ok(/mapper\.ahmetberatkoc\.com\s*\{/.test(u));
  assert.ok(!/^zolvix\.app,/m.test(u));
  assert.ok(!/^ahmetberatkoc\.com\s*\{/m.test(u));
});
test('composeCaddyfile: işaretli + idempotent', () => {
  const u = extractUnmanaged(LIVE, MANAGED_NAMES);
  const managed = buildManagedRegion([
    { domain:'zolvix.app', type:'proxy', port:3000, aliases:['www.zolvix.app'] } as any,
    { domain:'ahmetberatkoc.com', type:'proxy', port:3002, aliases:[] } as any,
  ]);
  const out1 = composeCaddyfile(u, managed);
  assert.ok(out1.includes(MANAGED_START) && out1.includes(MANAGED_END));
  assert.ok(/panel\.zolvix\.app/.test(out1) && /zolvix\.app, www\.zolvix\.app/.test(out1));
  const u2 = extractUnmanaged(out1, MANAGED_NAMES);
  assert.ok(/panel\.zolvix\.app/.test(u2) && !/zolpanel-managed/.test(u2));
});
test('buildManagedRegion: yalnız verilenler', () => {
  const m = buildManagedRegion([{ domain:'a.com', type:'proxy', port:3001, aliases:[] } as any]);
  assert.ok(m.includes('a.com') && m.includes('reverse_proxy localhost:3001'));
});
