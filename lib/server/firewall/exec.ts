import { execFile } from 'node:child_process';
import { parseUfwStatus, buildUfwAddArgs, type RuleInput, type UfwStatus } from './ufw';

function run(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('ufw', args, { timeout: 15000, maxBuffer: 1024 * 1024 }, (e, out, se) =>
      e ? reject(new Error(se || e.message)) : resolve(out));
  });
}

export async function ufwStatus(): Promise<UfwStatus> { return parseUfwStatus(await run(['status', 'numbered'])); }
export async function ufwAdd(r: RuleInput): Promise<void> { await run(buildUfwAddArgs(r)); }
export async function ufwDeleteByNum(n: number): Promise<void> { await run(['--force', 'delete', String(n)]); }
export async function ufwDisable(): Promise<void> { await run(['disable']); }

/** SSH-safe enable: 22/80/443 allow garantile, sonra enable. */
export async function ufwEnable(): Promise<void> {
  for (const spec of ['22/tcp', '80/tcp', '443/tcp']) { try { await run(['allow', spec]); } catch { /* zaten var olabilir */ } }
  await run(['--force', 'enable']);
}
