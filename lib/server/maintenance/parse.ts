export interface UpgradablePkg { name: string; current: string; candidate: string; }
export interface DiskFs { filesystem: string; size: number; used: number; avail: number; usePercent: number; mount: string; }
export interface DockerDfRow { type: string; total: string; active: string; size: string; reclaimable: string; }

/** `apt list --upgradable` çıktısını ayrıştırır.
 *  Satır örn: "nginx/focal-updates 1.18.0-0ubuntu1.4 amd64 [upgradable from: 1.18.0-0ubuntu1.2]" */
export function parseAptUpgradable(out: string): UpgradablePkg[] {
  const pkgs: UpgradablePkg[] = [];
  for (const line of out.split('\n')) {
    const m = line.match(/^([^/\s]+)\/\S+\s+(\S+)\s+\S+\s+\[upgradable from:\s*([^\]]+)\]/);
    if (m) pkgs.push({ name: m[1], candidate: m[2], current: m[3].trim() });
  }
  return pkgs;
}

/** `df -B1` çıktısını ayrıştırır (1. satır başlık). */
export function parseDf(out: string): DiskFs[] {
  const rows: DiskFs[] = [];
  const lines = out.trim().split('\n').slice(1);
  for (const line of lines) {
    const c = line.split(/\s+/);
    if (c.length < 6) continue;
    const size = parseInt(c[1], 10), used = parseInt(c[2], 10), avail = parseInt(c[3], 10);
    if (!Number.isFinite(size)) continue;
    rows.push({ filesystem: c[0], size, used, avail, usePercent: parseInt(c[4], 10) || 0, mount: c.slice(5).join(' ') });
  }
  return rows;
}

/** `docker system df` (tablo) çıktısını ayrıştırır. */
export function parseDockerDf(out: string): DockerDfRow[] {
  const rows: DockerDfRow[] = [];
  const lines = out.trim().split('\n');
  for (const line of lines.slice(1)) {
    // TYPE may contain a space ("Build Cache") → son 4 kolon sabit; type = kalan baş.
    const m = line.match(/^(.*?)\s{2,}(\d+)\s+(\d+)\s+(\S+)\s+(.+)$/);
    if (m) rows.push({ type: m[1].trim(), total: m[2], active: m[3], size: m[4], reclaimable: m[5].trim() });
  }
  return rows;
}
