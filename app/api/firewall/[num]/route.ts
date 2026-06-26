import { requireAuth, unauthorized } from '@/lib/auth';
import { ufwStatus, ufwDeleteByNum } from '@/lib/server/firewall/exec';
import { isProtectedPort } from '@/lib/server/firewall/ufw';

export const runtime = 'nodejs';

export async function DELETE(req: Request, { params }: { params: Promise<{ num: string }> }) {
  if (!(await requireAuth(req))) return unauthorized();
  try {
    const { num: numStr } = await params;
    const num = parseInt(numStr, 10);
    if (!Number.isFinite(num) || num < 1) {
      return Response.json({ error: 'Geçersiz kural numarası' }, { status: 400 });
    }
    // Lockout protection: fetch current status and check the rule before deleting
    const current = await ufwStatus();
    const rule = current.rules.find(r => r.num === num);
    if (!rule) {
      return Response.json({ error: 'Kural bulunamadı' }, { status: 404 });
    }
    if (rule.action === 'ALLOW') {
      const portMatch = rule.to.match(/^(\d+)\//);
      const port = portMatch ? parseInt(portMatch[1], 10) : NaN;
      if (Number.isFinite(port) && isProtectedPort(port)) {
        return Response.json({ error: 'Korumalı port kuralı silinemez (kilitlenme koruması)' }, { status: 400 });
      }
    }
    await ufwDeleteByNum(num);
    return Response.json({ status: await ufwStatus() });
  } catch (e: unknown) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
