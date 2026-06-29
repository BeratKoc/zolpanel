import { test } from 'node:test';
import assert from 'node:assert';
import { TerminalManager, TerminalLimitError, MAX_SESSIONS, dockerExecArgs, CONTAINER_SHELL_CMD, type PtyLike } from './session';

function fakePty(): PtyLike & { written: string[]; resized: [number, number][]; killed: boolean } {
  return {
    written: [], resized: [], killed: false,
    onData() {}, onExit() {},
    write(d) { this.written.push(d); },
    resize(c, r) { this.resized.push([c, r]); },
    kill() { this.killed = true; },
  };
}

function mgr() {
  let n = 0;
  return new TerminalManager(() => `id${++n}`);
}

test('create + get (sahiplik)', () => {
  const m = mgr();
  const p = fakePty();
  const s = m.create('u1', 'host', () => p, 1000);
  assert.strictEqual(s.id, 'id1');
  assert.strictEqual(m.get('id1', 'u1')?.id, 'id1');
  assert.strictEqual(m.get('id1', 'u2'), null); // başkasının oturumu
  assert.strictEqual(m.get('yok', 'u1'), null);
});

test('max session cap → TerminalLimitError', () => {
  const m = mgr();
  for (let i = 0; i < MAX_SESSIONS; i++) m.create('u1', 'host', fakePty, 0);
  assert.throws(() => m.create('u1', 'host', fakePty, 0), TerminalLimitError);
  assert.strictEqual(m.count(), MAX_SESSIONS);
});

test('write/resize doğru pty\'ye gider; touch lastActivity günceller', () => {
  const m = mgr();
  const p = fakePty();
  const s = m.create('u1', 'host', () => p, 1000);
  s.pty.write('ls\n'); s.pty.resize(120, 40);
  assert.deepStrictEqual(p.written, ['ls\n']);
  assert.deepStrictEqual(p.resized, [[120, 40]]);
  m.touch(s.id, 5000);
  assert.strictEqual(m.get(s.id, 'u1')?.lastActivity, 5000);
});

test('kill pty.kill çağırır + Map\'ten siler', () => {
  const m = mgr();
  const p = fakePty();
  const s = m.create('u1', 'host', () => p, 0);
  m.kill(s.id);
  assert.strictEqual(p.killed, true);
  assert.strictEqual(m.count(), 0);
  assert.strictEqual(m.get(s.id, 'u1'), null);
});

test('dockerExecArgs: bash\'i `command -v` ile guard eder (exec-fail fatal regresyonu)', () => {
  const args = dockerExecArgs('myctr');
  assert.deepStrictEqual(args.slice(0, 5), ['exec', '-it', 'myctr', 'sh', '-c']);
  // KIRIK kalıp olmamalı: `exec bash ... ||` POSIX sh'te ölümcül → bash'siz container'da 127
  assert.ok(!/exec\s+bash[^|]*\|\|/.test(CONTAINER_SHELL_CMD), 'fatal `exec bash || exec sh` kalıbı kullanılmamalı');
  // bash'i çalıştırmadan ÖNCE varlığını kontrol etmeli, ve her iki kabuğa da yol olmalı
  assert.ok(/command -v bash/.test(CONTAINER_SHELL_CMD));
  assert.ok(/exec bash/.test(CONTAINER_SHELL_CMD) && /exec sh/.test(CONTAINER_SHELL_CMD));
});

test('reapIdle yalnız idle olanları öldürür', () => {
  const m = mgr();
  const pOld = fakePty(); const pNew = fakePty();
  m.create('u1', 'host', () => pOld, 0);       // lastActivity=0
  const sNew = m.create('u1', 'host', () => pNew, 1000000);
  const killed = m.reapIdle(1000000, 600000);  // now=1e6, idle>10dk → pOld (0) ölür, pNew kalır
  assert.strictEqual(killed.length, 1);
  assert.strictEqual(pOld.killed, true);
  assert.strictEqual(pNew.killed, false);
  assert.strictEqual(m.count(), 1);
  assert.ok(m.get(sNew.id, 'u1'));
});
