export interface UfwRule { num: number; to: string; action: string; from: string; }
export interface UfwStatus { active: boolean; rules: UfwRule[]; }
export interface RuleInput { action: 'allow' | 'deny'; port: number; proto: 'tcp' | 'udp' | 'any'; from?: string; }

const PROTECTED = new Set([22, 80, 443]);
export function isProtectedPort(port: number): boolean { return PROTECTED.has(port); }

/** `ufw status numbered` çıktısını ayrıştırır. */
export function parseUfwStatus(output: string): UfwStatus {
  const active = /Status:\s*active/i.test(output);
  const rules: UfwRule[] = [];
  for (const line of output.split('\n')) {
    // örn: "[ 1] 22/tcp                     ALLOW IN    Anywhere"
    const m = line.match(/^\[\s*(\d+)\]\s+(.+?)\s{2,}(ALLOW|DENY|REJECT|LIMIT)\s+(?:IN|OUT)?\s*(.*)$/i);
    if (m) rules.push({ num: parseInt(m[1], 10), to: m[2].trim(), action: m[3].toUpperCase(), from: (m[4] || '').trim() || 'Anywhere' });
  }
  return { active, rules };
}

const IPV4 = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;
const IPV6 = /^[0-9a-fA-F:]+(\/\d{1,3})?$/;

/** Kural girişini doğrular; geçerliyse null, değilse hata mesajı. */
export function validateRule(r: RuleInput): string | null {
  if (r.action !== 'allow' && r.action !== 'deny') return 'Geçersiz eylem';
  if (!Number.isInteger(r.port) || r.port < 1 || r.port > 65535) return 'Port 1-65535 olmalı';
  if (!['tcp', 'udp', 'any'].includes(r.proto)) return 'Geçersiz protokol';
  if (r.from && r.from !== 'any' && !IPV4.test(r.from) && !IPV6.test(r.from)) return 'Geçersiz IP';
  return null;
}

/** Doğrulanmış kuraldan ufw argüman dizisi (shell yok). */
export function buildUfwAddArgs(r: RuleInput): string[] {
  const portSpec = r.proto === 'any' ? String(r.port) : `${r.port}/${r.proto}`;
  if (r.from && r.from !== 'any') {
    // ufw allow from <ip> to any port <port> proto <proto>
    const args = [r.action, 'from', r.from, 'to', 'any', 'port', String(r.port)];
    if (r.proto !== 'any') args.push('proto', r.proto);
    return args;
  }
  return [r.action, portSpec];
}
