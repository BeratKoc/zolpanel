import { test } from 'node:test';
import assert from 'node:assert';
import { isSafeRepoUrl } from './gitDeploy';
test('isSafeRepoUrl: https git URL kabul', () => {
  assert.ok(isSafeRepoUrl('https://github.com/user/repo.git'));
  assert.ok(isSafeRepoUrl('https://gitlab.com/a/b'));
});
test('isSafeRepoUrl: http/ssh/flag/boşluk reddedilir', () => {
  for (const bad of ['http://x/y', 'git@github.com:a/b.git', '--upload-pack=x', 'https://x y', 'file:///etc', '-x', '']) {
    assert.strictEqual(isSafeRepoUrl(bad), false);
  }
});
