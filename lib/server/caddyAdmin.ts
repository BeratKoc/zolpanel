// Caddy admin API (localhost:2019) — yalnızca OKUMA/doğrulama. Config'i DEĞİŞTİRMEZ.
const ADMIN = process.env.CADDY_ADMIN || 'http://127.0.0.1:2019';

export async function caddyAdminAvailable(): Promise<boolean> {
  try {
    const r = await fetch(ADMIN + '/config/', { signal: AbortSignal.timeout(3000) });
    return r.ok;
  } catch {
    return false;
  }
}

export async function caddyHasDomain(domain: string): Promise<boolean> {
  try {
    const r = await fetch(ADMIN + '/config/', { signal: AbortSignal.timeout(3000) });
    if (!r.ok) return false;
    const cfg = await r.json();
    return JSON.stringify(cfg).includes(domain);
  } catch {
    return false;
  }
}
