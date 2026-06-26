import * as nodePty from 'node-pty';
import { randomUUID } from 'node:crypto';
import { listContainers, assertSafeContainerRef } from '../docker';
import { TerminalManager, type PtyLike, type SpawnFn } from './session';

// HMR/çoklu-import'ta tek instance (better-sqlite3 singleton kalıbı gibi).
const g = globalThis as unknown as { __zolTerminal?: TerminalManager; __zolTermReaper?: ReturnType<typeof setInterval> };
export const terminalManager: TerminalManager = g.__zolTerminal ?? (g.__zolTerminal = new TerminalManager(() => randomUUID()));
if (!g.__zolTermReaper) {
  g.__zolTermReaper = setInterval(() => terminalManager.reapIdle(Date.now()), 60_000);
}

/** target='host' → bash; aksi halde container adı (doğrulanır) → docker exec. Async doğrulama sonrası sync SpawnFn döner. */
export async function makeSpawner(target: string): Promise<SpawnFn> {
  if (target !== 'host') {
    assertSafeContainerRef(target);
    const all = await listContainers();
    if (!all.some(c => c.name === target && c.state === 'running')) throw new Error('Container çalışmıyor veya bulunamadı: ' + target);
  }
  return (): PtyLike => {
    const safeEnv: Record<string, string> = {
      PATH: process.env.PATH || '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
      HOME: process.env.HOME || '/root',
      TERM: 'xterm-color',
      LANG: process.env.LANG || 'en_US.UTF-8',
      USER: process.env.USER || 'root',
    };
    const opts = { name: 'xterm-color', cols: 80, rows: 24, cwd: process.env.HOME || '/root', env: safeEnv };
    const p = target === 'host'
      ? nodePty.spawn('bash', [], opts)
      : nodePty.spawn('docker', ['exec', '-it', target, 'sh', '-c', 'exec bash 2>/dev/null || exec sh'], opts);
    return {
      onData: (cb) => { p.onData(cb); },
      onExit: (cb) => { p.onExit(() => cb()); },
      write: (d) => p.write(d),
      resize: (c, r) => { try { p.resize(c, r); } catch { /* boyut hatasını yut */ } },
      kill: () => p.kill(),
    };
  };
}
