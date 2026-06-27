import crypto from 'node:crypto';

const KEY = crypto.createHash('sha256').update(process.env.JWT_SECRET || 'zolpanel-dev-fallback').digest();

/** AES-256-GCM ile şifreler → "iv:tag:cipher" (base64). */
export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join(':');
}

/** "iv:tag:cipher" çözer; bozuk/oynanmışsa throw. */
export function decryptSecret(blob: string): string {
  const [ivB, tagB, encB] = blob.split(':');
  if (!ivB || !tagB || !encB) throw new Error('Bozuk şifreli veri');
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, Buffer.from(ivB, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(encB, 'base64')), decipher.final()]).toString('utf8');
}
