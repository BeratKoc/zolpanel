import { test } from 'node:test';
import assert from 'node:assert';
import { parseCrontab, serializeCrontab, isValidSchedule } from './crontab';

test('isValidSchedule', () => {
  assert.strictEqual(isValidSchedule('* * * * *'), true);
  assert.strictEqual(isValidSchedule('0 3 * * 1-5'), true);
  assert.strictEqual(isValidSchedule('*/15 * * * *'), true);
  assert.strictEqual(isValidSchedule('@daily'), true);
  assert.strictEqual(isValidSchedule('0 3 * *'), false);    // 4 alan
  assert.strictEqual(isValidSchedule('bad sched ule x y'), false);
  assert.strictEqual(isValidSchedule('@bogus'), false);
});

test('parseCrontab: aktif + pasif + opak', () => {
  const text = [
    'PATH=/usr/bin',
    '# gerçek yorum',
    '0 3 * * * /usr/bin/backup.sh',
    '#ZOLPANEL_DISABLED: */5 * * * * /tmp/x.sh',
    '@daily /usr/bin/cleanup',
  ].join('\n');
  const jobs = parseCrontab(text);
  assert.strictEqual(jobs.length, 3);
  assert.deepStrictEqual({ s: jobs[0].schedule, c: jobs[0].command, e: jobs[0].enabled }, { s: '0 3 * * *', c: '/usr/bin/backup.sh', e: true });
  assert.strictEqual(jobs[1].enabled, false);
  assert.strictEqual(jobs[1].command, '/tmp/x.sh');
  assert.strictEqual(jobs[2].schedule, '@daily');
});

test('serializeCrontab: opak korunur, job güncellenir, round-trip', () => {
  const original = ['PATH=/usr/bin', '# yorum', '0 3 * * * /old.sh'].join('\n');
  const jobs = parseCrontab(original);
  jobs[0].enabled = false; // pasifleştir
  const out = serializeCrontab(jobs, original);
  assert.match(out, /PATH=\/usr\/bin/);
  assert.match(out, /# yorum/);
  assert.match(out, /#ZOLPANEL_DISABLED: 0 3 \* \* \* \/old\.sh/);
  // yeniden parse → 1 pasif job, opak korunur
  const re = parseCrontab(out);
  assert.strictEqual(re.length, 1);
  assert.strictEqual(re[0].enabled, false);
});
