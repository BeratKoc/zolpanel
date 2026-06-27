import crypto from 'node:crypto';

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Decode(s: string): Buffer {
  const clean = s.replace(/=+$/, '').toUpperCase().replace(/\s/g, '');
  let bits = '';
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx === -1) continue;
    bits += idx.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

function hotp(key: Buffer, counter: number, digits: number): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);
  return (code % 10 ** digits).toString().padStart(digits, '0');
}

export function generateTotp(secretBase32: string, timeMs: number, opts: { digits?: number; period?: number } = {}): string {
  const digits = opts.digits ?? 6, period = opts.period ?? 30;
  const counter = Math.floor(timeMs / 1000 / period);
  return hotp(base32Decode(secretBase32), counter, digits);
}

/** Saat kaymasına karşı ±window periyot kontrol eder. */
export function verifyTotp(secretBase32: string, code: string, timeMs: number, window = 1): boolean {
  const digits = code.length, period = 30;
  const key = base32Decode(secretBase32);
  const base = Math.floor(timeMs / 1000 / period);
  for (let w = -window; w <= window; w++) {
    if (hotp(key, base + w, digits) === code) return true;
  }
  return false;
}

export function randomBase32Secret(len = 20): string {
  const bytes = crypto.randomBytes(len);
  let bits = '';
  for (const b of bytes) bits += b.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i + 5 <= bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)];
  return out;
}

export function otpauthUri(user: string, secretBase32: string): string {
  return `otpauth://totp/Zolpanel:${encodeURIComponent(user)}?secret=${secretBase32}&issuer=Zolpanel`;
}
