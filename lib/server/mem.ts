import si from 'systeminformation';
import { readFileSync } from 'fs';

// Linux sayfa boyutu (x86_64). Balloon sayfaları bu boyuttadır.
const PAGE_SIZE = 4096;

export interface MemoryInfo {
  total: number; // fiziksel toplam RAM
  used: number; // ham used (free'nin "used"i — balloon + cache hariç değil)
  active: number; // systeminformation active (≈ total - available)
  free: number;
  available: number; // yeni uygulamalar için kullanılabilir (cache geri alınabilir)
  percent: number; // used / total
  activePercent: number; // active / total
  balloon: number; // VMware balloon sürücüsünün hipervizöre geri verdiği bellek
  effectiveTotal: number; // total - balloon: guest'in gerçekten kullanabileceği toplam
  realUsed: number; // (total - available) - balloon: gerçek uygulama/çekirdek kullanımı
  realPercent: number; // realUsed / effectiveTotal
}

// VMware balloon sürücüsünün şu anki şişme miktarını /proc/vmstat'tan okur.
// balloon_inflate ve balloon_deflate KÜMÜLATİF sayaçlardır; farkları o anki
// şişme (sayfa cinsinden) — /sys/kernel/debug/vmmemctl "current" ile birebir aynı,
// ama /proc/vmstat root/debugfs gerektirmez (world-readable).
// Balloon yoksa veya Linux değilse 0 döner (zararsız).
export function readBalloonBytes(): number {
  try {
    const vmstat = readFileSync('/proc/vmstat', 'utf8');
    const inflate = /^balloon_inflate (\d+)/m.exec(vmstat);
    const deflate = /^balloon_deflate (\d+)/m.exec(vmstat);
    if (!inflate || !deflate) return 0;
    const pages = Number(inflate[1]) - Number(deflate[1]);
    if (!Number.isFinite(pages) || pages <= 0) return 0;
    return pages * PAGE_SIZE;
  } catch {
    return 0;
  }
}

// si.mem() çıktısı + balloon byte'ından balloon-farkında bellek bilgisini hesaplar.
// Saf fonksiyon — test edilebilir.
export function computeMemoryInfo(
  mem: { total: number; used: number; active: number; free: number; available?: number; buffcache?: number },
  balloon: number,
): MemoryInfo {
  const total = mem.total;
  const available = mem.available ?? mem.free + (mem.buffcache ?? 0);
  const safeBalloon = balloon > 0 && balloon < total ? balloon : 0;
  const effectiveTotal = Math.max(0, total - safeBalloon);
  const realUsed = Math.max(0, total - available - safeBalloon);
  const realPercent = effectiveTotal > 0 ? Math.round((realUsed / effectiveTotal) * 100) : 0;
  return {
    total,
    used: mem.used,
    active: mem.active,
    free: mem.free,
    available,
    percent: total > 0 ? Math.round((mem.used / total) * 100) : 0,
    activePercent: total > 0 ? Math.round((mem.active / total) * 100) : 0,
    balloon: safeBalloon,
    effectiveTotal,
    realUsed,
    realPercent,
  };
}

export async function getMemoryInfo(): Promise<MemoryInfo> {
  const mem = await si.mem();
  return computeMemoryInfo(mem, readBalloonBytes());
}
