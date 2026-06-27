export interface DnsRecordInput { type: string; name: string; content: string; ttl: number; priority?: number; }
const TYPES = new Set(['A', 'AAAA', 'CNAME', 'TXT', 'MX']);
export function validateDnsRecord(r: DnsRecordInput): string | null {
  if (!TYPES.has(r.type)) return 'Geçersiz kayıt tipi';
  if (typeof r.name !== 'string' || !r.name.trim()) return 'Ad boş olamaz';
  if (typeof r.content !== 'string' || !r.content.trim()) return 'İçerik boş olamaz';
  if (!Number.isInteger(r.ttl) || (r.ttl !== 1 && (r.ttl < 60 || r.ttl > 86400))) return 'TTL 1 (auto) veya 60-86400 olmalı';
  if (r.type === 'MX' && (!Number.isInteger(r.priority) || (r.priority as number) < 0)) return 'MX kaydı için öncelik gerekli';
  return null;
}
