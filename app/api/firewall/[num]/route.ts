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
      // `to` may be '22/tcp' (proto belirtilmiş) veya çıplak '22' (proto: any) → ikisini de yakala.
      const port = parseInt(rule.to.split('/')[0], 10);
      if (Number.isInteger(port) && isProtectedPort(port)) {
        return Response.json({ error: 'Korumalı port kuralı silinemez (kilitlenme koruması)' }, { status: 400 });
      }
    }
    await ufwDeleteByNum(num);
    return Response.json({ status: await ufwStatus() });
  } catch (e: unknown) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
