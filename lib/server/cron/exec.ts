import { execFile } from 'node:child_process';

function run(cmd: string, args: string[], input?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(cmd, args, { maxBuffer: 4 * 1024 * 1024 }, (e, out, se) =>
      e ? reject(new Error(se || e.message)) : resolve(out));
    if (input !== undefined) { child.stdin?.write(input); child.stdin?.end(); }
  });
}

export async function readCrontab(): Promise<string> {
  try { return await run('crontab', ['-l']); }
  catch (e) { if (/no crontab/i.test((e as Error).message)) return ''; throw e; }
}

export function writeCrontab(text: string): Promise<string> { return run('crontab', ['-'], text); }

export function runCommand(command: string): Promise<string> {
  return new Promise(resolve => {
    execFile('sh', ['-c', command], { maxBuffer: 4 * 1024 * 1024, timeout: 60000 }, (e, out, se) => {
      const combined = (out || '') + (se || '');
      if (e && (e as NodeJS.ErrnoException).code === 'ETIMEDOUT') {
        resolve(combined + '\n[timed out]');
      } else {
        resolve(combined || '(no output)');
      }
    });
  });
}
