import { execFile } from 'child_process';
import { addLog } from './db';

function dockerExec(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('docker', args, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve(stdout);
    });
  });
}

// Konteyner id/ad güvenli karakter seti (defense-in-depth; shell zaten yok).
export function assertSafeContainerRef(ref: string): void {
  if (typeof ref !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(ref)) {
    throw new Error('Geçersiz konteyner referansı');
  }
}

export function dockerAvailable(): Promise<boolean> {
  return new Promise((resolve) => execFile('which', ['docker'], (err) => resolve(!err)));
}

export interface DockerContainer {
  id: string; name: string; image: string; state: string; status: string;
}

// `docker ps -a --format '{{json .}}'` her satırda bir JSON nesnesi verir.
export function parsePsLines(stdout: string): DockerContainer[] {
  return stdout.trim().split('\n').filter(Boolean).flatMap((line) => {
    try {
      const o = JSON.parse(line);
      if (!o.ID || !o.Names) return [];
      return [{
        id: String(o.ID),
        name: String(o.Names),
        image: String(o.Image ?? ''),
        state: String(o.State ?? ''),
        status: String(o.Status ?? ''),
      }];
    } catch {
      return [];
    }
  });
}

export async function listContainers(): Promise<DockerContainer[]> {
  if (!(await dockerAvailable())) return [];
  try {
    return parsePsLines(await dockerExec(['ps', '-a', '--format', '{{json .}}']));
  } catch {
    return [];
  }
}

// İşlemden önce ref'in GERÇEK bir konteynerle eşleştiğini doğrula (defense-in-depth).
async function resolveContainer(ref: string): Promise<DockerContainer> {
  assertSafeContainerRef(ref);
  const all = await listContainers();
  const found = all.find((c) => c.id === ref || c.id.startsWith(ref) || c.name === ref);
  if (!found) throw new Error('Konteyner bulunamadı');
  return found;
}

export async function startContainer(ref: string): Promise<void> {
  const c = await resolveContainer(ref);
  await dockerExec(['start', c.id]);
  addLog(c.name, 'info', 'Docker konteyner başlatıldı');
}
export async function stopContainer(ref: string): Promise<void> {
  const c = await resolveContainer(ref);
  await dockerExec(['stop', c.id]);
  addLog(c.name, 'info', 'Docker konteyner durduruldu');
}
export async function restartContainer(ref: string): Promise<void> {
  const c = await resolveContainer(ref);
  await dockerExec(['restart', c.id]);
  addLog(c.name, 'info', 'Docker konteyner yeniden başlatıldı');
}
export async function getContainerLogs(ref: string, tail = 200): Promise<string> {
  const c = await resolveContainer(ref);
  const n = Math.max(1, Math.min(2000, Math.floor(tail)));
  return dockerExec(['logs', '--tail', String(n), c.id]);
}
