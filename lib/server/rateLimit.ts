const hits = new Map<string, { count: number; reset: number }>();
// Harita büyüdükçe, hiç tekrar ziyaret edilmeyen süresi-dolmuş anahtarların
// sonsuza kadar birikmesini önlemek için ara sıra süpür (sınırsız büyüme).
const SWEEP_THRESHOLD = 500;
function sweepExpired(now: number): void {
  for (const [k, v] of hits) {
    if (now > v.reset) hits.delete(k);
  }
}
export function rateLimit(key: string, max = 5, windowMs = 15 * 60 * 1000): boolean {
  const now = Date.now();
  const rec = hits.get(key);
  if (!rec || now > rec.reset) {
    if (hits.size > SWEEP_THRESHOLD) sweepExpired(now);
    hits.set(key, { count: 1, reset: now + windowMs });
    return true;
  }
  rec.count += 1;
  return rec.count <= max;
}
export function resetLimit(key: string) { hits.delete(key); }
