import tls from 'tls';
import type { PeerCertificate } from 'tls';

export type SslStatus = 'active' | 'pending' | 'error';

// Caddy'nin bu domain için SUNDUĞU sertifikayı 127.0.0.1:443'e SNI ile bağlanıp
// inceler. Böylece DNS'ten bağımsız olarak "Caddy gerçek (public CA) sertifika
// aldı mı" sorusunu yanıtlar:
//   - public CA sertifikası + domain eşleşiyor + süresi dolmamış  → 'active'
//   - sertifika yok ya da Caddy'nin iç (self-signed) sertifikası   → 'pending'
//   - bağlantı/handshake hatası ya da uyumsuz/expired sertifika    → 'error'
export function checkDomainSsl(domain: string, timeoutMs = 5000): Promise<SslStatus> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (s: SslStatus) => {
      if (settled) return;
      settled = true;
      try { socket.destroy(); } catch { /* yoksay */ }
      resolve(s);
    };

    const socket = tls.connect(
      {
        host: '127.0.0.1',
        port: 443,
        servername: domain,
        rejectUnauthorized: false, // sertifikayı reddetmeden inceleyebilmek için
        timeout: timeoutMs,
      },
      () => {
        const cert = socket.getPeerCertificate();
        finish(classifyCert(cert, domain));
      },
    );

    socket.on('error', () => finish('error'));
    socket.on('timeout', () => finish('error'));
  });
}

// tls tipleri bazı alanları string | string[] olarak verir; tek string'e indir.
function str(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v.join(' ') : v ?? '').toLowerCase();
}

function classifyCert(cert: PeerCertificate, domain: string): SslStatus {
  if (!cert || Object.keys(cert).length === 0 || !cert.valid_to) return 'pending';

  const issuer = `${str(cert.issuer?.O)} ${str(cert.issuer?.CN)}`;
  // Caddy yerel (geliştirme) CA'sı → henüz gerçek sertifika alınmamış
  if (issuer.includes('caddy')) return 'pending';

  const target = domain.toLowerCase();
  const san = str(cert.subjectaltname); // "dns:a.com, dns:www.a.com"
  const cn = str(cert.subject?.CN);
  const nameMatches =
    san.split(',').some((e) => e.trim() === `dns:${target}`) || cn === target;

  const notExpired = new Date(cert.valid_to).getTime() > Date.now();

  if (nameMatches && notExpired) return 'active';
  return 'error';
}
