import { test } from 'node:test';
import assert from 'node:assert';
import { removeDomainBlock, buildDomainBlock, parseCaddyfile } from './caddy';
import fs from 'fs';
import os from 'os';
import path from 'path';

const REAL = `
zolvix.app, www.zolvix.app {
    handle /api/* { reverse_proxy localhost:8000 }
    handle /* {
        reverse_proxy localhost:3000 {
            transport http { read_timeout 0 write_timeout 0 }
        }
    }
    encode gzip
}

panel.zolvix.app {
    reverse_proxy 127.0.0.1:3999
    encode gzip
}

ahmetberatkoc.com, www.ahmetberatkoc.com {
    reverse_proxy localhost:3002
    encode gzip
}

mapper.ahmetberatkoc.com {
    reverse_proxy localhost:3001
}
`;

test('zolvix.app kaldırılınca panel.zolvix.app korunur (token-match)', () => {
  const out = removeDomainBlock(REAL, 'zolvix.app');
  assert.ok(!/^zolvix\.app,/m.test(out), 'zolvix.app gitmeli');
  assert.ok(/panel\.zolvix\.app\s*\{/.test(out), 'panel.zolvix.app korunmalı');
});

test('ahmetberatkoc.com kaldırılınca mapper korunur', () => {
  const out = removeDomainBlock(REAL, 'ahmetberatkoc.com');
  assert.ok(!/^ahmetberatkoc\.com,/m.test(out));
  assert.ok(/mapper\.ahmetberatkoc\.com\s*\{/.test(out));
});

test('advanced route dedup: tek handle /*', () => {
  const block = buildDomainBlock({
    domain: 'x.com', type: 'advanced',
    routes: [
      { path: '/api/*', port: 8000, type: 'http' },
      { path: '/*', port: 3000, type: 'websocket' },
      { path: '/*', port: 3000, type: 'http' },
    ],
  } as any);
  assert.strictEqual((block.match(/handle \/\* \{/g) || []).length, 1);
});

test('parseCaddyfile nested brace doğru parse eder', () => {
  const tmp = path.join(os.tmpdir(), 'caddytest-' + process.pid + '.txt');
  fs.writeFileSync(tmp, REAL);
  process.env.CADDYFILE_PATH = tmp;
  const parsed = parseCaddyfile();
  fs.unlinkSync(tmp);
  const names = parsed.map((d) => d.domain);
  assert.strictEqual(parsed.length, 4);
  assert.ok(names.includes('mapper.ahmetberatkoc.com'));
});
