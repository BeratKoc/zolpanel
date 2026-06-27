import { test } from 'node:test';
import assert from 'node:assert';
import { parseAptUpgradable, parseDf, parseDockerDf } from './parse';

test('parseAptUpgradable', () => {
  const out = [
    'Listing...',
    'nginx/focal-updates 1.18.0-0ubuntu1.4 amd64 [upgradable from: 1.18.0-0ubuntu1.2]',
    'curl/focal-security 7.68.0-1ubuntu2.7 amd64 [upgradable from: 7.68.0-1ubuntu2.6]',
  ].join('\n');
  const p = parseAptUpgradable(out);
  assert.strictEqual(p.length, 2);
  assert.deepStrictEqual(p[0], { name: 'nginx', candidate: '1.18.0-0ubuntu1.4', current: '1.18.0-0ubuntu1.2' });
});

test('parseDf', () => {
  const out = [
    'Filesystem     1B-blocks       Used  Available Use% Mounted on',
    '/dev/sda1     52000000000 20000000000 30000000000  40% /',
  ].join('\n');
  const d = parseDf(out);
  assert.strictEqual(d.length, 1);
  assert.deepStrictEqual({ fs: d[0].filesystem, used: d[0].used, pct: d[0].usePercent, mount: d[0].mount }, { fs: '/dev/sda1', used: 20000000000, pct: 40, mount: '/' });
});

test('parseDockerDf', () => {
  const out = [
    'TYPE            TOTAL     ACTIVE    SIZE      RECLAIMABLE',
    'Images          10        5         2GB       1GB (50%)',
    'Build Cache     20        0         500MB     500MB (100%)',
  ].join('\n');
  const r = parseDockerDf(out);
  assert.strictEqual(r.length, 2);
  assert.strictEqual(r[0].type, 'Images');
  assert.strictEqual(r[0].reclaimable, '1GB (50%)');
  assert.strictEqual(r[1].type, 'Build Cache');
});
