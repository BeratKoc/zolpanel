import bcrypt from 'bcryptjs';
import type { CaddyExtras, CaddyBasicAuth } from './db';

type IncomingBA = { username: string; password?: string; passwordHash?: string };

// UI'dan gelen caddyExtras'ı saklanacak biçime çevirir: basic-auth düz şifreleri
// bcrypt'ler; şifre verilmemişse prev'deki mevcut hash'i korur.
export async function normalizeCaddyExtras(
  incoming: (CaddyExtras & { basicAuth?: IncomingBA[] }) | undefined,
  prev: CaddyExtras | undefined,
): Promise<CaddyExtras | undefined> {
  if (!incoming) return undefined;
  const out: CaddyExtras = {
    headers: incoming.headers,
    redirects: incoming.redirects,
    ipRules: incoming.ipRules ?? null,
  };
  if (incoming.basicAuth) {
    const list: CaddyBasicAuth[] = [];
    for (const u of incoming.basicAuth) {
      if (u.password) {
        list.push({ username: u.username, passwordHash: await bcrypt.hash(u.password, 14) });
      } else {
        const old = prev?.basicAuth?.find((p) => p.username === u.username);
        if (old) list.push(old);
        // şifre yok + eski hash yok → kullanıcı atlanır (eksik şifre)
      }
    }
    out.basicAuth = list;
  }
  return out;
}
