import jwt from 'jsonwebtoken';
import { getUserByName, getApiTokenByHash, touchApiToken, UserDoc } from './server/db';
import { hashApiToken } from './server/auth/apitoken';

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES = process.env.JWT_EXPIRES || '8h';
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET tanımlı değil! .env kontrol edin.');
}

export interface TokenPayload { id: string; username: string; tv: number; }

export function signToken(user: UserDoc): string {
  return jwt.sign(
    { id: user._id, username: user.username, tv: user.tokenVersion ?? 0 },
    JWT_SECRET as string,
    { expiresIn: JWT_EXPIRES } as jwt.SignOptions,
  );
}

// Route handler'larda kullanılır. Başarılıysa payload döner, değilse null.
export async function requireAuth(req: Request): Promise<TokenPayload | null> {
  const header = req.headers.get('authorization');
  const token = header && header.split(' ')[1];
  if (!token) return null;
  // API token desteği: zpat_ prefix'li token'lar hash ile kontrol edilir.
  if (token.startsWith('zpat_')) {
    const rec = getApiTokenByHash(hashApiToken(token));
    if (!rec) return null;
    touchApiToken(rec.id, new Date().toISOString());
    return { id: 'apitoken:' + rec.id, username: 'api:' + rec.name, tv: 0 };
  }
  // Mevcut JWT akışı (değişmez).
  try {
    const payload = jwt.verify(token, JWT_SECRET as string) as TokenPayload;
    const user = getUserByName(payload.username);
    if (!user || (user.tokenVersion ?? 0) !== payload.tv) return null; // şifre değişti → eski token geçersiz
    return payload;
  } catch {
    return null;
  }
}

export function unauthorized(message = 'Yetkisiz') {
  return Response.json({ error: message }, { status: 401 });
}
