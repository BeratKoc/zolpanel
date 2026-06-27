import { randomUUID } from 'node:crypto';
import { requireSession, unauthorized } from '@/lib/auth';
import { listApiTokens, insertApiToken } from '@/lib/server/db';
import { generateApiToken } from '@/lib/server/auth/apitoken';

export const runtime = 'nodejs';

// GET /api/auth/tokens → { tokens: [...] }
export async function GET(req: Request) {
  const auth = await requireSession(req);
  if (!auth) return unauthorized();
  return Response.json({ tokens: listApiTokens() });
}

// POST /api/auth/tokens { name } → { token } (bir kez gösterilir)
export async function POST(req: Request) {
  const auth = await requireSession(req);
  if (!auth) return unauthorized();
  const body = await req.json().catch(() => ({})) as { name?: string };
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return Response.json({ error: 'name gerekli' }, { status: 400 });
  if (name.length > 100) return Response.json({ error: 'name en fazla 100 karakter olabilir' }, { status: 400 });
  const { token, hash } = generateApiToken();
  insertApiToken({ id: randomUUID(), name, tokenHash: hash, createdAt: new Date().toISOString() });
  return Response.json({ token });
}
