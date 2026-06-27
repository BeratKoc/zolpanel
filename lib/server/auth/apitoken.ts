import crypto from 'node:crypto';
export function hashApiToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
export function generateApiToken(): { token: string; hash: string } {
  const token = 'zpat_' + crypto.randomBytes(24).toString('base64url');
  return { token, hash: hashApiToken(token) };
}
