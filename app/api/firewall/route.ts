import { requireAuth, unauthorized } from '@/lib/auth';
import { validateRule } from '@/lib/server/firewall/ufw';
import { ufwStatus, ufwAdd } from '@/lib/server/firewall/exec';
import type { RuleInput } from '@/lib/server/firewall/ufw';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  if (!(await requireAuth(req))) return unauthorized();
  try {
    return Response.json({ status: await ufwStatus() });
  } catch (e: unknown) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!(await requireAuth(req))) return unauthorized();
  try {
    const body = await req.json() as { rule: RuleInput };
    const { rule } = body;
    const msg = validateRule(rule);
    if (msg) return Response.json({ error: msg }, { status: 400 });
    await ufwAdd(rule);
    return Response.json({ status: await ufwStatus() });
  } catch (e: unknown) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
