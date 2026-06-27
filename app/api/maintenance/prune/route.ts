import { requireAuth, unauthorized } from '@/lib/auth';
import { dockerPrune } from '@/lib/server/maintenance/exec';

export const runtime = 'nodejs';

const ALLOWED_TARGETS = new Set(['images', 'system', 'builder']);

export async function POST(req: Request) {
  if (!(await requireAuth(req))) return unauthorized();
  try {
    const body = await req.json() as { target?: string };
    const { target } = body;
    if (!target || !ALLOWED_TARGETS.has(target)) {
      return Response.json({ error: 'target must be one of: images, system, builder' }, { status: 400 });
    }
    const output = await dockerPrune(target as 'images' | 'system' | 'builder');
    return Response.json({ output: output.slice(0, 200000) });
  } catch (e: unknown) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
