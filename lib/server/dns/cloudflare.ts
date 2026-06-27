import { getSetting } from '../db';
import { decryptSecret } from '../secrets';

const CF = 'https://api.cloudflare.com/client/v4';

function token(): string {
  const blob = getSetting('cf_api_token');
  if (!blob) throw new Error('Cloudflare API token ayarlı değil');
  return decryptSecret(blob);
}

async function cf(path: string, init?: RequestInit): Promise<any> {
  const res = await fetch(`${CF}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  const data = await res.json();
  if (!res.ok || data.success === false) {
    throw new Error(data.errors?.[0]?.message || `Cloudflare hatası (${res.status})`);
  }
  return data.result;
}

export const cloudflare = {
  listZones: () => cf('/zones?per_page=50'),
  listRecords: (zoneId: string) => cf(`/zones/${zoneId}/dns_records?per_page=200`),
  createRecord: (zoneId: string, body: unknown) => cf(`/zones/${zoneId}/dns_records`, { method: 'POST', body: JSON.stringify(body) }),
  updateRecord: (zoneId: string, recId: string, body: unknown) => cf(`/zones/${zoneId}/dns_records/${recId}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteRecord: (zoneId: string, recId: string) => cf(`/zones/${zoneId}/dns_records/${recId}`, { method: 'DELETE' }),
};
