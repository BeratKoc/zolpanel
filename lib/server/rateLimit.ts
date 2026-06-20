const hits = new Map<string, { count: number; reset: number }>();
export function rateLimit(key: string, max = 5, windowMs = 15 * 60 * 1000): boolean {
  const now = Date.now();
  const rec = hits.get(key);
  if (!rec || now > rec.reset) { hits.set(key, { count: 1, reset: now + windowMs }); return true; }
  rec.count += 1;
  return rec.count <= max;
}
export function resetLimit(key: string) { hits.delete(key); }
