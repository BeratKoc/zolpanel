import { getSetting, setSetting, deleteSetting } from '../db';
import { encryptSecret, decryptSecret } from '../secrets';

interface TotpRecord {
  secret: string; // encrypted
  enabled: boolean;
}

function totpKey(username: string): string {
  return `totp:${username}`;
}

export function is2faEnabled(username: string): boolean {
  const raw = getSetting(totpKey(username));
  if (!raw) return false;
  try {
    const rec = JSON.parse(raw) as TotpRecord;
    return rec.enabled === true;
  } catch {
    return false;
  }
}

export function set2faSecret(username: string, base32: string): void {
  const rec: TotpRecord = { secret: encryptSecret(base32), enabled: false };
  setSetting(totpKey(username), JSON.stringify(rec));
}

export function get2faSecret(username: string): string | null {
  const raw = getSetting(totpKey(username));
  if (!raw) return null;
  try {
    const rec = JSON.parse(raw) as TotpRecord;
    return decryptSecret(rec.secret);
  } catch {
    return null;
  }
}

export function enable2fa(username: string): void {
  const raw = getSetting(totpKey(username));
  if (!raw) return;
  const rec = JSON.parse(raw) as TotpRecord;
  rec.enabled = true;
  setSetting(totpKey(username), JSON.stringify(rec));
}

export function disable2fa(username: string): void {
  deleteSetting(totpKey(username));
}
