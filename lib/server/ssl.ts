import tls from 'tls';
import type { PeerCertificate } from 'tls';

export type SslStatus = 'active' | 'pending' | 'error';

export interface SslInfo { status: SslStatus; issuer?: string; validTo?: string; }

// Caddy'nin bu domain için SUNDUĞU sertifikayı 127.0.0.1:443'e SNI ile bağlanıp
// inceler. Böylece DNS'ten bağımsız olarak "Caddy gerçek (public CA) sertifika
// aldı mı" sorusunu yanıtlar:
//   - public CA sertifikası + domain eşleşiyor + süresi dolmamış  → 'active'
//   - sertifika yok ya da Caddy'nin iç (self-signed) sertifikası   → 'pending'
//   - bağlantı/handshake hatası ya da uyumsuz/expired sertifika    → 'error'
export function checkDomainSslInfo(domain: string, timeoutMs = 5000): Promise<SslInfo> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (r: SslInfo) => { if (settled) return; settled = true; try { socket.destroy(); } catch { /**/ } resolve(r); };
    const socket = tls.connect(
      { host: '127.0.0.1', port: 443, servername: domain, rejectUnauthorized: false, timeout: timeoutMs },
      () => finish(classifyCertInfo(socket.getPeerCertificate(), domain)),
    );
    socket.on('error', () => finish({ status: 'error' }));
    socket.on('timeout', () => finish({ status: 'error' }));
  });
}

export function checkDomainSsl(domain: string, timeoutMs = 5000): Promise<SslStatus> {
  return checkDomainSslInfo(domain, timeoutMs).then((r) => r.status);
}

// tls tipleri bazı alanları string | string[] olarak verir; tek string'e indir.
function str(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v.join(' ') : v ?? '').toLowerCase();
}

export function classifyCertInfo(cert: PeerCertificate, domain: string): SslInfo {
  if (!cert || Object.keys(cert).length === 0 || !cert.valid_to) return { status: 'pending' };
  const issuerRaw = (cert.issuer?.O || cert.issuer?.CN || '') as string;
  const issuer = `${str(cert.issuer?.O)} ${str(cert.issuer?.CN)}`;
  if (issuer.includes('caddy')) return { status: 'pending', issuer: issuerRaw, validTo: cert.valid_to };
  const target = domain.toLowerCase();
  const san = str(cert.subjectaltname);
  const cn = str(cert.subject?.CN);
  const nameMatches = san.split(',').some((e) => e.trim() === `dns:${target}`) || cn === target;
  const notExpired = new Date(cert.valid_to).getTime() > Date.now();
  const base = { issuer: issuerRaw || undefined, validTo: cert.valid_to };
  if (nameMatches && notExpired) return { status: 'active', ...base };
  return { status: 'error', ...base };
}
