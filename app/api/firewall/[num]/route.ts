import { requireAuth, unauthorized } from '@/lib/auth';
import { ufwStatus, ufwDeleteByNum } from '@/lib/server/firewall/exec';

export const runtime = 'nodejs';

export async function DELETE(req: Request, { params }: { params: Promise<{ num: string }> }) {
  if (!(await requireAuth(req))) return unauthorized();
  try {
    const { num: numStr } = await params;
    const num = parseInt(numStr, 10);
    if (!Number.isFinite(num) || num < 1) {
      return Response.json({ error: 'Geçersiz kural numarası' }, { status: 400 });
    }
    // SSH lockout protection: fetch current status and check the rule
    const current = await ufwStatus();
    const rule = current.rules.find(r => r.num === num);
    if (rule && rule.action === 'ALLOW' && /^22\/tcp$/i.test(rule.to)) {
      return Response.json({ error: 'SSH kuralı silinemez (kilitlenme koruması)' }, { status: 400 });
    }
    await ufwDeleteByNum(num);
    return Response.json({ status: await ufwStatus() });
  } catch (e: unknown) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
