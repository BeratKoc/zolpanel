export interface PtyLike {
  onData(cb: (data: string) => void): void;
  onExit(cb: () => void): void;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(): void;
}

export type SpawnFn = () => PtyLike;

// Container kabuğu: bash varsa onu, yoksa sh başlat.
// ÖNEMLİ — `exec bash 2>/dev/null || exec sh` KULLANMA: POSIX sh'te (dash/busybox)
// exec başarısızlığı ölümcüldür; bash yoksa kabuk ANINDA 127 ile ölür ve `|| exec sh`
// fallback'ine HİÇ ulaşılmaz (`2>/dev/null` yalnız mesajı gizler). Sonuç: bash'siz
// container'larda "terminal bağlanmıyor". Önce `command -v bash` ile kontrol et.
export const CONTAINER_SHELL_CMD =
  'if command -v bash >/dev/null 2>&1; then exec bash; else exec sh; fi';

// `docker exec` argümanları (saf, test edilebilir). target çağrı öncesi doğrulanmalı
// (assertSafeContainerRef) — buradaki dizi shell-enjeksiyonuna açık değildir (argv).
export function dockerExecArgs(target: string): string[] {
  return ['exec', '-it', target, 'sh', '-c', CONTAINER_SHELL_CMD];
}

export interface TermSession {
  id: string;
  userId: string;
  target: string;
  pty: PtyLike;
  lastActivity: number;
}

export const MAX_SESSIONS = 5;
export const IDLE_MS = 10 * 60 * 1000;

export class TerminalLimitError extends Error {
  constructor() { super('Çok fazla aktif terminal oturumu (maks ' + MAX_SESSIONS + ')'); this.name = 'TerminalLimitError'; }
}

export class TerminalManager {
  private sessions = new Map<string, TermSession>();
  constructor(private genId: () => string) {}

  count(): number { return this.sessions.size; }

  create(userId: string, target: string, spawn: SpawnFn, now: number): TermSession {
    if (this.sessions.size >= MAX_SESSIONS) throw new TerminalLimitError();
    const pty = spawn();
    const id = this.genId();
    const s: TermSession = { id, userId, target, pty, lastActivity: now };
    this.sessions.set(id, s);
    return s;
  }

  get(id: string, userId: string): TermSession | null {
    const s = this.sessions.get(id);
    if (!s || s.userId !== userId) return null;
    return s;
  }

  touch(id: string, now: number): void {
    const s = this.sessions.get(id);
    if (s) s.lastActivity = now;
  }

  kill(id: string): void {
    const s = this.sessions.get(id);
    if (!s) return;
    try { s.pty.kill(); } catch { /* zaten ölmüş olabilir */ }
    this.sessions.delete(id);
  }

  reapIdle(now: number, idleMs: number = IDLE_MS): string[] {
    const killed: string[] = [];
    for (const [id, s] of this.sessions) {
      if (now - s.lastActivity > idleMs) { this.kill(id); killed.push(id); }
    }
    return killed;
  }
}
