import { execFile } from 'node:child_process';
import { parseAptUpgradable, parseDf, parseDockerDf } from './parse';

function run(cmd: string, args: string[], timeout = 60000, env?: Record<string, string>): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout, maxBuffer: 8 * 1024 * 1024, env: { ...process.env, ...(env || {}) } },
      (e, out, se) => e ? reject(new Error(se || e.message)) : resolve(out));
  });
}

const APT_ENV = { DEBIAN_FRONTEND: 'noninteractive' };

export async function listUpgradable() {
  try { await run('apt-get', ['update'], 120000, APT_ENV); } catch { /* update hatası olsa da listele */ }
  return parseAptUpgradable(await run('apt', ['list', '--upgradable'], 60000, APT_ENV));
}

export function aptUpgrade(): Promise<string> { return run('apt-get', ['-y', 'upgrade'], 600000, APT_ENV); }

export async function diskUsage() {
  const filesystems = parseDf(await run('df', ['-B1', '-x', 'tmpfs', '-x', 'devtmpfs']));
  let docker: ReturnType<typeof parseDockerDf> = [];
  try { docker = parseDockerDf(await run('docker', ['system', 'df'])); } catch { /* docker yoksa boş */ }
  return { filesystems, docker };
}

export function dockerPrune(target: 'images' | 'system' | 'builder'): Promise<string> {
  const args = target === 'images' ? ['image', 'prune', '-af']
    : target === 'builder' ? ['builder', 'prune', '-af']
    : ['system', 'prune', '-af'];
  return run('docker', args, 120000);
}
