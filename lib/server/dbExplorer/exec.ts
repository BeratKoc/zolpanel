import { execFile } from 'child_process';

// ---------------------------------------------------------------------------
// Eşzamanlılık guard'ı (runaway-client DoS koruması).
// Bir client döngüye girip sel gönderirse (canlıda görülen takılı-sekme olayı),
// her istek bir `docker exec` doğuruyordu → sistem yükü patlıyor, panel boğuluyor.
// Eşzamanlı exec sayısını sınırla; aşımda HIZLI reddet (docker spawn ETME).
// ---------------------------------------------------------------------------
export const MAX_CONCURRENT_EXEC = 8;
let inFlight = 0;

export class DbExecBusyError extends Error {
  constructor() {
    super('Sunucu meşgul — çok fazla eşzamanlı veritabanı sorgusu, lütfen tekrar deneyin');
    this.name = 'DbExecBusyError';
  }
}

/** O an kullanımda olan exec slot sayısı (test/gözlem). */
export function execSlotsInUse(): number {
  return inFlight;
}

/** Slot ayırmaya çalışır; doluysa false (test edilebilir saf sayaç mantığı). */
export function tryAcquireExecSlot(): boolean {
  if (inFlight >= MAX_CONCURRENT_EXEC) return false;
  inFlight++;
  return true;
}

/** Slotu serbest bırakır. */
export function releaseExecSlot(): void {
  if (inFlight > 0) inFlight--;
}

export function dbExec(container: string, argv: string[], env?: Record<string, string>): Promise<string> {
  if (!tryAcquireExecSlot()) {
    return Promise.reject(new DbExecBusyError());
  }
  return new Promise((resolve, reject) => {
    try {
      execFile(
        'docker',
        ['exec', ...(env ? Object.entries(env).flatMap(([k, v]) => ['-e', `${k}=${v}`]) : []), container, ...argv],
        { maxBuffer: 64 * 1024 * 1024 },
        (e, out, se) => {
          releaseExecSlot();
          return e ? reject(new Error(se || e.message)) : resolve(out);
        }
      );
    } catch (err) {
      releaseExecSlot();
      reject(err as Error);
    }
  });
}
