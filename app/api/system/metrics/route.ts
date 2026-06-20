import si from 'systeminformation';
import { requireAuth, unauthorized } from '@/lib/auth';
import { isCaddyRunning } from '@/lib/server/caddy';

export const runtime = 'nodejs';

// Sistem metrikleri
export async function GET(req: Request) {
  if (!(await requireAuth(req))) return unauthorized();
  try {
    const [cpu, mem, disk, osInfo] = await Promise.all([
      si.currentLoad(),
      si.mem(),
      si.fsSize(),
      si.osInfo(),
    ]);

    const mainDisk = disk.find((d) => d.mount === '/') || disk[0];
    const caddyRunning = await isCaddyRunning();

    return Response.json({
      cpu: {
        load: Math.round(cpu.currentLoad),
        cores: cpu.cpus?.length || 1,
      },
      memory: {
        total: mem.total,
        used: mem.used,
        active: mem.active,
        free: mem.free,
        percent: Math.round((mem.used / mem.total) * 100),
        activePercent: Math.round((mem.active / mem.total) * 100),
      },
      disk: mainDisk
        ? {
            total: mainDisk.size,
            used: mainDisk.used,
            free: mainDisk.available,
            percent: Math.round(mainDisk.use),
          }
        : null,
      os: {
        platform: osInfo.platform,
        distro: osInfo.distro,
        release: osInfo.release,
        hostname: osInfo.hostname,
      },
      caddy: {
        running: caddyRunning,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    return Response.json({ error: 'Metrikler alınamadı', detail: e.message }, { status: 500 });
  }
}
