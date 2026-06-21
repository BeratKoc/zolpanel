import { exec } from 'child_process';
import {
  addLog,
  insertSnapshot,
  pruneSnapshots,
  getSnapshotsForName,
  getSnapshotsSince,
} from './db';

const SNAPSHOT_INTERVAL = 30 * 1000; // 30 saniye
const RETENTION_HOURS = 24;           // 24 saatlik geçmiş tut
const ANOMALY_MULTIPLIER = 2.0;       // baseline'ın 2x'i → anomali
const ANOMALY_WINDOW_MINUTES = 30;    // 30 dk içinde sürekli artış → leak şüphesi
const ANOMALY_GROWTH_MB = 200;        // 30 dk'da 200 MB+ artış → uyarı
// Pencerenin SON YARISINDA da bu kadar artış olmalı. Tek seferlik sıçrayıp
// plato yapan (ör. warmup) servisi leak sanmamak için: gerçek leak hâlâ artar.
const ANOMALY_RECENT_GROWTH_MB = 100;
// Aynı servis için tekrar uyarı arası minimum süre (log spam'ini engeller).
const ANOMALY_COOLDOWN_MS = 60 * 60 * 1000; // 1 saat

declare global {
  // eslint-disable-next-line no-var
  var __zolpanelTracker: boolean | undefined;
}

let trackerInterval: ReturnType<typeof setInterval> | null = null;

interface ServiceMem {
  name: string;
  type: 'pm2' | 'docker';
  pid?: number;
  memoryMB: number;
  memPercent?: number;
  status: string;
  restarts?: number;
}

// PM2 process memory snapshot al
function getPm2Memory(): Promise<ServiceMem[]> {
  return new Promise((resolve) => {
    exec('pm2 jlist', (err, stdout) => {
      if (err) return resolve([]);
      try {
        const list = JSON.parse(stdout);
        resolve(list.map((p: any) => ({
          name: p.name,
          type: 'pm2',
          pid: p.pid,
          memoryMB: Math.round((p.monit?.memory || 0) / (1024 * 1024)),
          status: p.pm2_env?.status || 'unknown',
          restarts: p.pm2_env?.restart_time || 0,
        })));
      } catch {
        resolve([]);
      }
    });
  });
}

// Docker container memory snapshot al
function getDockerMemory(): Promise<ServiceMem[]> {
  return new Promise((resolve) => {
    exec('docker stats --no-stream --format "{{.Name}}|{{.MemUsage}}|{{.MemPerc}}"', (err, stdout) => {
      if (err) return resolve([]);
      try {
        const lines = stdout.trim().split('\n').filter(Boolean);
        const containers = lines.map((line) => {
          const [name, memUsage, memPerc] = line.split('|');
          // "256MiB / 31.3GiB" formatını parse et
          const match = memUsage?.match(/([\d.]+)([KMG]iB)/);
          let memoryMB = 0;
          if (match) {
            const val = parseFloat(match[1]);
            const unit = match[2];
            if (unit === 'KiB') memoryMB = val / 1024;
            else if (unit === 'MiB') memoryMB = val;
            else if (unit === 'GiB') memoryMB = val * 1024;
          }
          return {
            name: name?.trim(),
            type: 'docker' as const,
            memoryMB: Math.round(memoryMB),
            memPercent: parseFloat(memPerc) || 0,
            status: 'running',
          };
        });
        resolve(containers.filter((c) => c.name) as ServiceMem[]);
      } catch {
        resolve([]);
      }
    });
  });
}

// Snapshot kaydet
async function takeSnapshot(): Promise<void> {
  try {
    const [pm2, docker] = await Promise.all([getPm2Memory(), getDockerMemory()]);
    const services = [...pm2, ...docker];
    const timestamp = new Date().toISOString();

    for (const svc of services) {
      insertSnapshot({
        name: svc.name,
        type: svc.type,
        memoryMB: svc.memoryMB,
        memPercent: svc.memPercent || null,
        status: svc.status,
        restarts: svc.restarts || null,
        timestamp,
      });
    }

    // Eski kayıtları temizle (24 saatten eski)
    const cutoff = new Date(Date.now() - RETENTION_HOURS * 60 * 60 * 1000).toISOString();
    pruneSnapshots(cutoff);

    // Anomali kontrolü
    checkAnomalies(services);
  } catch (e) {
    console.error('[memoryTracker] snapshot hata:', e);
  }
}

// Bir servis için son uyarı durumu (cooldown + dedup).
interface LeakState { at: number; growth: number; }
const leakState = new Map<string, LeakState>();

// Bir MB serisinin "leak şüphesi" taşıyıp taşımadığı (saf, paylaşılan predicate).
// Hem log dedektörü (checkAnomalies) hem dashboard rozeti (getMemoryStats) bunu
// kullanır → tutarlı. Şart: toplam artış eşik üstü + SON YARI da hâlâ artıyor
// (plato/warmup elenir) + büyük düşüş yok.
export function isLeakSuspect(mems: number[]): boolean {
  if (mems.length < 3) return false;
  const first = mems[0];
  const last = mems[mems.length - 1];
  const growth = last - first;
  let alwaysGrowing = true;
  for (let i = 1; i < mems.length; i++) {
    if (mems[i] < mems[i - 1] - 5) { alwaysGrowing = false; break; }
  }
  const recentGrowth = last - mems[Math.floor(mems.length / 2)];
  return growth > ANOMALY_GROWTH_MB && recentGrowth > ANOMALY_RECENT_GROWTH_MB && alwaysGrowing;
}

// Saf leak değerlendirmesi (test edilebilir). mems = pencere içi kronolojik MB serisi.
// Uyarı BASILMASI için ayrıca cooldown geçmeli ya da bir önceki uyarıdan beri belirgin
// (bir eşik kadar) daha büyümüş olmalı.
export function evaluateLeak(
  mems: number[],
  prev: LeakState | undefined,
  now: number,
): { isLeak: boolean; warn: boolean; growth: number; first: number; last: number } {
  if (mems.length < 3) return { isLeak: false, warn: false, growth: 0, first: 0, last: 0 };
  const first = mems[0];
  const last = mems[mems.length - 1];
  const growth = last - first;

  const isLeak = isLeakSuspect(mems);

  if (!isLeak) return { isLeak: false, warn: false, growth, first, last };

  const warn =
    !prev ||
    now - prev.at > ANOMALY_COOLDOWN_MS ||
    growth - prev.growth > ANOMALY_GROWTH_MB;

  return { isLeak: true, warn, growth, first, last };
}

// Anomali tespiti
function checkAnomalies(currentServices: ServiceMem[]): void {
  const windowStart = new Date(Date.now() - ANOMALY_WINDOW_MINUTES * 60 * 1000).toISOString();
  const now = Date.now();

  for (const svc of currentServices) {
    // Son X dakikadaki snapshot'ları al
    const snapshots = getSnapshotsForName(svc.name, windowStart);
    if (snapshots.length < 3) continue;

    const mems = snapshots.map((s) => s.memoryMB);
    const r = evaluateLeak(mems, leakState.get(svc.name), now);

    if (!r.isLeak) {
      // Toparladı / plato → durumu sıfırla ki ileride gerçek leak yeniden uyarsın.
      leakState.delete(svc.name);
      continue;
    }

    if (r.warn) {
      addLog(svc.name, 'warn',
        `⚠️ Memory leak şüphesi: Son ${ANOMALY_WINDOW_MINUTES} dakikada ${r.growth} MB artış (${r.first} → ${r.last} MB)`
      );
      leakState.set(svc.name, { at: now, growth: r.growth });
    }
  }
}

interface MemorySnapshotPoint {
  t: string;
  m: number;
}

interface GroupedService {
  name: string;
  type: 'pm2' | 'docker';
  snapshots: MemorySnapshotPoint[];
}

interface MemoryStatAnomaly {
  type: string;
  growthMB: number;
  message: string;
}

interface MemoryStat {
  name: string;
  type: 'pm2' | 'docker';
  current: number;
  min: number;
  max: number;
  growth: number;
  trend: string;
  anomaly: MemoryStatAnomaly | null;
  sparkline: number[];
}

// Son N saatin memory datasını getir
function getMemoryStats(hours = 1): MemoryStat[] {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const docs = getSnapshotsSince(since);

  // Servis bazında grupla
  const grouped: Record<string, GroupedService> = {};
  for (const doc of docs) {
    if (!grouped[doc.name]) {
      grouped[doc.name] = {
        name: doc.name,
        type: doc.type,
        snapshots: [],
      };
    }
    grouped[doc.name].snapshots.push({
      t: doc.timestamp,
      m: doc.memoryMB,
    });
  }

  // Her servis için özet hesapla
  return Object.values(grouped).map((svc) => {
    const mems = svc.snapshots.map((s) => s.m);
    const current = mems[mems.length - 1] || 0;
    // Boş dizide Math.min/max → ±Infinity (JSON'da null olur, UI'da "null MB" gösterir).
    const min = mems.length ? Math.min(...mems) : 0;
    const max = mems.length ? Math.max(...mems) : 0;
    const first = mems[0] || 0;
    const growth = current - first;

    // Trend: growing / stable / decreasing
    let trend = 'stable';
    if (growth > 50) trend = 'growing';
    else if (growth < -50) trend = 'decreasing';

    // Anomali skoru — log dedektörüyle AYNI mantık (plato/warmup leak sayılmaz).
    let anomaly: MemoryStatAnomaly | null = null;
    if (isLeakSuspect(mems)) {
      anomaly = {
        type: 'leak_suspect',
        growthMB: growth,
        message: `${hours}h içinde ${growth} MB artış`,
      };
    }

    return {
      name: svc.name,
      type: svc.type,
      current,
      min,
      max,
      growth,
      trend,
      anomaly,
      sparkline: svc.snapshots.slice(-20).map((s) => s.m), // son 20 nokta
    };
  });
}

// Anlık servis listesi (snapshot almadan)
async function getCurrentServices(): Promise<ServiceMem[]> {
  const [pm2, docker] = await Promise.all([getPm2Memory(), getDockerMemory()]);
  return [...pm2, ...docker];
}

// Tracker başlat
function startTracker(): void {
  if (globalThis.__zolpanelTracker) return;
  globalThis.__zolpanelTracker = true;
  if (trackerInterval) return;
  takeSnapshot(); // ilk snapshot hemen
  trackerInterval = setInterval(takeSnapshot, SNAPSHOT_INTERVAL);
  console.log('📊 Memory tracker başlatıldı (30sn interval)');
}

// Tracker durdur
function stopTracker(): void {
  if (trackerInterval) {
    clearInterval(trackerInterval);
    trackerInterval = null;
  }
}

export { startTracker, stopTracker, getMemoryStats, getCurrentServices };
